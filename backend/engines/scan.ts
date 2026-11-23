/** X1's bounded, deterministic rule language. No JavaScript, SQL or dynamic code evaluation. */
export const RULE_VERSION = "x1-rule-1" as const;
export type Category =
  | "Technical"
  | "Fundamental"
  | "Derivatives"
  | "Macroeconomic"
  | "Events"
  | "Sentiment"
  | "Custom";
export type RuleStatus = "PASS" | "FAIL" | "UNKNOWN";
export type Ast =
  | { kind: "number"; value: number }
  | { kind: "field"; name: string }
  | { kind: "unary"; op: "-" | "NOT"; arg: Ast }
  | { kind: "binary"; op: string; left: Ast; right: Ast }
  | { kind: "call"; name: string; args: Ast[] };
export type CanonicalRule = {
  version: typeof RULE_VERSION;
  ast: Ast;
  formula: string;
  dependencies: string[];
  categories: Category[];
};
export type SimpleRule = {
  id?: string;
  field: string;
  op: ">" | ">=" | "<" | "<=" | "==" | "!=";
  value: number;
};
export type ScanObservation = {
  eventAt: string;
  knownAt: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  fields?: Record<string, number | null>;
};
export type ScanDataset = {
  instrumentId: string;
  currency?: string;
  source: string;
  permitted: boolean;
  frequency?: string;
  maxAgeMs?: number;
  observations: ScanObservation[];
};
export type ScanResult = {
  instrumentId: string;
  status: RuleStatus;
  reasons: string[];
  latestEventAt: string | null;
  source: string;
};
export type ScanReport = {
  version: typeof RULE_VERSION;
  asOf: string;
  formula: string;
  total: number;
  eligible: number;
  matches: number;
  failed: number;
  unknown: number;
  results: ScanResult[];
};

type Unit = string;
const FIELDS: Record<string, { unit: Unit; category: Category }> = {
  open: { unit: "price", category: "Technical" },
  high: { unit: "price", category: "Technical" },
  low: { unit: "price", category: "Technical" },
  close: { unit: "price", category: "Technical" },
  volume: { unit: "volume", category: "Technical" },
  pe: { unit: "scalar", category: "Fundamental" },
  pb: { unit: "scalar", category: "Fundamental" },
  roe: { unit: "percent", category: "Fundamental" },
  roce: { unit: "percent", category: "Fundamental" },
  revenuegrowth: { unit: "percent", category: "Fundamental" },
  earningsgrowth: { unit: "percent", category: "Fundamental" },
  debtequity: { unit: "scalar", category: "Fundamental" },
  freecashflow: { unit: "money", category: "Fundamental" },
  openinterest: { unit: "contracts", category: "Derivatives" },
  iv: { unit: "percent", category: "Derivatives" },
  delta: { unit: "scalar", category: "Derivatives" },
  gamma: { unit: "inverse-price", category: "Derivatives" },
  policyrate: { unit: "percent", category: "Macroeconomic" },
  cpi: { unit: "percent", category: "Macroeconomic" },
  gdp: { unit: "percent", category: "Macroeconomic" },
  yield10y: { unit: "percent", category: "Macroeconomic" },
  earningsindays: { unit: "days", category: "Events" },
  dividend: { unit: "price", category: "Events" },
  sentiment: { unit: "scalar", category: "Sentiment" },
};
const ALIASES: Record<string, string> = {
  sma20: "sma(close, 20)",
  ema20: "ema(close, 20)",
  rsi14: "rsi(close, 14)",
  macd: "macd(close, 12, 26)",
  atr14: "atr(14)",
  changepct: "change(close, 1)",
};
const PRECEDENCE: Record<string, number> = {
  OR: 1,
  AND: 2,
  "==": 3,
  "!=": 3,
  ">": 3,
  ">=": 3,
  "<": 3,
  "<=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
};
const FUNCTIONS = new Set([
  "all",
  "any",
  "not",
  "sma",
  "ema",
  "rsi",
  "macd",
  "macdsignal",
  "macdhist",
  "atr",
  "bbupper",
  "bblower",
  "bbmid",
  "bbwidth",
  "rollingmin",
  "rollingmax",
  "rollingmedian",
  "adx",
  "plusdi",
  "minusdi",
  "stochk",
  "stochd",
  "obv",
  "mfi",
  "supertrend",
  "supertrenddir",
  "abs",
  "min",
  "max",
  "change",
  "lag",
  "crossesabove",
  "crossesbelow",
  "within",
  "range",
]);
const COMPARISONS = new Set(["==", "!=", ">", ">=", "<", "<="]);
const LIMITS = {
  characters: 4000,
  tokens: 1000,
  nodes: 256,
  depth: 24,
  lookback: 250,
  datasets: 1000,
  observations: 5000,
  steps: 2500000,
};

export class FormulaError extends Error {
  readonly position: number;
  readonly line: number;
  readonly column: number;
  constructor(message: string, source = "", position = 0) {
    const prefix = source.slice(0, position);
    const line = prefix.split("\n").length,
      column = position - (prefix.lastIndexOf("\n") + 1) + 1;
    super(`${message} (line ${line}, column ${column})`);
    this.name = "FormulaError";
    this.position = position;
    this.line = line;
    this.column = column;
  }
}

type Token = { value: string; at: number };
function tokenize(source: string): Token[] {
  if (
    typeof source !== "string" ||
    !source.trim() ||
    source.length > LIMITS.characters
  )
    throw new FormulaError("Enter a rule of 1–4,000 characters.");
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }
    const match =
      /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z][A-Za-z0-9_]*|^(?:>=|<=|==|!=|&&|\|\|)|^[()+\-*/,<>!]/.exec(
        source.slice(i),
      );
    if (!match)
      throw new FormulaError(
        "Unsupported character; only the documented rule language is accepted.",
        source,
        i,
      );
    tokens.push({ value: match[0], at: i });
    i += match[0].length;
    if (tokens.length > LIMITS.tokens)
      throw new FormulaError("Rule has too many tokens.", source, i);
  }
  return tokens;
}
function lookback(node: Ast, min = 1): number {
  if (
    node.kind !== "number" ||
    !Number.isInteger(node.value) ||
    node.value < min ||
    node.value > LIMITS.lookback
  )
    throw new Error(
      `Lookback must be an integer from ${min} to ${LIMITS.lookback}.`,
    );
  return node.value;
}
function isLiteral(node: Ast): boolean {
  return (
    node.kind === "number" ||
    (node.kind === "unary" && node.op === "-" && isLiteral(node.arg))
  );
}
function isConstant(node: Ast): boolean {
  return (
    isLiteral(node) ||
    (node.kind === "binary" &&
      ["+", "-", "*", "/"].includes(node.op) &&
      isConstant(node.left) &&
      isConstant(node.right)) ||
    (node.kind === "call" &&
      ["abs", "min", "max"].includes(node.name) &&
      node.args.every(isConstant))
  );
}
function compatible(a: Unit, b: Unit, left: Ast, right: Ast): boolean {
  return (
    a === b ||
    (a === "scalar" && isConstant(left)) ||
    (b === "scalar" && isConstant(right))
  );
}

/** Also validates externally supplied ASTs before any evaluation; accepts only known operations. */
function inspectAst(ast: Ast): {
  unit: Unit;
  dependencies: string[];
  categories: Category[];
} {
  let count = 0;
  const dependencies = new Set<string>(),
    categories = new Set<Category>();
  function unit(a: Ast, depth = 0): Unit {
    if (
      !a ||
      typeof a !== "object" ||
      ++count > LIMITS.nodes ||
      depth > LIMITS.depth
    )
      throw new Error("Rule complexity exceeds the supported limit.");
    if (a.kind === "number") {
      if (!Number.isFinite(a.value) || Math.abs(a.value) > 1e15)
        throw new Error("Numbers must be finite and within ±1e15.");
      return "scalar";
    }
    if (a.kind === "field") {
      if (!Object.hasOwn(FIELDS, a.name))
        throw new Error(`Unknown field: ${a.name}`);
      dependencies.add(a.name);
      categories.add(FIELDS[a.name].category);
      return FIELDS[a.name].unit;
    }
    if (a.kind === "unary") {
      const u = unit(a.arg, depth + 1);
      if (a.op === "NOT") {
        if (u !== "boolean") throw new Error("NOT requires a condition.");
        return "boolean";
      }
      if (a.op !== "-" || u === "boolean")
        throw new Error("Unary minus requires a number.");
      categories.add("Custom");
      return u;
    }
    if (a.kind === "binary") {
      if (!Object.hasOwn(PRECEDENCE, a.op))
        throw new Error("Unknown binary operator.");
      const l = unit(a.left, depth + 1),
        r = unit(a.right, depth + 1);
      if (a.op === "AND" || a.op === "OR") {
        if (l !== "boolean" || r !== "boolean")
          throw new Error("AND/OR require conditions.");
        return "boolean";
      }
      if (l === "boolean" || r === "boolean")
        throw new Error("A condition cannot be used as a number.");
      if (COMPARISONS.has(a.op) || a.op === "+" || a.op === "-") {
        if (!compatible(l, r, a.left, a.right))
          throw new Error(`Incompatible units: ${l} and ${r}.`);
        return COMPARISONS.has(a.op)
          ? "boolean"
          : l === "scalar" && isConstant(a.left)
            ? r
            : l;
      }
      categories.add("Custom");
      if (a.op === "*")
        return l === "scalar" ? r : r === "scalar" ? l : `${l}*${r}`;
      return l === r ? "scalar" : r === "scalar" ? l : `${l}/${r}`;
    }
    if (
      a.kind !== "call" ||
      !FUNCTIONS.has(a.name) ||
      !Array.isArray(a.args) ||
      a.args.length > 32
    )
      throw new Error("Unknown function or invalid arguments.");
    const args = a.args,
      u = args.map((x) => unit(x, depth + 1)),
      n = args.length;
    if (["all", "any"].includes(a.name)) {
      if (n < 1 || u.some((x) => x !== "boolean"))
        throw new Error("ALL/ANY require one or more conditions.");
      return "boolean";
    }
    if (a.name === "not") {
      if (n !== 1 || u[0] !== "boolean")
        throw new Error("NOT requires one condition.");
      return "boolean";
    }
    if (a.name === "within") {
      if (n !== 2 || u[0] !== "boolean")
        throw new Error("within(condition, lookback) requires a condition.");
      lookback(args[1]);
      return "boolean";
    }
    if (a.name === "range") {
      if (
        n !== 3 ||
        u.some((x) => x === "boolean") ||
        !compatible(u[0], u[1], args[0], args[1]) ||
        !compatible(u[0], u[2], args[0], args[2])
      )
        throw new Error(
          "range(value, lower, upper) requires compatible numbers.",
        );
      return "boolean";
    }
    if (["crossesabove", "crossesbelow"].includes(a.name)) {
      if (
        n !== 2 ||
        u.includes("boolean") ||
        !compatible(u[0], u[1], args[0], args[1])
      )
        throw new Error("Crosses require two compatible numeric series.");
      return "boolean";
    }
    if (a.name === "atr") {
      if (n !== 1) throw new Error("atr(lookback) requires one argument.");
      lookback(args[0], 2);
      for (const field of ["high", "low", "close"]) dependencies.add(field);
      categories.add("Technical");
      return "price";
    }
    if (a.name === "abs") {
      if (n !== 1 || u[0] === "boolean")
        throw new Error("abs requires one numeric argument.");
      return u[0];
    }
    if (a.name === "min" || a.name === "max") {
      if (
        n !== 2 ||
        u.includes("boolean") ||
        !compatible(u[0], u[1], args[0], args[1])
      )
        throw new Error("min/max require compatible numeric arguments.");
      return u[0] === "scalar" && isConstant(args[0]) ? u[1] : u[0];
    }
    if (["sma", "ema", "rsi", "change", "lag"].includes(a.name)) {
      if (n !== 2 || u[0] === "boolean")
        throw new Error(`${a.name} requires a numeric series and lookback.`);
      lookback(args[1], ["sma", "ema", "rsi"].includes(a.name) ? 2 : 1);
      categories.add("Technical");
      return a.name === "rsi" || a.name === "change" ? "percent" : u[0];
    }
    if (a.name === "macd") {
      if (n !== 3 || u[0] === "boolean")
        throw new Error("macd(series, fast, slow) requires three arguments.");
      const fast = lookback(args[1], 2),
        slow = lookback(args[2], 2);
      if (fast >= slow)
        throw new Error(
          "MACD fast lookback must be smaller than slow lookback.",
        );
      categories.add("Technical");
      return u[0];
    }
    if (a.name === "macdsignal" || a.name === "macdhist") {
      if (n !== 4 || u[0] === "boolean")
        throw new Error(
          `${a.name}(series, fast, slow, signal) requires four arguments.`,
        );
      const fast = lookback(args[1], 2),
        slow = lookback(args[2], 2);
      lookback(args[3], 2);
      if (fast >= slow)
        throw new Error(
          "MACD fast lookback must be smaller than slow lookback.",
        );
      categories.add("Technical");
      return u[0];
    }
    if (a.name === "bbmid") {
      if (n !== 2 || u[0] === "boolean")
        throw new Error("bbmid(series, lookback) requires two arguments.");
      lookback(args[1], 2);
      categories.add("Technical");
      return u[0];
    }
    if (a.name === "bbupper" || a.name === "bblower" || a.name === "bbwidth") {
      if (n !== 3 || u[0] === "boolean" || u[2] === "boolean")
        throw new Error(
          `${a.name}(series, lookback, multiplier) requires three arguments.`,
        );
      lookback(args[1], 2);
      if (args[2].kind !== "number" || args[2].value <= 0 || args[2].value > 10)
        throw new Error("Bollinger multiplier must be a number in (0, 10].");
      categories.add("Technical");
      return a.name === "bbwidth" ? "percent" : u[0];
    }
    if (
      a.name === "rollingmin" ||
      a.name === "rollingmax" ||
      a.name === "rollingmedian"
    ) {
      if (n !== 2 || u[0] === "boolean")
        throw new Error(`${a.name}(series, lookback) requires two arguments.`);
      lookback(args[1], 2);
      categories.add("Technical");
      return u[0];
    }
    if (a.name === "adx" || a.name === "plusdi" || a.name === "minusdi") {
      if (n !== 1)
        throw new Error(`${a.name}(lookback) requires one argument.`);
      lookback(args[0], 2);
      for (const field of ["high", "low", "close"]) dependencies.add(field);
      categories.add("Technical");
      return "percent";
    }
    if (a.name === "stochk") {
      if (n !== 2)
        throw new Error("stochk(kPeriod, smoothK) requires two arguments.");
      lookback(args[0], 2);
      lookback(args[1], 1);
      for (const field of ["high", "low", "close"]) dependencies.add(field);
      categories.add("Technical");
      return "percent";
    }
    if (a.name === "stochd") {
      if (n !== 3)
        throw new Error(
          "stochd(kPeriod, smoothK, smoothD) requires three arguments.",
        );
      lookback(args[0], 2);
      lookback(args[1], 1);
      lookback(args[2], 1);
      for (const field of ["high", "low", "close"]) dependencies.add(field);
      categories.add("Technical");
      return "percent";
    }
    if (a.name === "obv") {
      if (n !== 0) throw new Error("obv() takes no arguments.");
      for (const field of ["close", "volume"]) dependencies.add(field);
      categories.add("Technical");
      return "volume";
    }
    if (a.name === "mfi") {
      if (n !== 1) throw new Error("mfi(lookback) requires one argument.");
      lookback(args[0], 2);
      for (const field of ["high", "low", "close", "volume"])
        dependencies.add(field);
      categories.add("Technical");
      return "percent";
    }
    if (a.name === "supertrend" || a.name === "supertrenddir") {
      if (n !== 2 || u[1] === "boolean")
        throw new Error(
          `${a.name}(atrPeriod, multiplier) requires two arguments.`,
        );
      lookback(args[0], 2);
      if (args[1].kind !== "number" || args[1].value <= 0 || args[1].value > 10)
        throw new Error("Supertrend multiplier must be a number in (0, 10].");
      for (const field of ["high", "low", "close"]) dependencies.add(field);
      categories.add("Technical");
      return a.name === "supertrend" ? "price" : "scalar";
    }
    throw new Error("Unsupported function.");
  }
  const result = unit(ast);
  return {
    unit: result,
    dependencies: [...dependencies].sort(),
    categories: [...categories].sort(),
  };
}

export function renderFormula(input: CanonicalRule | Ast): string {
  const ast = "ast" in input ? input.ast : input;
  function render(a: Ast): string {
    if (a.kind === "number") return String(a.value);
    if (a.kind === "field") return a.name;
    if (a.kind === "unary")
      return a.op === "NOT" ? `NOT(${render(a.arg)})` : `(-${render(a.arg)})`;
    if (a.kind === "binary")
      return `(${render(a.left)} ${a.op} ${render(a.right)})`;
    return `${a.name}(${a.args.map(render).join(", ")})`;
  }
  inspectAst(ast);
  return render(ast);
}

/** Numeric parameters are resolved into immutable literals; a saved rule has no mutable bindings. */
export function compileFormula(
  source: string,
  parameters: Record<string, number> = {},
): CanonicalRule {
  const tokens = tokenize(source);
  let index = 0,
    nodes = 0;
  const safeParameters: Record<string, number> = Object.create(null);
  if (
    !parameters ||
    typeof parameters !== "object" ||
    Object.keys(parameters).length > 32
  )
    throw new FormulaError("Use at most 32 numeric parameters.");
  for (const [key, value] of Object.entries(parameters)) {
    if (
      !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key) ||
      Object.hasOwn(safeParameters, key.toLowerCase()) ||
      Object.hasOwn(FIELDS, key.toLowerCase()) ||
      FUNCTIONS.has(key.toLowerCase()) ||
      Object.hasOwn(ALIASES, key.toLowerCase()) ||
      ["and", "or"].includes(key.toLowerCase()) ||
      !Number.isFinite(value) ||
      Math.abs(value) > 1e15
    )
      throw new FormulaError(
        "Parameter names must be distinct from fields/functions and values must be finite.",
      );
    safeParameters[key.toLowerCase()] = value;
  }
  const current = () => tokens[index]?.value;
  const fail = (message: string): never => {
    throw new FormulaError(message, source, tokens[index]?.at ?? source.length);
  };
  function atom(depth: number): Ast {
    if (depth > LIMITS.depth || ++nodes > LIMITS.nodes)
      fail("Rule complexity exceeds the supported limit.");
    const token = tokens[index++];
    if (!token) fail("Expression is incomplete.");
    const value = token.value,
      lower = value.toLowerCase();
    if (value === "(") {
      const a = expr(0, depth + 1);
      if (current() !== ")") fail("Missing closing parenthesis.");
      index++;
      return a;
    }
    if (value === "-") return { kind: "unary", op: "-", arg: atom(depth + 1) };
    if (value === "!" || (lower === "not" && current() !== "("))
      return { kind: "unary", op: "NOT", arg: expr(3, depth + 1) };
    if (/^(?:\d|\.)/.test(value)) {
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > 1e15)
        fail("Number is out of range.");
      return { kind: "number", value: n };
    }
    if (current() === "(") {
      if (!FUNCTIONS.has(lower)) fail(`Unknown function: ${value}.`);
      index++;
      const args: Ast[] = [];
      if (current() !== ")") {
        args.push(expr(0, depth + 1));
        while (current() === ",") {
          index++;
          args.push(expr(0, depth + 1));
          if (args.length > 32) fail("Too many function arguments.");
        }
      }
      if (current() !== ")") fail("Missing function closing parenthesis.");
      index++;
      return { kind: "call", name: lower, args };
    }
    if (Object.hasOwn(safeParameters, lower))
      return { kind: "number", value: safeParameters[lower] };
    if (Object.hasOwn(ALIASES, lower)) {
      const alias = compileFormula(`${ALIASES[lower]} >= 0`).ast;
      return alias.kind === "binary" ? alias.left : fail("Invalid alias.");
    }
    if (!Object.hasOwn(FIELDS, lower)) fail(`Unknown field: ${value}.`);
    return { kind: "field", name: lower };
  }
  function expr(min: number, depth: number): Ast {
    let left = atom(depth);
    while (index < tokens.length) {
      const raw = current()!,
        op =
          raw === "&&"
            ? "AND"
            : raw === "||"
              ? "OR"
              : /^(and|or)$/i.test(raw)
                ? raw.toUpperCase()
                : raw,
        p = PRECEDENCE[op];
      if (p === undefined || p < min) break;
      index++;
      left = { kind: "binary", op, left, right: expr(p + 1, depth + 1) };
    }
    return left;
  }
  const ast = expr(0, 0);
  if (index !== tokens.length) fail(`Unexpected token: ${current()}.`);
  let checked: ReturnType<typeof inspectAst>;
  try {
    checked = inspectAst(ast);
    if (checked.unit !== "boolean")
      throw new Error(
        "A scan rule must end in a comparison or boolean condition.",
      );
  } catch (error) {
    throw new FormulaError(
      error instanceof Error ? error.message : "Invalid typed rule.",
      source,
      tokens[index - 1]?.at ?? 0,
    );
  }
  return {
    version: RULE_VERSION,
    ast,
    formula: renderFormula(ast),
    dependencies: checked.dependencies,
    categories: checked.categories,
  };
}

export function compileRules(
  blocks: SimpleRule[],
  join: "ALL" | "ANY" = "ALL",
): CanonicalRule {
  if (
    !Array.isArray(blocks) ||
    !blocks.length ||
    blocks.length > 32 ||
    !["ALL", "ANY"].includes(join)
  )
    throw new Error("Add 1–32 conditions and choose ALL or ANY.");
  const formulas = blocks.map((b) => {
    if (
      !b ||
      typeof b.field !== "string" ||
      (!Object.hasOwn(FIELDS, b.field.toLowerCase()) &&
        !Object.hasOwn(ALIASES, b.field.toLowerCase())) ||
      !COMPARISONS.has(b.op) ||
      !Number.isFinite(b.value)
    )
      throw new Error("Invalid Simple condition.");
    return `${b.field} ${b.op} ${b.value}`;
  });
  return compileFormula(`${join}(${formulas.join(", ")})`);
}

/** Only losslessly representable flat literal comparisons return blocks. The original rule stays intact. */
export function toSimpleRules(
  rule: CanonicalRule,
): { blocks: SimpleRule[]; join: "ALL" | "ANY" } | null {
  if (inspectAst(rule.ast).unit !== "boolean")
    throw new Error("Expected a boolean rule.");
  let nodes: Ast[],
    join: "ALL" | "ANY" = "ALL";
  if (rule.ast.kind === "call" && ["all", "any"].includes(rule.ast.name)) {
    nodes = rule.ast.args;
    join = rule.ast.name === "all" ? "ALL" : "ANY";
  } else nodes = [rule.ast];
  const blocks: SimpleRule[] = [];
  for (const n of nodes) {
    if (n.kind !== "binary" || !COMPARISONS.has(n.op) || !isLiteral(n.right))
      return null;
    const value =
      n.right.kind === "number"
        ? n.right.value
        : n.right.kind === "unary" && n.right.arg.kind === "number"
          ? -n.right.arg.value
          : NaN;
    if (!Number.isFinite(value)) return null;
    let field: string | null = n.left.kind === "field" ? n.left.name : null;
    if (!field)
      for (const [alias, expression] of Object.entries(ALIASES)) {
        const a = compileFormula(`${expression} >= 0`).ast;
        if (
          a.kind === "binary" &&
          JSON.stringify(n.left) === JSON.stringify(a.left)
        ) {
          field = alias;
          break;
        }
      }
    if (!field) return null;
    blocks.push({ field, op: n.op as SimpleRule["op"], value });
  }
  return { blocks, join };
}

class MissingData extends Error {}
type Value = number | boolean;
function timestamp(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return NaN;
  const date = value.slice(0, 10),
    midnight = Date.parse(date + "T00:00:00Z");
  if (
    !Number.isFinite(midnight) ||
    new Date(midnight).toISOString().slice(0, 10) !== date
  )
    return NaN;
  return Date.parse(value);
}

/** Three-valued boolean semantics; UNKNOWN is never silently converted to FAIL. */
/** Completed observations needed to evaluate every branch with all source fields present. */
export function requiredScanBars(ast: Ast, cache = new WeakMap<Ast, number>()): number {
  const cached = cache.get(ast);
  if (cached !== undefined) return cached;
  const required = (node: Ast) => requiredScanBars(node, cache);
  let bars = 1;
  if (ast.kind === "unary") bars = required(ast.arg);
  if (ast.kind === "binary") bars = Math.max(required(ast.left), required(ast.right));
  if (ast.kind === "call") {
    const args = ast.args;
    const period = (index: number) => lookback(args[index]);
    const series = () => required(args[0]);
    switch (ast.name) {
      case "crossesabove":
      case "crossesbelow":
        bars = 1 + Math.max(required(args[0]), required(args[1]));
        break;
      case "within": bars = series() + period(1) - 1; break;
      case "lag":
      case "change":
      case "rsi": bars = series() + period(1); break;
      case "sma":
      case "ema":
      case "bbmid":
      case "bbupper":
      case "bblower":
      case "bbwidth":
      case "rollingmin":
      case "rollingmax":
      case "rollingmedian": bars = series() + period(1) - 1; break;
      case "macd": bars = series() + period(2) - 1; break;
      case "macdsignal":
      case "macdhist": bars = series() + period(2) + period(3) - 2; break;
      case "atr":
      case "plusdi":
      case "minusdi":
      case "mfi":
      case "supertrend":
      case "supertrenddir": bars = period(0) + 1; break;
      case "adx": bars = 2 * period(0); break;
      case "stochk": bars = period(0) + period(1) - 1; break;
      case "stochd": bars = period(0) + period(1) + period(2) - 2; break;
      case "obv": bars = 2; break;
      default: bars = Math.max(1, ...args.map(required));
    }
  }
  cache.set(ast, bars);
  return bars;
}

export function evaluateScan(
  rule: CanonicalRule,
  datasets: ScanDataset[],
  asOf: string,
): ScanReport {
  if (
    !rule ||
    rule.version !== RULE_VERSION ||
    inspectAst(rule.ast).unit !== "boolean"
  )
    throw new Error("Unsupported rule version or invalid rule.");
  const at = timestamp(asOf);
  if (!Number.isFinite(at))
    throw new Error("Use a valid as-of timestamp with an explicit timezone.");
  if (!Array.isArray(datasets) || datasets.length > LIMITS.datasets)
    throw new Error(`A scan supports up to ${LIMITS.datasets} datasets.`);
  const ids = new Set<string>();
  const barRequirements = new WeakMap<Ast, number>();
  for (const d of datasets) {
    if (
      !d ||
      typeof d.instrumentId !== "string" ||
      !d.instrumentId ||
      d.instrumentId.length > 160 ||
      ids.has(d.instrumentId)
    )
      throw new Error("Datasets must have unique instrument IDs.");
    ids.add(d.instrumentId);
  }
  const results: ScanResult[] = datasets.map((dataset) => {
    const result: ScanResult = {
      instrumentId: dataset.instrumentId,
      status: "UNKNOWN",
      reasons: [],
      latestEventAt: null,
      source:
        typeof dataset.source === "string" ? dataset.source : "Unavailable",
    };
    try {
      if (dataset.permitted !== true)
        throw new MissingData(
          "Analysis rights are not confirmed for this dataset.",
        );
      if (
        !Array.isArray(dataset.observations) ||
        dataset.observations.length > LIMITS.observations
      )
        throw new MissingData(
          "Dataset exceeds the supported observation limit.",
        );
      let previous = -Infinity;
      const observations: ScanObservation[] = [];
      for (const o of dataset.observations) {
        const t = timestamp(o.eventAt),
          k = timestamp(o.knownAt);
        if (
          !Number.isFinite(t) ||
          !Number.isFinite(k) ||
          k < t ||
          t <= previous
        )
          throw new MissingData(
            "Observation timestamps must be unique, ordered, timezone-qualified, and known at or after the event.",
          );
        previous = t;
        if (t <= at && k <= at) observations.push(o);
      }
      if (!observations.length)
        throw new MissingData(
          "No observations were known at the selected as-of time.",
        );
      result.latestEventAt = observations[observations.length - 1].eventAt;
      if (
        dataset.maxAgeMs !== undefined &&
        (!Number.isFinite(dataset.maxAgeMs) ||
          dataset.maxAgeMs <= 0 ||
          at - timestamp(result.latestEventAt) > dataset.maxAgeMs)
      )
        throw new MissingData(
          "The latest observation exceeds this dataset’s freshness budget.",
        );
      let budget = LIMITS.steps;
      const memo = new Map<string, Value>(),
        comparisons: string[] = [];
      const field = (name: string, i: number): number => {
        if (i < 0 || i >= observations.length)
          throw new MissingData(
            "Insufficient eligible history for this lookback.",
          );
        const o = observations[i],
          v = Object.hasOwn(o, name)
            ? o[name as keyof ScanObservation]
            : o.fields?.[name];
        if (typeof v !== "number" || !Number.isFinite(v))
          throw new MissingData(`${name}: source field is unavailable.`);
        if (["open", "high", "low", "close"].includes(name) && v <= 0)
          throw new MissingData(`${name}: price must be positive.`);
        if (name === "volume" && v <= 0)
          throw new MissingData("volume: positive volume is required.");
        if (name === "openinterest" && v < 0)
          throw new MissingData(`${name}: value cannot be negative.`);
        return v;
      };
      const numeric = (v: Value): number => {
        if (typeof v !== "number" || !Number.isFinite(v))
          throw new MissingData(
            "Non-finite calculation or numeric type mismatch.",
          );
        return v;
      };
      const boolean = (v: Value): boolean => {
        if (typeof v !== "boolean")
          throw new MissingData("A condition did not produce a boolean.");
        return v;
      };
      function group(nodes: Ast[], i: number, all: boolean): boolean {
        let missing: MissingData | undefined;
        for (const node of nodes) {
          try {
            const value = boolean(ev(node, i));
            if (value !== all) return value;
          } catch (e) {
            if (!(e instanceof MissingData)) throw e;
            missing = e;
          }
        }
        if (missing) throw missing;
        return all;
      }
      function history(a: Ast, i: number, n: number): number[] {
        if (i - n + 1 < 0)
          throw new MissingData(
            `At least ${n} eligible observations are required.`,
          );
        return Array.from({ length: n }, (_, j) =>
          numeric(ev(a, i - n + 1 + j)),
        );
      }
      function ema(a: Ast, i: number, n: number): number {
        const values = seededHistory(a, i);
        if (values.length < n)
          throw new MissingData(
            `EMA requires at least ${n} eligible observations.`,
          );
        let v = values.slice(0, n).reduce((sum, x) => sum + x, 0) / n;
        const alpha = 2 / (n + 1);
        for (let j = n; j < values.length; j++)
          v = alpha * values[j] + (1 - alpha) * v;
        return v;
      }
      function seededHistory(a: Ast, i: number): number[] {
        return history(a, i, Math.max(0, i + 2 - requiredScanBars(a, barRequirements)));
      }
      function ev(a: Ast, i: number): Value {
        if (--budget < 0)
          throw new MissingData(
            "Rule exceeded its deterministic execution budget.",
          );
        if (i < 0) throw new MissingData("Insufficient prior observations.");
        if (a.kind === "number") return a.value;
        if (a.kind === "field") return field(a.name, i);
        if (a.kind === "unary")
          return a.op === "NOT"
            ? !boolean(ev(a.arg, i))
            : -numeric(ev(a.arg, i));
        if (a.kind === "binary") {
          if (a.op === "AND" || a.op === "OR")
            return group([a.left, a.right], i, a.op === "AND");
          const l = numeric(ev(a.left, i)),
            r = numeric(ev(a.right, i));
          let out: Value;
          switch (a.op) {
            case "+":
              out = l + r;
              break;
            case "-":
              out = l - r;
              break;
            case "*":
              out = l * r;
              break;
            case "/":
              if (r === 0)
                throw new MissingData("Division by zero; result is undefined.");
              out = l / r;
              break;
            case ">":
              out = l > r;
              break;
            case ">=":
              out = l >= r;
              break;
            case "<":
              out = l < r;
              break;
            case "<=":
              out = l <= r;
              break;
            case "==":
              out = l === r;
              break;
            case "!=":
              out = l !== r;
              break;
            default:
              throw new MissingData("Unknown operation.");
          }
          if (typeof out === "boolean") {
            if (comparisons.length < 32)
              comparisons.push(
                `${renderFormula(a.left)} = ${l}; ${a.op} ${renderFormula(a.right)} = ${r}: ${out ? "PASS" : "FAIL"}.`,
              );
            return out;
          }
          return numeric(out);
        }
        const args = a.args,
          name = a.name;
        if (name === "all" || name === "any")
          return group(args, i, name === "all");
        if (name === "not") return !boolean(ev(args[0], i));
        if (name === "within") {
          const n = lookback(args[1]);
          if (i - n + 1 < 0)
            throw new MissingData("Insufficient history for within.");
          let missing: MissingData | undefined;
          for (let j = 0; j < n; j++)
            try {
              if (boolean(ev(args[0], i - j))) return true;
            } catch (e) {
              if (!(e instanceof MissingData)) throw e;
              missing = e;
            }
          if (missing) throw missing;
          return false;
        }
        if (name === "range") {
          const value = numeric(ev(args[0], i)),
            low = numeric(ev(args[1], i)),
            high = numeric(ev(args[2], i));
          if (low > high)
            throw new MissingData("Range lower bound exceeds upper bound.");
          return value >= low && value <= high;
        }
        if (name === "crossesabove" || name === "crossesbelow") {
          const nowLeft = numeric(ev(args[0], i)),
            nowRight = numeric(ev(args[1], i)),
            beforeLeft = numeric(ev(args[0], i - 1)),
            beforeRight = numeric(ev(args[1], i - 1));
          return name === "crossesabove"
            ? nowLeft > nowRight && beforeLeft <= beforeRight
            : nowLeft < nowRight && beforeLeft >= beforeRight;
        }
        if (name === "abs") return Math.abs(numeric(ev(args[0], i)));
        if (name === "min" || name === "max")
          return Math[name](numeric(ev(args[0], i)), numeric(ev(args[1], i)));
        const key = JSON.stringify(a) + "@" + i;
        if (memo.has(key)) return memo.get(key)!;
        let value: number;
        if (name === "atr") {
          const n = lookback(args[0], 2);
          if (i - n < 0)
            throw new MissingData(
              `ATR requires ${n + 1} eligible OHLC observations.`,
            );
          const trs = Array.from({ length: i }, (_, j) => {
            const at = j + 1,
              h = field("high", at),
              l = field("low", at),
              c = field("close", at - 1);
            if (h < l) throw new MissingData("OHLC high cannot be below low.");
            return Math.max(h - l, Math.abs(h - c), Math.abs(l - c));
          });
          value = trs.slice(0, n).reduce((s, x) => s + x, 0) / n;
          for (let j = n; j < trs.length; j++)
            value = (value * (n - 1) + trs[j]) / n;
        } else if (name === "macd") {
          value =
            ema(args[0], i, lookback(args[1], 2)) -
            ema(args[0], i, lookback(args[2], 2));
        } else if (name === "macdsignal" || name === "macdhist") {
          const fast = lookback(args[1], 2),
            slow = lookback(args[2], 2),
            sig = lookback(args[3], 2);
          const needed = requiredScanBars(a, barRequirements);
          if (i + 1 < needed)
            throw new MissingData(
              `MACD(${fast},${slow},${sig}) requires at least ${needed} eligible observations.`,
            );
          const series = seededHistory(args[0], i);
          const emaArr = (period: number): (number | null)[] => {
            const out: (number | null)[] = new Array(series.length).fill(null);
            let acc =
              series.slice(0, period).reduce((s, x) => s + x, 0) / period;
            out[period - 1] = acc;
            const alpha = 2 / (period + 1);
            for (let j = period; j < series.length; j++) {
              acc = alpha * series[j] + (1 - alpha) * acc;
              out[j] = acc;
            }
            return out;
          };
          const eFast = emaArr(fast),
            eSlow = emaArr(slow);
          const macdSeries: number[] = [];
          for (let j = slow - 1; j < series.length; j++) {
            macdSeries.push(eFast[j]! - eSlow[j]!);
          }
          let sigVal =
            macdSeries.slice(0, sig).reduce((s, x) => s + x, 0) / sig;
          const sigAlpha = 2 / (sig + 1);
          for (let j = sig; j < macdSeries.length; j++) {
            sigVal = sigAlpha * macdSeries[j] + (1 - sigAlpha) * sigVal;
          }
          const latestMacd = macdSeries[macdSeries.length - 1];
          value = name === "macdsignal" ? sigVal : latestMacd - sigVal;
        } else if (name === "bbmid") {
          const n = lookback(args[1], 2);
          value = history(args[0], i, n).reduce((s, x) => s + x, 0) / n;
        } else if (
          name === "bbupper" ||
          name === "bblower" ||
          name === "bbwidth"
        ) {
          const n = lookback(args[1], 2);
          const mult = (args[2] as { kind: "number"; value: number }).value;
          const vals = history(args[0], i, n);
          const mean = vals.reduce((s, x) => s + x, 0) / n;
          const variance =
            vals.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
          const sd = Math.sqrt(variance);
          const upper = mean + mult * sd;
          const lower = mean - mult * sd;
          if (name === "bbupper") value = upper;
          else if (name === "bblower") value = lower;
          else {
            if (mean === 0)
              throw new MissingData(
                "Bollinger bandwidth is undefined when midpoint is zero.",
              );
            value = ((upper - lower) / Math.abs(mean)) * 100;
          }
        } else if (
          name === "rollingmin" ||
          name === "rollingmax" ||
          name === "rollingmedian"
        ) {
          const n = lookback(args[1], 2);
          const vals = history(args[0], i, n);
          if (name === "rollingmin") value = Math.min(...vals);
          else if (name === "rollingmax") value = Math.max(...vals);
          else {
            const sorted = [...vals].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            value =
              sorted.length % 2 === 1
                ? sorted[mid]
                : (sorted[mid - 1] + sorted[mid]) / 2;
          }
        } else if (name === "adx" || name === "plusdi" || name === "minusdi") {
          const n = lookback(args[0], 2);
          const minNeeded = name === "adx" ? 2 * n : n + 1;
          if (i + 1 < minNeeded)
            throw new MissingData(
              `${name.toUpperCase()}(${n}) requires at least ${minNeeded} eligible OHLC observations.`,
            );
          const trs: number[] = [];
          const plusDms: number[] = [];
          const minusDms: number[] = [];
          for (let at = 1; at <= i; at++) {
            const h = field("high", at),
              l = field("low", at),
              prevH = field("high", at - 1),
              prevL = field("low", at - 1),
              prevC = field("close", at - 1);
            if (h < l) throw new MissingData("OHLC high cannot be below low.");
            const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
            const upMove = h - prevH;
            const downMove = prevL - l;
            const pDm = upMove > downMove && upMove > 0 ? upMove : 0;
            const mDm = downMove > upMove && downMove > 0 ? downMove : 0;
            trs.push(tr);
            plusDms.push(pDm);
            minusDms.push(mDm);
          }
          let smTr = trs.slice(0, n).reduce((s, x) => s + x, 0);
          let smPdm = plusDms.slice(0, n).reduce((s, x) => s + x, 0);
          let smMdm = minusDms.slice(0, n).reduce((s, x) => s + x, 0);
          const dxs: number[] = [];
          let lastPlusDi = 0;
          let lastMinusDi = 0;
          const pushDi = () => {
            lastPlusDi = smTr === 0 ? 0 : (100 * smPdm) / smTr;
            lastMinusDi = smTr === 0 ? 0 : (100 * smMdm) / smTr;
            const sumDi = lastPlusDi + lastMinusDi;
            dxs.push(
              sumDi === 0 ? 0 : (100 * Math.abs(lastPlusDi - lastMinusDi)) / sumDi,
            );
          };
          pushDi();
          for (let j = n; j < trs.length; j++) {
            smTr = smTr - smTr / n + trs[j];
            smPdm = smPdm - smPdm / n + plusDms[j];
            smMdm = smMdm - smMdm / n + minusDms[j];
            pushDi();
          }
          if (name === "plusdi") value = lastPlusDi;
          else if (name === "minusdi") value = lastMinusDi;
          else {
            if (dxs.length < n)
              throw new MissingData(
                `ADX(${n}) requires at least ${2 * n} eligible OHLC observations.`,
              );
            let adxVal = dxs.slice(0, n).reduce((s, x) => s + x, 0) / n;
            for (let j = n; j < dxs.length; j++) {
              adxVal = (adxVal * (n - 1) + dxs[j]) / n;
            }
            value = adxVal;
          }
        } else if (name === "stochk" || name === "stochd") {
          const kPeriod = lookback(args[0], 2);
          const smoothK = lookback(args[1], 1);
          const smoothD = name === "stochd" ? lookback(args[2], 1) : 1;
          const minNeeded = kPeriod + smoothK + smoothD - 2;
          if (i + 1 < minNeeded)
            throw new MissingData(
              `Stochastic(${kPeriod},${smoothK},${smoothD}) requires at least ${minNeeded} eligible OHLC observations.`,
            );
          const rawKAt = (at: number): number => {
            let hh = -Infinity;
            let ll = Infinity;
            for (let j = at - kPeriod + 1; j <= at; j++) {
              const h = field("high", j);
              const l = field("low", j);
              if (h < l)
                throw new MissingData("OHLC high cannot be below low.");
              if (h > hh) hh = h;
              if (l < ll) ll = l;
            }
            const c = field("close", at);
            const span = hh - ll;
            return span === 0 ? 50 : ((c - ll) / span) * 100;
          };
          const smoothKAt = (at: number): number => {
            let sum = 0;
            for (let j = at - smoothK + 1; j <= at; j++) sum += rawKAt(j);
            return sum / smoothK;
          };
          if (name === "stochk") {
            value = smoothKAt(i);
          } else {
            let sumD = 0;
            for (let j = i - smoothD + 1; j <= i; j++) sumD += smoothKAt(j);
            value = sumD / smoothD;
          }
        } else if (name === "obv") {
          if (i < 1)
            throw new MissingData(
              "OBV requires at least 2 eligible price and volume observations.",
            );
          field("close", 0);
          field("volume", 0);
          let obvVal = 0;
          for (let j = 1; j <= i; j++) {
            const cNow = field("close", j),
              cPrev = field("close", j - 1),
              vol = field("volume", j);
            if (cNow > cPrev) obvVal += vol;
            else if (cNow < cPrev) obvVal -= vol;
          }
          value = obvVal;
        } else if (name === "mfi") {
          const n = lookback(args[0], 2);
          if (i < n)
            throw new MissingData(
              `MFI(${n}) requires at least ${n + 1} eligible OHLCV observations.`,
            );
          const tpAt = (at: number): number => {
            const h = field("high", at),
              l = field("low", at),
              c = field("close", at);
            if (h < l) throw new MissingData("OHLC high cannot be below low.");
            return (h + l + c) / 3;
          };
          field("volume", i - n);
          let posFlow = 0;
          let negFlow = 0;
          let prevTp = tpAt(i - n);
          for (let j = i - n + 1; j <= i; j++) {
            const curTp = tpAt(j);
            const vol = field("volume", j);
            const rawFlow = curTp * vol;
            if (curTp > prevTp) posFlow += rawFlow;
            else if (curTp < prevTp) negFlow += rawFlow;
            prevTp = curTp;
          }
          value =
            posFlow === 0 && negFlow === 0
              ? 50
              : negFlow === 0
                ? 100
                : 100 - 100 / (1 + posFlow / negFlow);
        } else if (name === "supertrend" || name === "supertrenddir") {
          const n = lookback(args[0], 2);
          const mult = (args[1] as { kind: "number"; value: number }).value;
          if (i < n)
            throw new MissingData(
              `Supertrend(${n},${mult}) requires at least ${n + 1} eligible OHLC observations.`,
            );
          const trs: number[] = [];
          for (let at = 1; at <= i; at++) {
            const h = field("high", at),
              l = field("low", at),
              prevC = field("close", at - 1);
            if (h < l) throw new MissingData("OHLC high cannot be below low.");
            trs.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
          }
          let atrVal = trs.slice(0, n).reduce((s, x) => s + x, 0) / n;
          const hSeed = field("high", n),
            lSeed = field("low", n),
            cSeed = field("close", n),
            prevSeed = field("close", n - 1),
            hl2Seed = (hSeed + lSeed) / 2;
          let finalUpper = hl2Seed + mult * atrVal;
          let finalLower = hl2Seed - mult * atrVal;
          let dir =
            cSeed > hl2Seed
              ? 1
              : cSeed < hl2Seed
                ? -1
                : cSeed >= prevSeed
                  ? 1
                  : -1;
          let st = dir === 1 ? finalLower : finalUpper;
          for (let at = n + 1; at <= i; at++) {
            atrVal = (atrVal * (n - 1) + trs[at - 1]) / n;
            const h = field("high", at),
              l = field("low", at),
              c = field("close", at),
              prevC = field("close", at - 1),
              hl2 = (h + l) / 2,
              basicUpper = hl2 + mult * atrVal,
              basicLower = hl2 - mult * atrVal;
            finalUpper =
              basicUpper < finalUpper || prevC > finalUpper
                ? basicUpper
                : finalUpper;
            finalLower =
              basicLower > finalLower || prevC < finalLower
                ? basicLower
                : finalLower;
            if (dir === -1 && c > finalUpper) {
              dir = 1;
            } else if (dir === 1 && c < finalLower) {
              dir = -1;
            }
            st = dir === 1 ? finalLower : finalUpper;
          }
          value = name === "supertrend" ? st : dir;
        } else {
          const n = lookback(
            args[1],
            ["sma", "ema", "rsi"].includes(name) ? 2 : 1,
          );
          if (name === "lag") value = numeric(ev(args[0], i - n));
          else if (name === "change") {
            const before = numeric(ev(args[0], i - n));
            if (before === 0)
              throw new MissingData(
                "Percentage change is undefined from zero.",
              );
            value = (numeric(ev(args[0], i)) / before - 1) * 100;
          } else if (name === "sma")
            value = history(args[0], i, n).reduce((s, x) => s + x, 0) / n;
          else if (name === "ema") value = ema(args[0], i, n);
          else if (name === "rsi") {
            const values = seededHistory(args[0], i);
            if (values.length < n + 1)
              throw new MissingData(
                `RSI requires at least ${n + 1} eligible observations.`,
              );
            const changes = values.slice(1).map((v, j) => v - values[j]);
            let gain =
                changes.slice(0, n).reduce((s, v) => s + Math.max(v, 0), 0) / n,
              loss =
                changes.slice(0, n).reduce((s, v) => s + Math.max(-v, 0), 0) /
                n;
            for (let j = n; j < changes.length; j++) {
              gain = (gain * (n - 1) + Math.max(changes[j], 0)) / n;
              loss = (loss * (n - 1) + Math.max(-changes[j], 0)) / n;
            }
            value =
              gain === 0 && loss === 0
                ? 50
                : loss === 0
                  ? 100
                  : 100 - 100 / (1 + gain / loss);
          } else throw new MissingData("Unsupported calculation.");
        }
        memo.set(key, numeric(value));
        return numeric(value);
      }
      const index = observations.length - 1,
        pass = boolean(ev(rule.ast, index));
      result.status = pass ? "PASS" : "FAIL";
      result.reasons = [
        `${pass ? "Matched" : "Did not match"} ${renderFormula(rule.ast)} using ${observations.length} eligible observations.`,
        ...comparisons,
      ];
    } catch (error) {
      result.status = "UNKNOWN";
      result.reasons = [
        error instanceof Error
          ? error.message
          : "Source or calculation unavailable.",
      ];
    }
    return result;
  });
  const matches = results.filter((r) => r.status === "PASS").length,
    failed = results.filter((r) => r.status === "FAIL").length,
    unknown = results.length - matches - failed;
  return {
    version: RULE_VERSION,
    asOf: new Date(at).toISOString(),
    formula: renderFormula(rule.ast),
    total: results.length,
    eligible: matches + failed,
    matches,
    failed,
    unknown,
    results,
  };
}
