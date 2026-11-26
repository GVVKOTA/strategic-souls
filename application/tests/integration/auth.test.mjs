/** Standalone Cloudflare D1 authentication & OpenAI removal verification tests. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { webcrypto, randomUUID } from "node:crypto";
import ts from "typescript";
import { d1MigrationsDir, resolveRepo } from "../helpers/paths.mjs";

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync(d1MigrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  sql.exec(readFileSync(resolve(d1MigrationsDir, file), "utf8"));
}

class Statement {
  constructor(query, args = []) {
    this.query = query;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.query, args);
  }
  async first() {
    return sql.prepare(this.query).get(...this.args) ?? null;
  }
  async all() {
    return {
      results: sql.prepare(this.query).all(...this.args),
      success: true,
    };
  }
  execute() {
    const r = sql.prepare(this.query).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async run() {
    return this.execute();
  }
}

const DB = {
  prepare: (q) => new Statement(q),
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const out = statements.map((s) => s.execute());
      sql.exec("COMMIT");
      return out;
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  },
};

const env = { DB };
let mockFetch = () => {
  throw new Error("Unexpected network fetch in auth tests.");
};
const context = vm.createContext({
  console,
  Request,
  Response,
  Headers,
  TextEncoder,
  TextDecoder,
  AbortController,
  setTimeout,
  clearTimeout,
  crypto: {
    subtle: webcrypto.subtle,
    getRandomValues: (arr) => webcrypto.getRandomValues(arr),
    randomUUID,
  },
  URL,
  URLSearchParams,
  Intl,
  Date,
  Uint8Array,
  Number,
  Math,
  JSON,
  Set,
  Map,
  btoa,
  atob,
  fetch: (...args) => mockFetch(...args),
});

const cache = new Map();
async function load(path) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const m = new vm.SourceTextModule(code, { context, identifier: file });
  cache.set(file, m);
  return m;
}

async function link(spec, refer) {
  if (spec === "cloudflare:workers") {
    if (!cache.has(spec)) {
      cache.set(
        spec,
        new vm.SyntheticModule(
          ["env"],
          function () {
            this.setExport("env", env);
          },
          { context },
        ),
      );
    }
    return cache.get(spec);
  }
  if (spec === "next/headers") {
    if (!cache.has(spec)) {
      cache.set(
        spec,
        new vm.SyntheticModule(
          ["headers"],
          function () {
            this.setExport("headers", async () => new Headers());
          },
          { context },
        ),
      );
    }
    return cache.get(spec);
  }
  if (spec === "next/navigation") {
    if (!cache.has(spec)) {
      cache.set(
        spec,
        new vm.SyntheticModule(
          ["redirect"],
          function () {
            this.setExport("redirect", (target) => {
              throw new Error("REDIRECT:" + target);
            });
          },
          { context },
        ),
      );
    }
    return cache.get(spec);
  }
  let target = resolve(dirname(refer.identifier), spec);
  if (!existsSync(target)) target += ".ts";
  return load(target);
}

const authRoute = await load("app/api/auth/[...action]/route.ts");
await authRoute.link(link);
await authRoute.evaluate();
const sessionMod = cache.get(resolve("backend/auth/session.ts")).namespace;

async function callAuth(action, input, headers = {}) {
  const method = input === undefined ? "GET" : "POST";
  const req = new Request("https://strategic-souls.test/api/auth/" + action, {
    method,
    headers: {
      origin: "https://strategic-souls.test",
      ...(input === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const res = await authRoute.namespace[method](req);
  const text = await res.text();
  return {
    status: res.status,
    data: text ? JSON.parse(text) : null,
    headers: res.headers,
  };
}

function extractSessionCookie(headers) {
  const raw = headers.get("set-cookie") || "";
  const match = /__ss_session=([^;]+)/.exec(raw);
  return match ? `__ss_session=${match[1]}` : "";
}

test("unauthenticated session returns 200 authenticated:false and ignores forged OpenAI headers", async () => {
  const res = await callAuth("session", undefined, {
    "oai-authenticated-user-id": "forged-owner-id",
    "oai-authenticated-user-email": "forged@example.com",
    "oai-authenticated-user-full-name": "Forged User",
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.authenticated, false);
  assert.equal(res.data.user, null);
  assert.equal("googleEnabled" in res.data, false);
});

test("registration hashes passwords with PBKDF2, stores only hashed session token, and sets HttpOnly Secure cookie", async () => {
  // Rejects weak password & cross-origin
  assert.equal(
    (
      await callAuth("register", {
        email: "alpha@example.com",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await callAuth(
        "register",
        {
          email: "alpha@example.com",
          password: "StrongPassword123",
        },
        { origin: "https://evil.invalid" },
      )
    ).status,
    403,
  );

  const created = await callAuth("register", {
    email: "Alpha@Example.com",
    password: "StrongPassword123",
    displayName: "Alpha Researcher",
    adult: true,
    privacy: true,
    terms: true,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.authenticated, true);
  assert.equal(created.data.accepted, true);
  assert.equal(created.data.user.email, "alpha@example.com");
  assert.equal(created.data.user.displayName, "Alpha Researcher");

  const setCookie = created.headers.get("set-cookie") || "";
  assert.match(setCookie, /__ss_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Secure/);

  // Stored password is salted PBKDF2 hex, never plaintext
  const userRow = sql
    .prepare("SELECT * FROM auth_users WHERE email = ?")
    .get("alpha@example.com");
  assert.ok(userRow);
  assert.notEqual(userRow.password_hash, "StrongPassword123");
  assert.equal(userRow.password_hash.length, 64);
  assert.equal(userRow.password_salt.length, 32);

  // Stored session token is SHA-256 hash, never raw cookie value
  const cookieHeader = extractSessionCookie(created.headers);
  const rawToken = cookieHeader.replace("__ss_session=", "");
  const sessionRows = sql.prepare("SELECT * FROM auth_sessions").all();
  assert.equal(sessionRows.length, 1);
  assert.notEqual(sessionRows[0].token_hash, rawToken);
  assert.equal(sessionRows[0].token_hash.length, 64);

  // Duplicate email rejected with 409
  assert.equal(
    (
      await callAuth("register", {
        email: "alpha@example.com",
        password: "AnotherPassword456",
      })
    ).status,
    409,
  );

  // Authenticated session roundtrip succeeds
  const check = await callAuth("session", undefined, { cookie: cookieHeader });
  assert.equal(check.status, 200);
  assert.equal(check.data.authenticated, true);
  assert.equal(check.data.user.email, "alpha@example.com");

  // Sign-out revokes session server-side so replaying cookie fails
  const out = await callAuth("signout", {}, { cookie: cookieHeader });
  assert.equal(out.status, 200);
  assert.equal(out.data.signedOut, true);
  assert.match(out.headers.get("set-cookie") || "", /Max-Age=0/);
  const replayed = await callAuth("session", undefined, {
    cookie: cookieHeader,
  });
  assert.equal(replayed.data.authenticated, false);
});

test("signin rejects wrong password or unknown email with uniform 401 and succeeds with correct credentials", async () => {
  const wrong = await callAuth("signin", {
    email: "alpha@example.com",
    password: "WrongPassword999",
  });
  const missing = await callAuth("signin", {
    email: "nonexistent@example.com",
    password: "WrongPassword999",
  });
  assert.equal(wrong.status, 401);
  assert.equal(missing.status, 401);
  assert.equal(wrong.data.error, missing.data.error);

  const ok = await callAuth("signin", {
    email: "ALPHA@example.com",
    password: "StrongPassword123",
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.authenticated, true);
  const firstCookie = extractSessionCookie(ok.headers);
  assert.ok(firstCookie);

  // Re-authenticating with an active session rotates out the old session token in D1.
  const rotated = await callAuth(
    "signin",
    {
      email: "alpha@example.com",
      password: "StrongPassword123",
    },
    { cookie: firstCookie },
  );
  assert.equal(rotated.status, 200);
  const secondCookie = extractSessionCookie(rotated.headers);
  assert.ok(secondCookie);
  assert.notEqual(secondCookie, firstCookie);
  const staleCheck = await callAuth("session", undefined, { cookie: firstCookie });
  assert.equal(staleCheck.data.authenticated, false);
  const freshCheck = await callAuth("session", undefined, { cookie: secondCookie });
  assert.equal(freshCheck.data.authenticated, true);
});

test("unused third-party OAuth endpoints return 404 and return paths block open redirects", async () => {
  assert.equal((await callAuth("google?return_to=%2Fworkspace")).status, 404);
  assert.equal((await callAuth("google/callback?code=fake&state=fake")).status, 404);

  assert.equal(sessionMod.safeRelativeReturnPath("/workspace"), "/workspace");
  assert.equal(sessionMod.safeRelativeReturnPath("/?view=strategy"), "/?view=strategy");
  assert.equal(sessionMod.safeRelativeReturnPath("//evil.example"), "/");
  assert.equal(sessionMod.safeRelativeReturnPath("https://evil.example/x"), "/");
  assert.equal(sessionMod.safeRelativeReturnPath("/signin"), "/");
  assert.equal(sessionMod.safeRelativeReturnPath("/api/auth/session"), "/");
});

test("expired sessions are rejected, unauthorized private auth routes return 401, and active sessions stay isolated per account", async () => {
  const regA = await callAuth("register", {
    email: "isolated_a@example.com",
    password: "StrongPassword123",
    displayName: "Isolated A",
    adult: true,
    privacy: true,
    terms: true,
  });
  const regB = await callAuth("register", {
    email: "isolated_b@example.com",
    password: "StrongPassword456",
    displayName: "Isolated B",
    adult: true,
    privacy: true,
    terms: true,
  });
  assert.equal(regA.status, 201);
  assert.equal(regB.status, 201);
  const cookieA = extractSessionCookie(regA.headers);
  const cookieB = extractSessionCookie(regB.headers);

  // Unauthenticated access to private session listing fails closed with 401
  assert.equal((await callAuth("sessions")).status, 401);

  // Each user sees only their own active session(s)
  const sessA = await callAuth("sessions", undefined, { cookie: cookieA });
  const sessB = await callAuth("sessions", undefined, { cookie: cookieB });
  assert.equal(sessA.status, 200);
  assert.equal(sessB.status, 200);
  assert.equal(sessA.data.sessions.length, 1);
  assert.equal(sessB.data.sessions.length, 1);
  assert.notEqual(sessA.data.sessions[0].id, sessB.data.sessions[0].id);

  // User A cannot revoke User B's session ID
  const crossRevoke = await callAuth(
    "sessions/revoke",
    { sessionId: sessB.data.sessions[0].id },
    { cookie: cookieA },
  );
  assert.equal(crossRevoke.status, 404);

  // Expired session row in D1 is rejected by getAuthenticatedUser
  sql
    .prepare("UPDATE auth_sessions SET expires_at = ? WHERE user_id = (SELECT id FROM auth_users WHERE email = ?)")
    .run(Date.now() - 10_000, "isolated_a@example.com");
  const expiredSession = await callAuth("session", undefined, { cookie: cookieA });
  assert.equal(expiredSession.status, 200);
  assert.equal(expiredSession.data.authenticated, false);
  // User B remains unaffected
  const validB = await callAuth("session", undefined, { cookie: cookieB });
  assert.equal(validB.data.authenticated, true);
  assert.equal(validB.data.user.email, "isolated_b@example.com");
});

test("OpenAI / ChatGPT authentication artifacts and routes are completely removed from app, backend, and frontend", () => {
  assert.equal(existsSync("backend/auth/chatgpt-auth.ts"), false);
  assert.equal(existsSync(resolveRepo(".openai/hosting.json")), false);
  assert.equal(existsSync(".openai/hosting.json"), false);
  assert.equal(existsSync(resolveRepo("operations/scripts/vite/sites-vite-plugin.ts")), false);

  function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|mts|js|mjs|css)$/.test(entry)) out.push(full);
    }
    return out;
  }

  const forbidden = [
    /signin-with-chatgpt/i,
    /signout-with-chatgpt/i,
    /oai-authenticated-user/i,
    /Continue with ChatGPT/i,
    /Sign in with ChatGPT/i,
    /chatgpt-auth/,
  ];
  for (const root of ["app", "backend", "frontend"]) {
    for (const file of walk(root)) {
      const content = readFileSync(file, "utf8");
      for (const re of forbidden) {
        assert.equal(
          re.test(content),
          false,
          `Forbidden OpenAI auth pattern ${re} found in ${file}`,
        );
      }
    }
  }
});
