const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = fs.readFileSync(path.join(__dirname, "../js/roadmap.js"), "utf8");
const design = fs.readFileSync(path.join(__dirname, "../../dizayn/js/script.js"), "utf8");
const readProgress = design.slice(design.indexOf("function readApiPlanState("), design.indexOf("function planMessage("));
const onChange = design.slice(design.indexOf('planDaysEl.addEventListener("change"'), design.indexOf("segments.forEach((btn)", design.indexOf('planDaysEl.addEventListener("change"')));

test("both roadmap pages read and update the same server-backed task state", async () => {
  const endpoint = "/api/roadmap/42/tasks/foundation-0";
  const evaluation = { evaluation_id: 42, generated: true, completed_task_ids: [] };
  let saved = evaluation;
  const writes = [];

  function save(url, method, body) {
    assert.equal(url, endpoint);
    assert.equal(method, "PUT");
    assert.equal(typeof body.completed, "boolean");
    writes.push(body.completed);
    saved = { ...evaluation, completed_task_ids: body.completed ? ["foundation-0"] : [] };
    return saved;
  }

  const oldBox = { checked: true, isConnected: true, dataset: { task: "foundation-0" } };
  const oldListeners = {};
  const view = {
    addEventListener(name, listener) { oldListeners[name] = listener; },
    querySelectorAll() { return [oldBox]; },
  };
  const oldPage = vm.createContext({
    $: () => view,
    api: async (url, options) => save(url, options.method, JSON.parse(options.body)),
  });
  vm.runInContext(root, oldPage);
  oldPage.initialPlan = saved;
  vm.runInContext("rmData = initialPlan; rmUpdateProgress = () => {}; rmBind();", oldPage);
  await oldListeners.change({ target: { closest: () => oldBox } });
  assert.deepEqual(vm.runInContext("rmData.completed_task_ids", oldPage), ["foundation-0"]);
  assert.equal(oldBox.disabled, false);

  const redesignedBox = { matches: () => true, checked: false, dataset: { task: "foundation-0" } };
  const redesignedListeners = {};
  const planDaysEl = {
    addEventListener(name, listener) { redesignedListeners[name] = listener; },
    querySelectorAll() { return [redesignedBox]; },
  };
  const redesigned = vm.createContext({
    planDaysEl,
    apiMode: true,
    apiUser: { id: 1 },
    currentAnalysis: { id: "42", api: true },
    apiRoadmaps: new Map([["42", saved]]),
    sendJson: async (url, body, method) => save(url, method, body),
    renderApiPlan() {},
  });
  vm.runInContext(readProgress + onChange, redesigned);
  assert.deepEqual(vm.runInContext("readApiPlanState(currentAnalysis)", redesigned), ["foundation-0"]);
  await redesignedListeners.change({ target: redesignedBox });
  assert.deepEqual(vm.runInContext("readApiPlanState(currentAnalysis)", redesigned), []);
  assert.deepEqual(writes, [true, false]);
});
