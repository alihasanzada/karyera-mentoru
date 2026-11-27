const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = ["email-otp.js", "script.js"]
  .map((file) => fs.readFileSync(path.join(__dirname, "../../dizayn/js", file), "utf8")).join("\n");
const FIELDS = [{ id: "frontend", name: "Frontend", group: "IT" }, { id: "cybersecurity", name: "Kibertəhlükəsizlik", group: "IT" }];
const SIGNUP_VALUES = {
  "reg-name": "Tahir", "reg-surname": "Məmmədov", "reg-email": "  New@Example.com ",
  "reg-pass": "12345678", "reg-pass2": "12345678", "reg-major": "cybersecurity",
};

// Minimal DOM: every selector resolves to one shared stub, unknown members are harmless no-ops.
function makeDom() {
  const registry = new Map();
  const noop = () => stub();
  function stub(key) {
    const target = {
      value: "", textContent: "", innerHTML: "", disabled: false, hidden: false, checked: false,
      attrs: {}, listeners: {}, focused: 0, classes: new Set(),
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      focus() { this.focused++; }, select() {}, reset() {},
      querySelectorAll: () => [], querySelector: (selector) => node(key + " " + selector), appendChild() {},
      open: false, showModal() { this.open = true; }, close() { this.open = false; },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      closest: () => stub(),
      style: { setProperty() {}, removeProperty() {} }, dataset: {}, options: [], children: [], childNodes: [], files: [],
    };
    return new Proxy(target, {
      get: (obj, prop) => (prop in obj || typeof prop === "symbol" ? obj[prop] : noop),
      set: (obj, prop, value) => ((obj[prop] = value), true),
    });
  }
  const node = (key) => {
    if (!registry.has(key)) registry.set(key, stub(key));
    return registry.get(key);
  };
  const selectorKey = (selector) => (selector.startsWith("#") && /^#[\w-]+$/.test(selector) ? selector.slice(1) : selector);
  const authTabs = ["tab-login", "tab-register"];
  const tabPanels = { "tab-login": "panel-login", "tab-register": "panel-register" };
  for (const id of authTabs) {
    node(id).setAttribute("aria-controls", tabPanels[id]);
    node(id).closest = () => ({ querySelectorAll: () => authTabs.map(node) });
    node(tabPanels[id]).hidden = id !== "tab-login";
  }
  node("tab-login").setAttribute("aria-selected", "true");
  return {
    node,
    document: {
      querySelector: (selector) => node(selectorKey(selector)),
      getElementById: node,
      querySelectorAll: () => [],
      addEventListener() {},
      documentElement: node("html"),
      createElement: () => stub(),
    },
  };
}

async function setup(fetch, storage = new Map()) {
  const dom = makeDom();
  const context = vm.createContext({
    fetch, AbortController, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, console,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    document: dom.document,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), scrollTo() {} },
    location: { protocol: "http:", hash: "", pathname: "/dizayn/" },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    IntersectionObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => fn(), matchMedia: () => ({ matches: false, addEventListener() {} }),
  });
  vm.runInContext(SOURCE, context);
  for (let i = 0; i < 20 && !vm.runInContext("apiChecked", context); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(vm.runInContext("apiChecked", context), true, "frontend boot completed");
  return { ...dom, context, storage };
}

function fillSignup(app, values = {}, consent = true) {
  for (const [id, value] of Object.entries({ ...SIGNUP_VALUES, ...values })) app.node(id).value = value;
  app.node("reg-consent").checked = consent;
}

const submitSignup = (app) => app.node("register-form").listeners.submit[0]({ preventDefault() {} });

function backend(signupResponse, requests) {
  return async (url, options = {}) => {
    requests.push({ url, method: options.method, body: options.body && JSON.parse(options.body) });
    if (url === "/health") return { ok: true, json: async () => ({ status: "ok" }) };
    if (url === "/api/match/fields") return { ok: true, json: async () => FIELDS };
    if (url === "/api/auth/signup") return signupResponse;
    return { ok: false, status: 401, json: async () => ({ detail: "Hesabına daxil ol." }) };
  };
}

test("dizayn signup sends the full profile and opens the login tab after 201", async () => {
  const requests = [];
  const app = await setup(backend(
    { ok: true, status: 201, json: async () => ({ id: 1, email: "new@example.com" }) }, requests));
  fillSignup(app);
  await submitSignup(app);

  const signup = requests.filter((r) => r.url === "/api/auth/signup");
  assert.equal(signup.length, 1);
  assert.deepEqual(signup[0].body, {
    email: "new@example.com", password: "12345678", first_name: "Tahir", last_name: "Məmmədov",
    specialty_id: "cybersecurity", consent: true,
  });
  assert.equal(requests.some((r) => r.url === "/api/auth/login"), false, "signup must not log in");
  assert.equal(vm.runInContext("apiUser", app.context), null);
  assert.equal(app.storage.has("aktivIstifadeci"), false);

  assert.equal(app.node("tab-login").getAttribute("aria-selected"), "true");
  assert.equal(app.node("tab-register").getAttribute("aria-selected"), "false");
  assert.equal(app.node("panel-login").hidden, false);
  assert.equal(app.node("panel-register").hidden, true);
  assert.equal(app.node("login-email").value, "new@example.com");
  assert.equal(app.node("login-notice").textContent, "Hesab yaradıldı. İndi daxil ol.");
  assert.equal(app.node("login-btn").hidden, false);
});

test("dizayn password starts a challenge and only verified OTP signs in", async () => {
  const requests = [];
  const fetch = backend({ ok: true, status: 201, json: async () => ({ id: 1, email: "new@example.com" }) }, requests);
  const app = await setup(async (url, options) => {
    if (url === "/api/auth/login") {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 202, json: async () => ({ expires_in: 300, resend_after: 60 }) };
    }
    if (url === "/api/auth/otp/verify") {
      requests.push({ url });
      if (JSON.parse(options.body).code === "000000") {
        return { ok: false, status: 400, json: async () => ({ detail: "Giriş kodu yanlışdır." }) };
      }
      return { ok: true, json: async () => ({ id: 1, email: "new@example.com" }) };
    }
    if (url === "/api/profile") return { ok: true, json: async () => ({ name: "Tahir" }) };
    return fetch(url, options);
  });
  app.node("auth-modal").open = true;
  app.node("login-email").value = "new@example.com";
  app.node("login-pass").value = "12345678";
  await app.node("login-form").listeners.submit[0]({ preventDefault() {} });
  assert.equal(requests.filter((r) => r.url === "/api/auth/login").length, 1);
  assert.equal(vm.runInContext("apiUser", app.context), null);
  const form = app.node("otp-form");
  assert.equal(form.hidden, false);
  assert.equal(app.node("login-pass").value, "");
  assert.equal(form.querySelector("[data-otp-resend]").disabled, true);

  form.querySelector("[name=code]").value = "000000";
  await form.onsubmit({ preventDefault() {} });
  assert.match(form.querySelector("[data-otp-error]").textContent, /yanlışdır/);
  assert.equal(vm.runInContext("apiUser", app.context), null);
  form.querySelector("[name=code]").value = "123456";
  await form.onsubmit({ preventDefault() {} });
  assert.equal(vm.runInContext("apiUser.email", app.context), "new@example.com");
  assert.equal(form.hidden, true);
});

test("dizayn signup shows backend 422 errors next to the matching fields", async () => {
  const requests = [];
  const app = await setup(backend({ ok: false, status: 422, json: async () => ({ detail: [
    { type: "string_too_short", loc: ["body", "first_name"], ctx: { min_length: 2 } },
    { type: "value_error", loc: ["body", "specialty_id"] },
    { type: "literal_error", loc: ["body", "consent"] },
    { type: "value_error", loc: ["body", "email"] },
    { type: "string_too_short", loc: ["body", "password"], ctx: { min_length: 8 } },
  ] }) }, requests));
  fillSignup(app);
  await submitSignup(app);

  assert.equal(app.node("reg-name-error").textContent, "Ad çox qısadır (minimum 2 simvol).");
  assert.equal(app.node("reg-major-error").textContent, "İxtisasını siyahıdan seç.");
  assert.equal(app.node("reg-consent-error").textContent, "Davam etmək üçün razılığını təsdiqlə.");
  assert.equal(app.node("reg-email-error").textContent, "Düzgün e-poçt ünvanı yaz.");
  assert.equal(app.node("reg-pass-error").textContent, "Şifrə çox qısadır (minimum 8 simvol).");
  assert.equal(app.node("register-error").textContent, "");
  assert.equal(app.node("tab-register").getAttribute("aria-selected"), null, "stays on the signup tab");
});

test("dizayn signup shows a 409 on the email field", async () => {
  const requests = [];
  const app = await setup(backend({ ok: false, status: 409, json: async () => ({ detail: "Bu e-poçt artıq qeydiyyatdan keçib." }) }, requests));
  fillSignup(app);
  await submitSignup(app);
  assert.equal(app.node("reg-email-error").textContent, "Bu e-poçt artıq qeydiyyatdan keçib.");
  assert.equal(app.node("login-notice").textContent, "");
  assert.equal(app.node("register-error").textContent, "");
});

test("dizayn file preview cannot create an account or sign in", async () => {
  const requests = [];
  const dom = makeDom();
  const storage = new Map();
  const context = vm.createContext({
    fetch: async (url) => { requests.push(url); throw new Error("no network"); },
    AbortController, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, console,
    crypto: require("node:crypto").webcrypto, TextEncoder,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    document: dom.document,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), scrollTo() {} },
    location: { protocol: "file:", hash: "", pathname: "/dizayn/index.html" },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    IntersectionObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => fn(), matchMedia: () => ({ matches: false, addEventListener() {} }),
  });
  vm.runInContext(SOURCE, context);
  assert.equal(vm.runInContext("apiChecked", context), true);
  for (const [id, value] of Object.entries(SIGNUP_VALUES)) dom.node(id).value = value;
  dom.node("reg-consent").checked = true;
  await dom.node("register-form").listeners.submit[0]({ preventDefault() {} });
  assert.deepEqual(requests, []);
  assert.equal(storage.has("istifadeciler"), false);
  assert.match(dom.node("register-error").textContent, /serverdən aç/);
  storage.set("aktivIstifadeci", "new@example.com");
  await dom.node("login-form").listeners.submit[0]({ preventDefault() {} });
  assert.match(dom.node("login-error").textContent, /serverdən aç/);
  assert.equal(vm.runInContext("getCurrentUser()", context), null);
});

// ----- Profile in server mode -----

// Stateful fake server so a "page reload" (new setup, same server and storage) sees saved values
function fakeServer(user, requests = []) {
  return async (url, options = {}) => {
    const body = options.body && JSON.parse(options.body);
    requests.push({ url, method: options.method || "GET", body });
    const ok = (data) => ({ ok: true, json: async () => data });
    if (url === "/health") return ok({ status: "ok" });
    if (url === "/api/match/fields") return ok(FIELDS);
    if (url === "/api/history?kind=evaluation") return ok([]);
    if (url === "/api/profile" && options.method === "PUT") {
      user.profile = body;
      return ok(user.profile);
    }
    if (url === "/api/profile") return ok(user.profile || {
      name: user.first_name, surname: user.last_name, field_id: user.specialty_id,
    });
    if (url === "/api/auth/me") return ok(user);
    return { ok: false, status: 404, json: async () => ({ detail: "yoxdur" }) };
  };
}

const submitProfile = (app) => app.node("profile-form").listeners.submit[0]({ preventDefault() {} });

test("history and roadmap reads coalesce, and old account data is discarded", async () => {
  const calls = [];
  const pending = new Map();
  const app = await setup(async (url) => {
    if (url === "/api/match/fields") return { ok: true, json: async () => FIELDS };
    if (url === "/api/auth/me") return { ok: false, status: 401, json: async () => ({}) };
    calls.push(url);
    return new Promise((resolve) => pending.set(url, resolve));
  });
  const run = (source) => vm.runInContext(source, app.context);
  run("apiUser = {id: 1};");
  const history = run("Promise.all([loadApiHistory(), loadApiHistory()])");
  const roadmap = run('Promise.all([loadApiRoadmap("42"), loadApiRoadmap("42")])');
  assert.deepEqual(calls, ["/api/history?kind=evaluation", "/api/roadmap/42"]);
  run("clearAccountState(); apiUser = {id: 1};");
  pending.get("/api/history?kind=evaluation")({ ok: true, json: async () => [{ id: 42 }] });
  pending.get("/api/roadmap/42")({ ok: true, json: async () => ({ generated: true }) });
  await Promise.all([history, roadmap]);
  assert.equal(run("apiHistory.length"), 0);
  assert.equal(run("apiRoadmaps.size"), 0);
});

test("a duration change cannot submit a second roadmap generation and failure allows retry", async () => {
  const requests = [];
  let resolve;
  const app = await setup(async (url, options = {}) => {
    if (url === "/api/match/fields") return { ok: true, json: async () => FIELDS };
    if (url === "/api/auth/me") return { ok: false, status: 401, json: async () => ({}) };
    requests.push([url, options.method]);
    return new Promise((done) => { resolve = done; });
  });
  const run = (source) => vm.runInContext(source, app.context);
  run('apiUser = {id: 1}; currentAnalysis = {id: "42", planDays: 7}; apiRoadmaps.set("42", {generated: false});');
  const first = run("generateApiPlan(currentAnalysis)");
  run("currentAnalysis.planDays = 14; renderApiPlan(currentAnalysis);");
  await run("generateApiPlan(currentAnalysis)");
  assert.equal(requests.length, 1);
  resolve({ ok: false, status: 503, json: async () => ({ detail: "Sınaq xətası" }) });
  await first;
  const retry = run("generateApiPlan(currentAnalysis)");
  resolve({ ok: true, json: async () => ({ generated: true, roadmap: [], completed_task_ids: [] }) });
  await retry;
  assert.deepEqual(requests, [["/api/roadmap/42", "POST"], ["/api/roadmap/42", "POST"]]);
  assert.equal(run('apiRoadmaps.get("42").generated'), true);
});

test("legacy account with empty server profile is not filled from old browser data", async () => {
  const requests = [];
  const storage = new Map([["profil:old@example.com", JSON.stringify({ name: "Köhnə", surname: "Ad", major: "frontend", premium: true })]]);
  const server = { id: 1, email: "old@example.com", first_name: "", last_name: "", specialty_id: "" };
  const app = await setup(fakeServer(server, requests), storage);

  const user = vm.runInContext("apiUser", app.context);
  assert.deepEqual({ name: user.name, surname: user.surname, major: user.major },
    { name: "", surname: "", major: "" });
  assert.equal(user.premium, undefined);
  assert.equal(vm.runInContext("userLabel(apiUser)", app.context), "old");
  assert.deepEqual(requests.filter((r) => r.method !== "GET"), [], "no automatic write to the server");
  assert.deepEqual(server, { id: 1, email: "old@example.com", first_name: "", last_name: "", specialty_id: "" });
});

test("profile update in server mode is saved on the server and survives a reload", async () => {
  const requests = [];
  const storage = new Map();
  const server = { id: 1, email: "old@example.com", first_name: "", last_name: "", specialty_id: "" };
  const app = await setup(fakeServer(server, requests), storage);

  app.node("profile-name").value = "Tahir";
  app.node("profile-surname").value = "Məmmədov";
  app.node("profile-major").value = "cybersecurity";
  app.node("profile-education").value = "Bakalavr";
  app.node("profile-interests").value = "Məlumat analitikası";
  app.node("profile-skills").value = "Python, SQL";
  await submitProfile(app);

  const writes = requests.filter((r) => r.method === "PUT");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url, "/api/profile");
  assert.deepEqual(writes[0].body, {
    name: "Tahir", surname: "Məmmədov", field_id: "cybersecurity",
    education: "Bakalavr", interests: "Məlumat analitikası", skills: ["Python", "SQL"],
  });
  assert.equal(storage.has("profil:old@example.com"), false, "profile fields are not written to localStorage");

  const reloaded = await setup(fakeServer(server), storage);
  const user = vm.runInContext("apiUser", reloaded.context);
  assert.deepEqual({ name: user.name, surname: user.surname, major: user.major }, { name: "Tahir", surname: "Məmmədov", major: "cybersecurity" });
  assert.equal(user.education, "Bakalavr");
  assert.deepEqual([...user.skills], ["Python", "SQL"]);
  assert.equal(reloaded.node("user-name").textContent, "Tahir");
  assert.equal(reloaded.node("user-full-name").textContent, "Tahir Məmmədov");
});

test("server validation errors appear on the profile fields", async () => {
  const server = { id: 1, email: "old@example.com", first_name: "", last_name: "", specialty_id: "" };
  const fetch = fakeServer(server);
  const app = await setup(async (url, options = {}) => options.method === "PUT"
    ? { ok: false, status: 422, json: async () => ({ detail: [
      { type: "value_error", loc: ["body", "field_id"] },
      { type: "too_long", loc: ["body", "skills"] },
    ] }) }
    : fetch(url, options));
  app.node("profile-name").value = "Tahir";
  app.node("profile-surname").value = "Məmmədov";
  app.node("profile-major").value = "frontend";
  await submitProfile(app);
  assert.equal(app.node("profile-major-error").textContent, "İxtisasını siyahıdan seç.");
  assert.equal(app.node("profile-skills-error").textContent, "Ən çox 24 bacarıq əlavə et.");
});

// ----- CV privacy wording -----

const ROOT_SOURCE = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const DIZAYN_HTML = fs.readFileSync(path.join(__dirname, "../../dizayn/index.html"), "utf8");

test("homepage preview describes CV analysis and links to the actual upload form", () => {
  const preview = DIZAYN_HTML.match(/<article class="card feature-preview reveal"[\s\S]*?<\/article>/)?.[0];
  assert.ok(preview);
  assert.match(preview, /AI ilə CV analizi/);
  assert.match(preview, /Nəticələr CV-ni yüklədikdən sonra hazırlanır/);
  assert.equal((preview.match(/<li>/g) || []).length, 4);
  assert.match(preview, /href="#cv-yoxla"[^>]*>CV-ni yoxla/);
  assert.match(DIZAYN_HTML, /id="cv-yoxla"/);
  assert.match(DIZAYN_HTML, /id="cv-form"/);
  assert.doesNotMatch(DIZAYN_HTML, /72\/100|data-count="72"|cv-flag|rewrite-score|id="(?:reyler|reviews|carousel-[^"]+)"/);
  assert.doesNotMatch(SOURCE, /#reviews|#carousel-/);
});
const constant = (source, name) => new RegExp(`const ${name} =\\s*"([^"]+)"`).exec(source)?.[1];

test("server-mode CV privacy note states what the backend really does, on both pages", async () => {
  const note = constant(SOURCE, "CV_PRIVACY_NOTE");
  assert.equal(constant(ROOT_SOURCE, "CV_PRIVACY_NOTE"), note, "/ and /dizayn/ use the same wording");
  assert.match(ROOT_SOURCE, /id="cv-privacy"[^>]*>\$\{CV_PRIVACY_NOTE\}/);
  for (const fact of [/PDF serverə göndərilir/, /PDF-in özü daimi saxlanmır/, /15 000 simvolu/, /Gemini/,
    /sitatlar tarixçədə/, /analiz keşində/, /silmə düyməsi yoxdur/]) assert.match(note, fact);

  const server = { id: 1, email: "a@example.com", first_name: "A", last_name: "B", specialty_id: "frontend" };
  const app = await setup(fakeServer(server));
  assert.match(app.node("cv-privacy-note").textContent, /Gemini-yə ötürülə bilər/);
  assert.match(app.node("cv-file-hint").textContent, /serverə göndərilir/);
  const faq = app.node("faq-privacy-answer").textContent;
  assert.match(faq, /ilk 15 000 simvolu/);
  assert.match(faq, /keşindəki nüsxə isə silinmir/);
  assert.doesNotMatch(faq + note, /şifrələ|üçüncü tərəf|istədiyin vaxt silin/i, "no promises the code does not keep");
});

test("demo (file://) CV privacy text says nothing is sent anywhere", () => {
  const note = /id="cv-privacy-note">([^<]+)</.exec(DIZAYN_HTML)[1];
  const faq = /id="faq-privacy-answer">([^<]+)</.exec(DIZAYN_HTML)[1];
  assert.match(note, /fayl serverə və AI-yə göndərilmir/);
  assert.match(faq, /serverə və AI-yə göndərilmir/);
  assert.match(faq, /localStorage/);
  assert.doesNotMatch(faq + note, /şifrələ|üçüncü tərəf|istədiyin vaxt silin/i);
  assert.match(DIZAYN_HTML, /aria-describedby="cv-file-hint cv-file-error cv-privacy-note"/);
});

// ----- Honest UI: forms that send nothing, Premium and payment demo -----

const withoutComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
const PAGE = withoutComments(DIZAYN_HTML);
const section = (id) => new RegExp(`id="${id}"[\\s\\S]*?</(?:section|footer|dialog)>`).exec(PAGE)[0];

test("partner and newsletter forms say up front that nothing is sent and cannot be submitted", () => {
  const partner = section("terefdasliq");
  assert.match(partner, /Bu forma hələ işləmir/);
  assert.match(partner, /heç yerə göndərilmir və saxlanmır/);
  assert.match(partner, /id="partner-name"[^>]*disabled/);
  assert.match(partner, /id="partner-email"[^>]*disabled/);
  assert.match(partner, /type="submit"[^>]*disabled>Müraciət hələ qəbul edilmir/);
  const footer = /<footer[\s\S]*<\/footer>/.exec(PAGE)[0];
  assert.match(footer, /Bülleten hələ işləmir/);
  assert.match(footer, /id="newsletter-email"[^>]*disabled/);
  assert.match(footer, /type="submit"[^>]*disabled>Tezliklə/);
  assert.doesNotMatch(PAGE, /mailto:|href="tel:/, "no unconfirmed contact channel");
  assert.doesNotMatch(SOURCE + PAGE, /Müraciətiniz qəbul edildi|abunə oldun/i);
});

test("submitting the partner or newsletter form (Enter key) sends nothing and shows no success", async () => {
  const requests = [];
  const server = { id: 1, email: "a@example.com", first_name: "A", last_name: "B", specialty_id: "frontend" };
  const app = await setup(fakeServer(server, requests));
  vm.runInContext("globalThis.__toasts = []; showToast = (m, t) => __toasts.push([m, t]);", app.context);
  const before = requests.length;
  await app.node("partner-form").listeners.submit[0]({ preventDefault() {} });
  await app.node("newsletter-form").listeners.submit[0]({ preventDefault() {} });
  const shown = vm.runInContext("__toasts", app.context).map((t) => t[0]);
  assert.equal(requests.length, before, "no request is made");
  assert.deepEqual([...shown], ["Tərəfdaşlıq forması hələ işləmir — heç nə göndərilmədi.", "Bülleten hələ işləmir — abunə yaranmadı."]);
});

test("pricing card and FAQ match what the code really does", () => {
  const pricing = section("qiymetler");
  assert.match(pricing, /limit tətbiq edilmir/);
  assert.match(pricing, /Premium heç bir bölməni kilidləmir/);
  assert.match(pricing, /Planlaşdırılır: canlı vakansiya uyğunluğu/);
  assert.match(pricing, /AI Mentor pulsuz betaya daxildir/);
  assert.doesNotMatch(PAGE + SOURCE, /Ayda 1 CV analizi|Limitsiz CV analizi|İlk 30 tələbə|Ən Populyar|Premium-a keç|ilk pilot pulsuzdur/i);
  const faq = /Pulsuz və Premium arasında fərq nədir[\s\S]*?<\/p>/.exec(PAGE)[0];
  assert.match(faq, /funksional fərq yoxdur/);
  assert.match(faq, /vakansiyalar nümunədir/i);
  assert.match(section("panel-jobs"), /real elan deyil/);
  assert.match(PAGE, /Hazır cavablar · Nümunə/);
});

test("Premium preview opens and closes without collecting data or changing account state", async () => {
  const modal = section("pay-modal");
  assert.doesNotMatch(modal, /<form|<input|<select|<textarea/);
  assert.match(modal, /kart məlumatı daxil edilmir, abunəlik aktivləşmir və ödəniş alınmır/);

  const requests = [];
  const storage = new Map();
  const server = { id: 1, email: "a@example.com", first_name: "A", last_name: "B", specialty_id: "frontend" };
  const app = await setup(fakeServer(server, requests), storage);
  const dialog = app.node("pay-modal");
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  app.node('[data-plan="premium"]').listeners.click[0]();
  assert.equal(dialog.open, true);
  app.node("pay-done").listeners.click[0]();
  assert.equal(dialog.open, false);
  assert.deepEqual(requests.filter((r) => r.method !== "GET"), []);
  assert.equal(storage.has("profil:a@example.com"), false);
});
