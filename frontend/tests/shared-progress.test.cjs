const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
const BEGIN = "const SharedProgress = (() => {";
const END = "})();";

function block(rel) {
  const src = read(rel);
  const start = src.indexOf(BEGIN);
  assert.ok(start >= 0, `${rel} has no SharedProgress block`);
  return src.slice(start, src.indexOf(END, start) + END.length);
}

const norm = (s) => s.replace(/\s+/g, " ");
const keys = (o) => Object.keys(o);

function load(rel) {
  return vm.runInNewContext(`${block(rel)}; SharedProgress`, { Math, JSON, Object, Array, Map });
}

function memoryIo(initial = {}) {
  const store = { ...initial };
  return {
    store,
    read: (k) => (k in store ? store[k] : null),
    write: (k, v) => { store[k] = v; return true; },
    remove: (k) => { delete store[k]; },
  };
}

const task = (day, title) => ({ day, title, details: "d", deliverable: "x" });
const plan = (id, titles = ["A", "B"]) => ({
  evaluation_id: id,
  generated: true,
  roadmap: [
    { key: "foundation", tasks: titles.map((t, i) => task(i + 1, t)) },
    { key: "practice", tasks: [task(8, "P")] },
    { key: "interview", tasks: [task(15, "I")] },
  ],
});

test("both pages carry an identical SharedProgress implementation", () => {
  assert.equal(norm(block("frontend/js/roadmap.js")), norm(block("dizayn/js/script.js")));
});

for (const rel of ["frontend/js/roadmap.js", "dizayn/js/script.js"]) {
  const SP = load(rel);

  test(`${rel}: saved progress round-trips and only counts matching tasks`, () => {
    const io = memoryIo();
    const p = plan(5);
    SP.setTasks(p, { "foundation-0": true, "practice-0": true }, io);
    assert.deepEqual(keys(SP.load(p, io)).sort(), ["foundation-0", "practice-0"]);
    SP.setTasks(p, { "foundation-0": false }, io);
    assert.deepEqual(keys(SP.load(p, io)), ["practice-0"]);
  });

  test(`${rel}: a regenerated plan does not inherit old checks`, () => {
    const io = memoryIo();
    SP.setTasks(plan(5), { "foundation-0": true, "foundation-1": true }, io);
    const regenerated = plan(5, ["A", "Different"]);
    assert.deepEqual(keys(SP.load(regenerated, io)), ["foundation-0"]); // same title/day kept, changed one dropped
  });

  test(`${rel}: another evaluation never sees these checks`, () => {
    const io = memoryIo();
    SP.setTasks(plan(5), { "foundation-0": true }, io);
    assert.equal(JSON.stringify(SP.load(plan(6), io)), "{}");
  });

  test(`${rel}: legacy / format migrates, ignoring unknown task ids`, () => {
    const io = memoryIo({ karyera_progress_7: JSON.stringify({ "foundation-1": true, "practice-0": true, "foundation-9": true, "x": false }) });
    const done = SP.load(plan(7), io);
    assert.deepEqual(keys(done).sort(), ["foundation-1", "practice-0"]);
    assert.equal(JSON.parse(io.store.karyera_progress_7).version, 2);
  });

  test(`${rel}: legacy dizayn array migrates when no / record exists, then legacy key is removed`, () => {
    const io = memoryIo({ plan_api_7: JSON.stringify(["foundation-0", "interview-0", "bogus"]) });
    assert.deepEqual(keys(SP.load(plan(7), io)).sort(), ["foundation-0", "interview-0"]);
    assert.equal("plan_api_7" in io.store, false);
    assert.deepEqual(keys(SP.load(plan(7), io)).sort(), ["foundation-0", "interview-0"]);
  });

  test(`${rel}: legacy dizayn array is dropped when a legacy / record exists (cannot be verified)`, () => {
    const io = memoryIo({
      karyera_progress_7: JSON.stringify({ "foundation-0": true }),
      plan_api_7: JSON.stringify(["foundation-1", "practice-0"]),
    });
    assert.deepEqual(keys(SP.load(plan(7), io)), ["foundation-0"]);
    assert.equal("plan_api_7" in io.store, false);
  });

  test(`${rel}: ungenerated plans and corrupt records migrate nothing`, () => {
    const io = memoryIo({ plan_api_7: JSON.stringify(["foundation-0"]) });
    assert.equal(JSON.stringify(SP.load({ evaluation_id: 7, generated: false, roadmap: [] }, io)), "{}");
    assert.equal(io.store.plan_api_7, JSON.stringify(["foundation-0"])); // kept until a plan exists
    const bad = memoryIo({ karyera_progress_7: "{oops", plan_api_7: JSON.stringify(["foundation-0"]) });
    assert.equal(JSON.stringify(SP.load(plan(7), bad)), "{}");
    assert.equal(bad.store.karyera_progress_7, "{oops");
  });

  test(`${rel}: reset clears progress and the legacy key`, () => {
    const io = memoryIo({ plan_api_7: JSON.stringify(["foundation-0"]) });
    SP.setTasks(plan(7), { "foundation-1": true }, io);
    SP.reset(7, io);
    assert.equal(JSON.stringify(SP.load(plan(7), io)), "{}");
  });
}

test("the two pages share one storage record end to end", () => {
  const a = load("frontend/js/roadmap.js");
  const b = load("dizayn/js/script.js");
  const io = memoryIo();
  const p = plan(9);
  a.setTasks(p, { "foundation-0": true }, io);
  assert.deepEqual(keys(b.load(p, io)), ["foundation-0"]);
  b.setTasks(p, { "foundation-0": false, "practice-0": true }, io);
  assert.deepEqual(keys(a.load(p, io)), ["practice-0"]);
});
