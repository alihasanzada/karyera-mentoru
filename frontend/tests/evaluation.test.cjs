const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(fetch) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: "", textContent: "", disabled: false, checked: true, value: "cybersecurity",
      files: [{ name: "cv.pdf", size: 100 }],
      classList: { add() {}, remove() {} }, listeners: {},
      addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
      scrollIntoView() {},
      elements: { email: { value: "first@example.com" }, password: { value: "long-test-password" } },
      querySelector: () => ({ disabled: false }),
    });
    return nodes.get(id);
  };
  const context = vm.createContext({
    fetch, AbortController, FormData, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => "test-client-one", setItem() {} },
    document: { getElementById: node, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, scrollTo() {} },
    location: { hash: "#/jobs" }, alert() {},
  });
  for (const file of ["roadmap.js", "applications.js", "app.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "../js", file), "utf8");
    vm.runInContext(file === "app.js" ? source.replace(/boot\(\);\s*$/, "") : source, context);
  }
  return { context, node, run: () => vm.runInContext("runEvaluate()", context) };
}

test("evaluation uses its response ID without a fallible history request", async () => {
  const requests = [];
  const app = setup(async (url, options) => {
    requests.push(url);
    assert.equal(options.method, "POST");
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

test("evaluation waits for CV processing consent", async () => {
  const app = setup(() => assert.fail("Unexpected request without consent"));
  app.node("cv-consent").checked = false;
  await app.run();
  assert.match(app.node("cv-status").textContent, /razılıq/);
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

test("login gate replaces the app for an anonymous visitor", async () => {
  const app = setup(async () => ({ ok: false, status: 401, json: async () => ({ detail: "Hesabına daxil ol." }) }));
  await vm.runInContext("boot()", app.context);
  assert.match(app.node("view").innerHTML, /auth-form/);
  assert.match(app.node("view").innerHTML, /Daxil ol/);
});

test("validation errors from the API are shown in Azerbaijani", async () => {
  const app = setup(async () => ({ ok: false, status: 422, json: async () => ({
    detail: [{ type: "string_too_short", loc: ["body", "password"], ctx: { min_length: 8 } }],
  }) }));
  await assert.rejects(vm.runInContext('api("/api/auth/login", { method: "POST" })', app.context), /Şifrə çox qısadır \(minimum 8/);
});

test("a second click cannot start a duplicate roadmap generation", async () => {
  let resolve;
  let calls = 0;
  const app = setup(() => {
    calls++;
    return new Promise((done) => { resolve = done; });
  });
  vm.runInContext("rmData = { evaluation_id: 5, generated: false }", app.context);
  const pending = vm.runInContext("rmGenerate()", app.context);
  await vm.runInContext("rmGenerate()", app.context);
  assert.equal(calls, 1);
  assert.equal(vm.runInContext("rmBusy()", app.context), true);
  resolve({ ok: true, json: async () => ({ evaluation_id: 5, generated: true, roadmap: [] }) });
  await pending;
  assert.equal(vm.runInContext("rmGenerating", app.context), null);
  assert.equal(vm.runInContext("rmData.generated", app.context), true);
});

test("a late roadmap answer does not replace another evaluation's roadmap", async () => {
  let resolve;
  const app = setup(() => new Promise((done) => { resolve = done; }));
  vm.runInContext("rmData = { evaluation_id: 5, generated: false }", app.context);
  const pending = vm.runInContext("rmGenerate()", app.context);
  vm.runInContext("rmData = { evaluation_id: 9, generated: false }", app.context);
  resolve({ ok: true, json: async () => ({ evaluation_id: 5, generated: true, roadmap: [] }) });
  await pending;
  assert.equal(vm.runInContext("rmData.evaluation_id", app.context), 9);
});

test("adding an application posts only filled fields and stores the result", async () => {
  const requests = [];
  const app = setup(async (url, options) => {
    requests.push({ url, method: options.method, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ id: 3, company: "Acme", position: "Junior", status: "applied", applied_date: "2026-11-19" }) };
  });
  const field = (value) => ({ value });
  const form = {
    querySelector: () => ({ disabled: false }),
    elements: { company: field("Acme"), position: field("Junior"), status: field("applied"),
      notes: field(""), next_step: field(""), applied_date: field(""), next_step_date: field("") },
  };
  await vm.runInContext("appCreate", app.context)(form);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/applications");
  assert.equal(requests[0].method, "POST");
  assert.equal("applied_date" in requests[0].body, false);
  assert.equal(vm.runInContext("appItems[0].id", app.context), 3);
});

const FIELDS = [
  { id: "frontend", name: "Frontend proqramlaşdırma", group: "İnformasiya texnologiyaları" },
  { id: "digər", name: "Digər", group: "Təbiət elmləri və digər" },
  { id: "kompyuter", name: "Kompüter elmləri", group: "İnformasiya texnologiyaları" },
];

function signupForm(app, overrides = {}) {
  const v = (value) => ({ value });
  app.node("auth-form").elements = {
    email: v("first@example.com"), password: v("12345678"), password2: v("12345678"),
    first_name: v("Tahir"), last_name: v("Məmmədov"), specialty_id: v("frontend"),
    consent: { checked: true }, ...overrides,
  };
  let submit;
  app.node("auth-form").addEventListener = (type, fn) => { if (type === "submit") submit = fn; };
  vm.runInContext("renderAuth(true)", app.context);
  return () => submit({ preventDefault() {}, currentTarget: app.node("auth-form") });
}

test("signup sends the profile fields and shows the login form", async () => {
  const requests = [];
  const app = setup(async (url, options) => {
    requests.push({ url, body: options.body && JSON.parse(options.body) });
    const data = url === "/api/match/fields" ? FIELDS : { id: 1, email: "first@example.com" };
    return { ok: true, json: async () => data };
  });
  await signupForm(app)();
  const signup = requests.find((r) => r.url === "/api/auth/signup");
  assert.deepEqual(signup.body, { email: "first@example.com", password: "12345678", first_name: "Tahir",
    last_name: "Məmmədov", specialty_id: "frontend", consent: true });
  assert.equal(requests.some((r) => r.url === "/api/auth/logout"), false);
  assert.match(app.node("view").innerHTML, /Hesab yaradıldı/);
});

test("signup with mismatched passwords is stopped before the request", async () => {
  const requests = [];
  const app = setup(async (url) => {
    requests.push(url);
    return { ok: true, json: async () => FIELDS };
  });
  await signupForm(app, { password2: { value: "different1" } })();
  assert.equal(requests.includes("/api/auth/signup"), false);
  assert.match(app.node("auth-error").textContent, /eyni deyil/);
});

test("specialties are grouped, sorted and Digər comes last", () => {
  const app = setup(async () => ({ ok: true, json: async () => ({}) }));
  const html = vm.runInContext(`specialtyOptions(${JSON.stringify(FIELDS)}, "frontend")`, app.context);
  assert.equal((html.match(/<optgroup/g) || []).length, 2);
  assert.ok(html.indexOf("Frontend") < html.indexOf("Kompüter"));
  assert.match(html, /value="frontend" selected/);
});

test("signup form asks for at least 8 password characters", () => {
  const app = setup(async () => ({ ok: true, json: async () => FIELDS }));
  vm.runInContext("renderAuth(true)", app.context);
  assert.match(app.node("view").innerHTML, /minlength="8"/);
  assert.match(app.node("view").innerHTML, /Ən azı 8 simvol/);
});

test("legacy login shows verification and waits to set the signed-in user", async () => {
  const requests = [];
  const app = setup(async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    const data = url.endsWith("/login")
      ? { expires_in: 300, resend_after: 60 }
      : { id: 1, email: "first@example.com", first_name: "Tahir" };
    return { ok: true, json: async () => data };
  });
  let bindOptions;
  app.context.startEmailOtp = (form, options) => { bindOptions = options; };
  let submit;
  const login = app.node("auth-form");
  login.addEventListener = (type, callback) => { if (type === "submit") submit = callback; };
  vm.runInContext("renderAuth(); route = () => {};", app.context);
  await submit({ preventDefault() {}, currentTarget: login });
  assert.match(app.node("view").innerHTML, /E-poçt təsdiqi/);
  assert.equal(vm.runInContext("state.user", app.context), null);
  assert.equal(login.elements.password.value, "");
  assert.equal(requests.length, 1);

  const verified = await bindOptions.request("/api/auth/otp/verify", { code: "123456" });
  bindOptions.onVerified(verified);
  assert.equal(vm.runInContext("state.user.id", app.context), 1);
  assert.equal(requests[1].url, "/api/auth/otp/verify");
});

test("legacy logout reports a failed request without pretending the session ended", async () => {
  const app = setup(async () => ({
    ok: false, status: 503, json: async () => ({ detail: "Server əlçatan deyil." }),
  }));
  const messages = [];
  app.context.recordNotice = (message, isError) => messages.push({ message, isError });
  vm.runInContext("state.user = {id: 1}; notify = recordNotice;", app.context);
  await app.node("logout-btn").listeners.click[0]();
  assert.equal(vm.runInContext("state.user.id", app.context), 1);
  assert.deepEqual(messages, [{ message: "Server əlçatan deyil.", isError: true }]);
});
