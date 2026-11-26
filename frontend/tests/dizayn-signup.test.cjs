const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../../dizayn/js/script.js"), "utf8");
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
      querySelectorAll: () => [], querySelector: () => stub(), appendChild() {},
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
  await vm.runInContext("apiReady", context);
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); // let API boot finish
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

test("dizayn login after signup is what starts the session", async () => {
  const requests = [];
  const fetch = backend({ ok: true, status: 201, json: async () => ({ id: 1, email: "new@example.com" }) }, requests);
  const app = await setup(async (url, options) => {
    if (url === "/api/auth/login") {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ id: 1, email: "new@example.com" }) };
    }
    return fetch(url, options);
  });
  app.node("login-email").value = "new@example.com";
  app.node("login-pass").value = "12345678";
  await app.node("login-form").listeners.submit[0]({ preventDefault() {} });
  assert.equal(requests.filter((r) => r.url === "/api/auth/login").length, 1);
  assert.equal(vm.runInContext("apiUser.email", app.context), "new@example.com");
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

test("dizayn demo mode (file://) keeps the local signup flow", async () => {
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
  await vm.runInContext("apiReady", context);
  for (const [id, value] of Object.entries(SIGNUP_VALUES)) dom.node(id).value = value;
  dom.node("reg-consent").checked = true;
  await dom.node("register-form").listeners.submit[0]({ preventDefault() {} });
  assert.deepEqual(requests, []);
  assert.equal(JSON.parse(storage.get("istifadeciler"))[0].email, "new@example.com");
  assert.equal(storage.get("aktivIstifadeci"), "new@example.com");
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
    if (url === "/api/history") return ok([]);
    if (url === "/api/auth/me" && options.method === "PATCH") return ok(Object.assign(user, body));
    if (url === "/api/auth/me") return ok(user);
    return { ok: false, status: 404, json: async () => ({ detail: "yoxdur" }) };
  };
}

const submitProfile = (app) => app.node("profile-form").listeners.submit[0]({ preventDefault() {} });

test("legacy account with empty server profile is not filled from old browser data", async () => {
  const requests = [];
  const storage = new Map([["profil:old@example.com", JSON.stringify({ name: "Köhnə", surname: "Ad", major: "frontend", premium: true })]]);
  const server = { id: 1, email: "old@example.com", first_name: "", last_name: "", specialty_id: "" };
  const app = await setup(fakeServer(server, requests), storage);

  const user = vm.runInContext("apiUser", app.context);
  assert.deepEqual({ name: user.name, surname: user.surname, major: user.major, premium: user.premium },
    { name: "", surname: "", major: "", premium: true });
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
  await submitProfile(app);

  const patch = requests.filter((r) => r.method === "PATCH");
  assert.equal(patch.length, 1);
  assert.deepEqual(patch[0].body, { first_name: "Tahir", last_name: "Məmmədov", specialty_id: "cybersecurity" });
  assert.equal(storage.has("profil:old@example.com"), false, "profile fields are not written to localStorage");

  const reloaded = await setup(fakeServer(server), storage);
  const user = vm.runInContext("apiUser", reloaded.context);
  assert.deepEqual({ name: user.name, surname: user.surname, major: user.major }, { name: "Tahir", surname: "Məmmədov", major: "cybersecurity" });
  assert.equal(reloaded.node("user-name").textContent, "Tahir");
  assert.equal(reloaded.node("user-full-name").textContent, "Tahir Məmmədov");
});

test("server validation errors appear on the profile fields", async () => {
  const server = { id: 1, email: "old@example.com", first_name: "", last_name: "", specialty_id: "" };
  const fetch = fakeServer(server);
  const app = await setup(async (url, options = {}) => options.method === "PATCH"
    ? { ok: false, status: 422, json: async () => ({ detail: [{ type: "value_error", loc: ["body", "specialty_id"] }] }) }
    : fetch(url, options));
  app.node("profile-name").value = "Tahir";
  app.node("profile-surname").value = "Məmmədov";
  app.node("profile-major").value = "frontend";
  await submitProfile(app);
  assert.equal(app.node("profile-major-error").textContent, "İxtisasını siyahıdan seç.");
});

test("demo Premium still lives in the browser in server mode and does not touch the profile", async () => {
  const requests = [];
  const storage = new Map();
  const server = { id: 1, email: "old@example.com", first_name: "Tahir", last_name: "Məmmədov", specialty_id: "frontend" };
  const app = await setup(fakeServer(server, requests), storage);
  vm.runInContext('updateCurrentUser({ premium: true, premiumSince: "2026-11-21", name: "Başqa" })', app.context);
  const saved = JSON.parse(storage.get("profil:old@example.com"));
  assert.deepEqual(saved, { premium: true, premiumSince: "2026-11-21" });
  assert.deepEqual(requests.filter((r) => r.method !== "GET"), []);

  const reloaded = await setup(fakeServer(server), storage);
  assert.equal(vm.runInContext("apiUser.premium", reloaded.context), true);
  assert.equal(vm.runInContext("apiUser.name", reloaded.context), "Tahir");
});

test("file:// demo profile edits stay in localStorage", async () => {
  const storage = new Map();
  const dom = makeDom();
  const context = vm.createContext({
    fetch: async () => { throw new Error("no network"); },
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
  await vm.runInContext("apiReady", context);
  storage.set("istifadeciler", JSON.stringify([{ name: "Ali", surname: "Vəli", email: "demo@example.com", major: "frontend", passHash: "x" }]));
  storage.set("aktivIstifadeci", "demo@example.com");
  dom.node("profile-name").value = "Əli";
  dom.node("profile-surname").value = "Vəliyev";
  dom.node("profile-major").value = "cybersecurity";
  await dom.node("profile-form").listeners.submit[0]({ preventDefault() {} });
  const user = JSON.parse(storage.get("istifadeciler"))[0];
  assert.deepEqual({ name: user.name, surname: user.surname, major: user.major }, { name: "Əli", surname: "Vəliyev", major: "cybersecurity" });
  vm.runInContext('updateCurrentUser({ premium: true })', context);
  assert.equal(JSON.parse(storage.get("istifadeciler"))[0].premium, true);
});

// ----- CV privacy wording -----

const ROOT_SOURCE = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const DIZAYN_HTML = fs.readFileSync(path.join(__dirname, "../../dizayn/index.html"), "utf8");
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
  assert.match(app.node("cv-privacy-note").textContent, /hesaba daxil ol/);
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
  const toasts = [];
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
  assert.match(pricing, /AI Mentor sayt serverlə açılanda və hesaba daxil olanda real AI ilə cavab verir/);
  assert.doesNotMatch(PAGE + SOURCE, /Ayda 1 CV analizi|Limitsiz CV analizi|İlk 30 tələbə|Ən Populyar|Premium-a keç|ilk pilot pulsuzdur/i);
  const faq = /Pulsuz və Premium arasında fərq nədir[\s\S]*?<\/p>/.exec(PAGE)[0];
  assert.match(faq, /funksional fərq yoxdur/);
  assert.match(faq, /vakansiyalar nümunədir/);
  assert.match(section("panel-jobs"), /real elan deyil/);
  assert.match(PAGE, /Demo · AI deyil/);
});

test("demo payment has no card fields, only the test card example, and unlocks nothing", async () => {
  const modal = section("pay-modal");
  assert.doesNotMatch(modal, /<input|<select|<textarea/);
  assert.match(modal, /kart məlumatı daxil etmə/);
  assert.match(modal, /4242 4242 4242 4242/);
  assert.doesNotMatch(SOURCE, /luhnValid|expiryValid|payNumber|payCvv|#pay-name|#pay-number/);

  const requests = [];
  const storage = new Map();
  const server = { id: 1, email: "a@example.com", first_name: "A", last_name: "B", specialty_id: "frontend" };
  const app = await setup(fakeServer(server, requests), storage);
  vm.runInContext("globalThis.__toasts = []; showToast = (m) => __toasts.push(m); setTimeout = (fn) => { fn(); return 0; };", app.context);
  vm.runInContext("openPayment()", app.context);
  await app.node("pay-form").listeners.submit[0]({ preventDefault() {} });
  assert.deepEqual([...vm.runInContext("__toasts", app.context)], ["Demo ödəniş nümunəsi tamamlandı. Pul çıxılmadı."]);
  assert.equal(JSON.parse(storage.get("profil:a@example.com")).premium, true);
  assert.equal(vm.runInContext("apiUser.premium", app.context), true);
  assert.deepEqual(requests.filter((r) => r.method !== "GET"), [], "payment sends nothing to the server");
  assert.equal(app.node("user-plan").textContent, "Demo Premium (imkan açmır)");
});
