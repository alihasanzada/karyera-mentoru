const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(fetch) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: "", textContent: "", disabled: false, value: "cybersecurity",
      files: [{ name: "cv.pdf", size: 100 }],
      classList: { add() {}, remove() {} }, addEventListener() {}, scrollIntoView() {},
    });
    return nodes.get(id);
  };
  const context = vm.createContext({
    fetch, AbortController, FormData, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => "test-client-one", setItem() {} },
    document: { getElementById: node },
    window: { addEventListener() {}, scrollTo() {} },
    location: { hash: "#/jobs" }, alert() {},
  });
  for (const file of ["roadmap.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context);
  }
  return { context, node, run: () => vm.runInContext("runEvaluate()", context) };
}

test("evaluation uses its response ID without a fallible history request", async () => {
  const requests = [];
  const app = setup(async (url, options) => {
    requests.push(url);
    assert.equal(options.headers["X-Client-Id"], "test-client-one");
    return { ok: true, json: async () => ({ evaluation_id: 42, categories: [], overall_score: 50 }) };
  });
  await app.run();
  assert.deepEqual(requests, ["/api/evaluate"]);
  assert.equal(vm.runInContext("state.current._id", app.context), 42);
  assert.equal(app.node("cv-run").disabled, false);
});

test("a second click cannot launch a duplicate evaluation", async () => {
  let resolve;
  let calls = 0;
  const app = setup(() => {
    calls++;
    return new Promise((done) => { resolve = done; });
  });
  const pending = app.run();
  await app.run();
  assert.equal(calls, 1);
  assert.equal(app.node("cv-run").disabled, true);
  resolve({ ok: true, json: async () => ({ evaluation_id: 7, categories: [] }) });
  await pending;
  assert.equal(app.node("cv-run").disabled, false);
});

test("failed evaluation displays server feedback and allows retry", async () => {
  const app = setup(async () => ({ ok: false, json: async () => ({ detail: "GEMINI_API_KEY təyin olunmayıb." }) }));
  await app.run();
  assert.match(app.node("cv-status").textContent, /GEMINI_API_KEY/);
  assert.equal(vm.runInContext("state.evaluating", app.context), false);
  assert.equal(app.node("cv-run").disabled, false);
});

test("low role match has a visible warning while strong fit does not", () => {
  const app = setup(async () => ({ ok: true, json: async () => ({}) }));
  const weak = vm.runInContext("fieldWarning({ match: { match_score: 12 } })", app.context);
  const strong = vm.runInContext("fieldWarning({ match: { match_score: 90 } })", app.context);
  assert.match(weak, /uyğun görünmür/);
  assert.match(weak, /12\/100/);
  assert.equal(strong, "");
});
