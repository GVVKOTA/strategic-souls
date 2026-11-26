import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
async function setup(fetch) {
  const context = vm.createContext({
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    Intl,
    Date,
    Error,
    Map,
    JSON,
    Number,
    String,
  });
  const source = ts.transpileModule(
    readFileSync("frontend/components/workspace/shared.tsx", "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link((name) => {
    const entries =
      name === "react"
        ? { useEffect() {}, useRef() {} }
        : name === "react/jsx-runtime"
          ? { jsx() {}, jsxs() {} }
          : { X() {}, ArrowUpRight() {}, Info() {} };
    return new vm.SyntheticModule(
      Object.keys(entries),
      function () {
        for (const [k, v] of Object.entries(entries)) this.setExport(k, v);
      },
      { context },
    );
  });
  await mod.evaluate();
  return mod.namespace.api;
}
test("ten rapid identical requests share exactly one network mutation", async () => {
  let calls = 0,
    finish;
  const api = await setup(() => {
    calls++;
    return new Promise((resolve) => {
      finish = () => resolve({ ok: true, json: async () => ({ saved: true }) });
    });
  });
  const input = {
    requestId: "stable-request-12345",
    action: "save",
    name: "Test",
  };
  const pending = Array.from({ length: 10 }, () => api("/test", input));
  assert.equal(calls, 1);
  finish();
  assert.ok((await Promise.all(pending)).every((x) => x.saved));
});
test("a conflicting payload cannot borrow a pending mutation success", async () => {
  let finish;
  const api = await setup(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({ ok: true, json: async () => ({ saved: true }) });
      }),
  );
  const first = api("/test", { requestId: "same-key", value: 1 });
  await assert.rejects(
    api("/test", { requestId: "same-key", value: 2 }),
    /different content/,
  );
  finish();
  await first;
});
test("a failed request releases its lock and supports an explicit same-key retry", async () => {
  let calls = 0;
  const api = await setup(async () => {
    calls++;
    if (calls === 1) throw Error("Offline");
    return { ok: true, json: async () => ({ saved: true }) };
  });
  await assert.rejects(api("/test", { requestId: "retry-key" }), /Offline/);
  assert.equal((await api("/test", { requestId: "retry-key" })).saved, true);
  assert.equal(calls, 2);
});
test("bounded timeout aborts a stuck request without automatically resending a write", async () => {
  let calls = 0;
  const api = await setup((url, options) => {
    calls++;
    return new Promise((resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(Error("aborted"))),
    );
  });
  await assert.rejects(
    api("/test", { requestId: "slow-key" }, { timeoutMs: 10 }),
    /timed out/,
  );
  assert.equal(calls, 1);
});
test("explicit cancellation is distinguishable from server failure", async () => {
  const controller = new AbortController();
  const api = await setup(
    (url, options) =>
      new Promise((resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(Error("aborted")),
        ),
      ),
  );
  const pending = api("/test", undefined, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});
test("expired sign-in HTML returns actionable text without exposing parser internals", async () => {
  const api = await setup(async () => ({
    ok: false,
    status: 401,
    json: async () => {
      throw SyntaxError("Unexpected HTML");
    },
  }));
  await assert.rejects(api("/test"), /Sign in again/);
});
