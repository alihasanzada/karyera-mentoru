const MAX_MB = 5;

let clientId = localStorage.getItem("karyera_client_id");
if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem("karyera_client_id", clientId);
}

const state = { fields: [], history: [], latest: null, current: null };
let routeToken = 0; // prevents the old page from overwriting the new page during navigation

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleString("az-AZ", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return ""; }
};
const fieldName = (id) => (state.fields.find((f) => f.id === id) || {}).name || id;

/* ---------- API ---------- */
async function api(path, options = {}, timeoutMs = 60000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(path, {
            ...options,
            signal: controller.signal,
            headers: { ...(options.headers || {}), "X-Client-Id": clientId },
        });
        if (!res.ok) {
            let msg = "Xəta baş verdi. Yenidən cəhd et.";
            try {
                const data = await res.json();
                if (typeof data.detail === "string") msg = data.detail;
            } catch { }
            throw new Error(msg);
        }
        return await res.json();
    } catch (e) {
        if (e.name === "AbortError") throw new Error("Cavab çox gec gəldi. Bir az sonra yenidən cəhd et.");
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

async function loadFields() {
    if (!state.fields.length) state.fields = await api("/api/match/fields");
    return state.fields;
}

async function loadHistory() {
    state.history = await api("/api/history");
    return state.history;
}

async function loadLatest() {
    const hist = await loadHistory();
    const last = hist.find((h) => h.kind === "evaluation");
    if (!last) {
        state.latest = null;
        return null;
    }
    if (!state.latest || state.latest._id !== last.id) {
        const d = await api("/api/history/" + last.id);
        state.latest = { ...d.result, _id: last.id, _at: last.created_at };
    }
    return state.latest;
}

/* ---------- Visual aids ---------- */
const READY = {
    ready: ["Hazırdır", "bg-green-600"],
    almost_ready: ["Az qalıb", "bg-amber-500"],
    needs_work: ["İnkişaf lazımdır", "bg-red-600"],
};

const clampScore = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function tone(score) {
    if (score >= 75) return { bar: "bg-green-500", text: "text-green-600", hex: "#22c55e" };
    if (score >= 50) return { bar: "bg-amber-500", text: "text-amber-600", hex: "#f59e0b" };
    return { bar: "bg-red-500", text: "text-red-600", hex: "#ef4444" };
}

function readyBadge(key) {
    const [label, cls] = READY[key] || READY.needs_work;
    return `<span class="text-white text-xs px-3 py-1 rounded-full ${cls}">${label}</span>`;
}

function progressBar(score) {
    const s = clampScore(score);
    return `<div class="h-2.5 bg-slate-200 rounded-full overflow-hidden">
    <div class="h-full ${tone(s).bar} rounded-full" style="width:${s}%"></div></div>`;
}

function scoreRing(score, size = 140) {
    const s = clampScore(score);
    const r = 54, c = 2 * Math.PI * r, off = c * (1 - s / 100);
    return `<div class="relative shrink-0" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 120 120" width="${size}" height="${size}" class="-rotate-90">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="10"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="${tone(s).hex}" stroke-width="10"
              stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="text-3xl font-bold ${tone(s).text}">${s}</span>
      <span class="text-xs text-slate-500">/ 100</span>
    </div>
  </div>`;
}

const CARD = "bg-white rounded-xl border border-slate-200 shadow-sm";

const pageHeader = (title, subtitle) => `
  <div class="mb-6">
    <h1 class="text-2xl font-bold">${title}</h1>
    <p class="text-sm text-slate-500 mt-1">${esc(subtitle)}</p>
  </div>`;

const loadingHtml = () => `<p class="text-sm text-slate-500">⏳ Yüklənir...</p>`;

function showError(msg) {
    $("view").innerHTML = `<div class="${CARD} p-6 text-red-600 text-sm">${esc(msg)}</div>`;
}

function comingSoon(icon, bullets) {
    return `<div class="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
    <div class="text-4xl mb-3">${icon}</div>
    <p class="font-medium">Bu bölmə hazırlanır</p>
    <ul class="text-sm text-slate-500 mt-3 space-y-1">${bullets.map((b) => `<li>• ${esc(b)}</li>`).join("")}</ul>
  </div>`;
}

/* ---------- Scorecards ---------- */
const CAT_ICONS = { structure: "🧱", ats: "🤖", impact: "📈", field_fit: "🎯" };

function categoryCard(c) {
    const s = clampScore(c.score);
    const note = c.key === "ats"
        ? `<p class="text-[11px] text-slate-400 mt-2">Mətn əsaslı yoxlamadır: sütun, cədvəl və şəkil kimi vizual dizayn nəzərə alınmır.</p>`
        : "";
    return `<div class="${CARD} p-5">
    <div class="flex items-start justify-between gap-3">
      <h3 class="font-semibold text-sm">${CAT_ICONS[c.key] || ""} ${esc(c.label)}</h3>
      <span class="text-xl font-bold ${tone(s).text}">${s}</span>
    </div>
    <div class="mt-3">${progressBar(s)}</div>
    <p class="text-sm text-slate-600 mt-3">${esc(c.reasoning)}</p>
    ${note}
  </div>`;
}

function renderResult(r) {
    if (!r) {
        return `<div class="${CARD} p-8 text-center text-sm text-slate-500">
      Nəticə burada görünəcək. CV-ni yüklə və <strong>Analiz et</strong> düyməsini bas.</div>`;
    }
    return `<div class="space-y-6">
    <div class="${CARD} p-6 flex flex-col sm:flex-row gap-6 items-center">
      ${scoreRing(r.overall_score)}
      <div class="flex-1 space-y-2 w-full">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-lg font-semibold">${esc(r.field_name)}</h2>${readyBadge(r.readiness)}
        </div>
        <p class="text-xs text-slate-400">Ümumi bal 4 kateqoriyanın ortalamasıdır · ${esc(r.filename)}</p>
        <p class="text-sm text-slate-700">${esc(r.summary)}</p>
      </div>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">${r.categories.map(categoryCard).join("")}</div>
  </div>`;
}

/* ---------- Pages ---------- */
async function renderDashboard() {
    const t = routeToken;
    const header = pageHeader("📊 Dashboard", "Karyera hazırlığının ümumi görünüşü");
    $("view").innerHTML = header + loadingHtml();

    let latest;
    try {
        [, latest] = await Promise.all([loadFields(), loadLatest()]);
    } catch (e) {
        if (t === routeToken) showError(e.message);
        return;
    }
    if (t !== routeToken) return;

    if (!latest) {
        $("view").innerHTML = header + `
      <div class="${CARD} p-10 text-center">
        <div class="text-5xl mb-3">🚀</div>
        <h2 class="text-lg font-semibold">Hələ analiz yoxdur</h2>
        <p class="text-sm text-slate-500 mt-1 mb-5">İlk CV-ni yüklə və karyera hazırlıq balını gör.</p>
        <a href="#/cv" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg">CV-ni analiz et</a>
      </div>`;
        return;
    }

    const miniBar = (c) => {
        const s = clampScore(c.score);
        return `<div>
      <div class="flex justify-between text-sm mb-1">
        <span class="text-slate-600 pr-2">${esc(c.label)}</span><strong class="${tone(s).text}">${s}</strong>
      </div>${progressBar(s)}</div>`;
    };

    const recent = state.history.filter((h) => h.kind === "evaluation").slice(0, 5);
    const recentHtml = recent.map((h) => `
    <li>
      <button data-open="${h.id}" class="w-full flex items-center justify-between gap-3 py-3 px-2 text-left hover:bg-slate-50 rounded-lg">
        <div class="min-w-0">
          <div class="text-sm font-medium truncate">${esc(fieldName(h.field_id))}</div>
          <div class="text-xs text-slate-400 truncate">${esc(h.filename)} · ${fmtDate(h.created_at)}</div>
        </div>
        <span class="font-bold ${tone(h.score ?? 0).text}">${h.score ?? "-"}</span>
      </button>
    </li>`).join("");

    $("view").innerHTML = header + `
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2 ${CARD} p-6">
        <p class="text-xs uppercase tracking-wide text-slate-400 mb-4">Karyera Hazırlıq Balı</p>
        <div class="flex flex-col sm:flex-row items-center gap-6">
          ${scoreRing(latest.overall_score)}
          <div class="flex-1 space-y-2 w-full">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-semibold">${esc(latest.field_name)}</h2>${readyBadge(latest.readiness)}
            </div>
            <p class="text-sm text-slate-600">${esc(latest.summary)}</p>
            <p class="text-xs text-slate-400">${esc(latest.filename)} · ${fmtDate(latest._at)}</p>
            <button data-open="${latest._id}" class="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Tam hesabata bax →</button>
          </div>
        </div>
      </div>
      <div class="${CARD} p-6 space-y-4">
        <p class="text-xs uppercase tracking-wide text-slate-400">Kateqoriya balları</p>
        ${latest.categories.map(miniBar).join("")}
      </div>
    </div>
    <div class="mt-6 ${CARD} p-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold">Son analizlər</h3>
        <a href="#/cv" class="text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ Yeni analiz</a>
      </div>
      <ul class="divide-y divide-slate-100">${recentHtml}</ul>
    </div>`;
}

async function renderCV() {
    const t = routeToken;
    $("view").innerHTML = pageHeader("📄 CV Mərkəzi", "CV-ni yüklə və 4 kateqoriya üzrə izah olunan qiymətləndirmə al") + loadingHtml();

    let fields;
    try {
        [fields] = await Promise.all([loadFields(), loadLatest().catch(() => null)]);
    } catch (e) {
        if (t === routeToken) showError(e.message);
        return;
    }
    if (t !== routeToken) return;

    const shown = state.current || state.latest;
    $("view").innerHTML = pageHeader("📄 CV Mərkəzi", "CV-ni yüklə və 4 kateqoriya üzrə izah olunan qiymətləndirmə al") + `
    <div class="${CARD} p-5 space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">CV (PDF, maksimum ${MAX_MB} MB)</label>
        <input id="cv-file" type="file" accept="application/pdf,.pdf" class="block w-full text-sm border border-slate-300 rounded-lg p-2 bg-white">
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Hədəf sahə</label>
        <select id="cv-field" class="block w-full border border-slate-300 rounded-lg p-2 text-sm bg-white">
          ${fields.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}
        </select>
      </div>
      <button id="cv-run" class="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium">Analiz et</button>
      <p id="cv-status" class="text-sm"></p>
    </div>
    <div id="cv-result" class="mt-6">${renderResult(shown)}</div>`;

    $("cv-run").addEventListener("click", runEvaluate);
}

function setCvStatus(msg, isError = false) {
    const el = $("cv-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "text-sm " + (isError ? "text-red-600" : "text-slate-600");
}

async function runEvaluate() {
    const file = $("cv-file").files[0];
    if (!file) return setCvStatus("Əvvəlcə PDF faylı seç.", true);
    if (!file.name.toLowerCase().endsWith(".pdf")) return setCvStatus("Yalnız PDF faylı qəbul olunur.", true);
    if (file.size > MAX_MB * 1024 * 1024) return setCvStatus(`Fayl çox böyükdür (maksimum ${MAX_MB} MB).`, true);

    const form = new FormData();
    form.append("file", file);
    form.append("field_id", $("cv-field").value);

    $("cv-run").disabled = true;
    const started = Date.now();
    setCvStatus("⏳ AI analiz edir...");
    const ticker = setInterval(() => {
        setCvStatus(`⏳ AI analiz edir... ${Math.round((Date.now() - started) / 1000)} san`);
    }, 1000);

    try {
        const data = await api("/api/evaluate", { method: "POST", body: form }, 180000);
        const hist = await loadHistory();
        const newest = hist.find((h) => h.kind === "evaluation");
        state.latest = { ...data, _id: newest?.id, _at: newest?.created_at };
        state.current = state.latest;
        setCvStatus("");
        const box = $("cv-result");
        if (box) {
            box.innerHTML = renderResult(state.current);
            box.scrollIntoView({ behavior: "smooth" });
        }
    } catch (e) {
        setCvStatus(e.message, true);
    } finally {
        clearInterval(ticker);
        const btn = $("cv-run");
        if (btn) btn.disabled = false;
    }
}

async function renderRoadmap() {
    const t = routeToken;
    let latest = null;
    try { latest = await loadLatest(); } catch { }
    if (t !== routeToken) return;

    const steps = latest?.match?.action_plan || [];
    const preview = steps.length ? `
    <div class="mt-6 ${CARD} p-6">
      <h3 class="font-semibold mb-1">İlkin inkişaf addımları</h3>
      <p class="text-xs text-slate-400 mb-4">Son CV analizindən (${esc(latest.field_name)}). Tam 30/60/90 günlük plan növbəti modullarda əlavə olunacaq.</p>
      <ol class="space-y-2">${steps.map((s, i) => `
        <li class="border border-slate-200 rounded-lg p-3 text-sm">
          <div class="flex justify-between gap-2">
            <strong>${i + 1}. ${esc(s.title)}</strong>
            <span class="text-xs text-slate-500 whitespace-nowrap">⏱ ${esc(s.timeframe)}</span>
          </div>
          <p class="mt-1 text-slate-600">${esc(s.details)}</p>
        </li>`).join("")}</ol>
    </div>` : "";

    $("view").innerHTML =
        pageHeader("Yol Xəritəsi", "Career Gap və 30/60/90 günlük inkişaf planı") +
        comingSoon("", ["Career Gap təhlili", "30/60/90 günlük plan", "Həftəlik tapşırıqlar"]) + preview;
}

function renderPlaceholder(icon, title, subtitle, bullets) {
    $("view").innerHTML = pageHeader(`${icon} ${title}`, subtitle) + comingSoon(icon, bullets);
}

/* ---------- Navigation ---------- */
const ROUTES = {
    dashboard: { icon: "📊", label: "Dashboard", render: renderDashboard },
    cv: { icon: "📄", label: "CV Mərkəzi", render: renderCV },
    roadmap: { icon: "🎯", label: "Yol Xəritəsi", render: renderRoadmap, soon: true },
    jobs: {
        icon: "💼", label: "Vakansiyalar", soon: true,
        render: () => renderPlaceholder("💼", "Vakansiyalar", "Bazar uyğunluğu",
            ["Real vakansiyalarla CV uyğunluğu", "Sahə üzrə bazar tələbləri", "Uyğunluq balına görə sıralama"]),
    },
    applications: {
        icon: "📌", label: "Müraciətlər", soon: true,
        render: () => renderPlaceholder("📌", "Müraciətlər", "Müraciət izləmə (Applications Tracker)",
            ["Göndərilən müraciətlərin siyahısı", "Status izləmə (göndərildi, müsahibə, rədd, təklif)", "Növbəti addım xatırlatmaları"]),
    },
    mentor: {
        icon: "🤖", label: "AI Mentor", soon: true,
        render: () => renderPlaceholder("🤖", "AI Mentor", "İnteraktiv karyera çatı",
            ["CV nəticələrinə əsasən sual-cavab", "Müsahibə hazırlığı", "Fərdi karyera məsləhəti"]),
    },
};

function currentRoute() {
    const key = location.hash.replace("#/", "");
    return ROUTES[key] ? key : "dashboard";
}

function renderNav() {
    const active = currentRoute();
    $("nav").innerHTML = Object.entries(ROUTES).map(([key, r]) => `
    <a href="#/${key}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${key === active ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-white"}">
      <span>${r.icon}</span><span>${r.label}</span>
      ${r.soon ? '<span class="ml-auto text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">tezliklə</span>' : ""}
    </a>`).join("");
}

function openMenu() {
    $("sidebar").classList.remove("-translate-x-full");
    $("backdrop").classList.remove("hidden");
}

function closeMenu() {
    $("sidebar").classList.add("-translate-x-full");
    $("backdrop").classList.add("hidden");
}

async function route() {
    routeToken++;
    renderNav();
    closeMenu();
    await ROUTES[currentRoute()].render();
    window.scrollTo(0, 0);
}

/* ---------- Introduction ---------- */
$("menu-btn").addEventListener("click", openMenu);
$("backdrop").addEventListener("click", closeMenu);
window.addEventListener("hashchange", route);

// Open result from history (buttons on the dashboard)
$("view").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-open]");
    if (!btn) return;
    try {
        const d = await api("/api/history/" + btn.dataset.open);
        state.current = { ...d.result, _id: d.id, _at: d.created_at };
        location.hash = "#/cv";
    } catch (e) {
        alert(e.message);
    }
});

route();