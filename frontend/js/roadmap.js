/* Roadmap tab: career gap comparison and 30/60/90 day plan */
let rmData = null;
let rmBound = false;

const RM_STATUS = {
    has: { label: "Var", cls: "bg-green-100 text-green-800", color: "#16a34a", path: "M5 13l4 4L19 7" },
    partial: { label: "Qismən", cls: "bg-amber-100 text-amber-800", color: "#d97706", path: "M6 12h12" },
    missing: { label: "Çatışmır", cls: "bg-red-100 text-red-800", color: "#dc2626", path: "M6 6l12 12M18 6L6 18" },
};
const RM_PRIORITY = {
    critical: { label: "Kritik", cls: "bg-red-100 text-red-800" },
    important: { label: "Vacib", cls: "bg-amber-100 text-amber-800" },
    nice_to_have: { label: "Əlavə üstünlük", cls: "bg-slate-100 text-slate-700" },
};
const RM_ORDER = { critical: 0, important: 1, nice_to_have: 2 };
const RM_TIER = { required: "Tələb olunan", preferred: "Arzuolunan" };
const RM_KIND = { video: "Video", docs: "Sənəd", course: "Kurs", certification: "Sertifikat", practice: "Praktika" };
const RM_COST = {
    free: { label: "Pulsuz", cls: "bg-green-100 text-green-800" },
    freemium: { label: "Pulsuz səviyyə", cls: "bg-amber-100 text-amber-800" },
    paid: { label: "Ödənişli", cls: "bg-slate-100 text-slate-700" },
};

function rmStatusIcon(status) {
    const s = RM_STATUS[status] || RM_STATUS.missing;
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="${s.path}"/></svg>`;
}

function rmResource(r) {
    // Links are search URLs built from the model's query, never model-written URLs
    const q = encodeURIComponent(r.search_query || r.title);
    const url = r.kind === "video"
        ? `https://www.youtube.com/results?search_query=${q}`
        : `https://www.google.com/search?q=${q}`;
    const cost = RM_COST[r.cost] || RM_COST.free;
    return `<li>
    <a href="${esc(url)}" target="_blank" rel="noopener noreferrer"
       class="flex items-start justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
      <div class="min-w-0">
        <div class="text-sm font-medium text-indigo-700">${esc(r.title)}</div>
        <div class="text-xs text-slate-500">${esc(r.provider)} · ${esc(RM_KIND[r.kind] || r.kind)}</div>
      </div>
      <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${cost.cls}">${cost.label}</span>
    </a>
  </li>`;
}

function rmHaveRow(s) {
    return `<li class="border border-slate-200 rounded-lg p-3">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">${rmStatusIcon("has")}<span class="text-sm font-medium">${esc(s.skill)}</span></div>
      <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">${esc(RM_TIER[s.tier] || s.tier)}</span>
    </div>
    ${s.evidence ? `<p class="text-xs text-slate-500 mt-2">${esc(s.evidence)}</p>` : ""}
  </li>`;
}

function rmGapRow(s) {
    const st = RM_STATUS[s.status] || RM_STATUS.missing;
    const pr = RM_PRIORITY[s.priority];
    const resources = s.resources && s.resources.length
        ? `<ul class="mt-3 space-y-2">${s.resources.map(rmResource).join("")}</ul>`
        : "";
    return `<li class="border border-slate-200 rounded-lg p-3">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">${rmStatusIcon(s.status)}<span class="text-sm font-medium">${esc(s.skill)}</span></div>
      <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}">${st.label}</span>
    </div>
    <div class="flex flex-wrap gap-2 mt-2">
      <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${esc(RM_TIER[s.tier] || s.tier)}</span>
      ${pr ? `<span class="text-[11px] px-2 py-0.5 rounded-full ${pr.cls}">${pr.label}</span>` : ""}
    </div>
    ${s.why_it_matters ? `<p class="text-sm text-slate-600 mt-2">${esc(s.why_it_matters)}</p>` : ""}
    ${resources}
  </li>`;
}

function rmCareerGap(d) {
    const g = d.career_gap;
    const have = g.skills.filter((s) => s.status === "has");
    const gaps = g.skills
        .filter((s) => s.status !== "has")
        .sort((a, b) => (RM_ORDER[a.priority] ?? 3) - (RM_ORDER[b.priority] ?? 3));

    const coverage = (label, value) => {
        const v = clampScore(value);
        return `<div>
      <div class="flex justify-between text-sm mb-1">
        <span class="text-slate-600">${label}</span><strong class="${tone(v).text}">${v}%</strong>
      </div>${progressBar(v)}</div>`;
    };

    const note = d.generated
        ? `<p class="text-xs text-slate-400 mt-4">Resurslar AI tərəfindən təklif olunur. Linklər axtarış nəticələrinə aparır. Resursun mövcudluğunu və pulsuz olduğunu özün yoxla.</p>`
        : `<p class="text-xs text-slate-400 mt-4">İzahlar və resurs tövsiyələri yol xəritəsi yaradıldıqdan sonra görünəcək.</p>`;

    return `<section class="${CARD} p-6">
    <h2 class="text-lg font-semibold">Career Gap</h2>
    <p class="text-sm text-slate-500 mb-5">${esc(d.field_name)} sahəsində izlənilən ${g.skills.length} bacarıq: ${have.length} mövcud, ${gaps.length} boşluq.</p>
    <div class="grid gap-4 sm:grid-cols-2 mb-6">
      ${coverage("Tələb olunan bacarıqların örtülməsi", g.required_coverage)}
      ${coverage("Arzuolunan bacarıqların örtülməsi", g.preferred_coverage)}
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 class="font-semibold text-sm mb-3">Mövcud bacarıqlar (${have.length})</h3>
        <ul class="space-y-2">${have.length ? have.map(rmHaveRow).join("") : '<li class="text-sm text-slate-500">Hələ təsdiqlənmiş bacarıq yoxdur.</li>'}</ul>
      </div>
      <div>
        <h3 class="font-semibold text-sm mb-3">Çatışan bacarıqlar (${gaps.length})</h3>
        <ul class="space-y-2">${gaps.length ? gaps.map(rmGapRow).join("") : '<li class="text-sm text-slate-500">Çatışan bacarıq tapılmadı.</li>'}</ul>
      </div>
    </div>
    ${note}
  </section>`;
}

/* Task progress is kept in the browser only */
const rmProgressKey = (id) => `karyera_progress_${id}`;

function rmLoadProgress(id) {
    try { return JSON.parse(localStorage.getItem(rmProgressKey(id)) || "{}"); }
    catch { return {}; }
}

function rmSaveProgress(id, progress) {
    try { localStorage.setItem(rmProgressKey(id), JSON.stringify(progress)); } catch { }
}

function rmStats(d) {
    const done = rmLoadProgress(d.evaluation_id);
    const phases = d.roadmap.map((p) => {
        const total = p.tasks.length;
        const n = p.tasks.filter((_, i) => done[`${p.key}-${i}`]).length;
        return { key: p.key, total, done: n, pct: total ? Math.round((100 * n) / total) : 0 };
    });
    const total = phases.reduce((a, p) => a + p.total, 0);
    const n = phases.reduce((a, p) => a + p.done, 0);
    return { phases, total, doneTotal: n, overall: total ? Math.round((100 * n) / total) : 0 };
}

function rmPhase(p, d, stats) {
    const ps = stats.phases.find((x) => x.key === p.key);
    const done = rmLoadProgress(d.evaluation_id);

    const byWeek = {};
    p.tasks.forEach((t, i) => { (byWeek[t.week] = byWeek[t.week] || []).push({ t, i }); });

    const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b).map((w) => `
    <div>
      <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Həftə ${w}</h4>
      <ul class="space-y-2">
        ${byWeek[w].map(({ t, i }) => `
          <li class="border border-slate-200 rounded-lg p-3">
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" data-task="${p.key}-${i}" class="mt-1 h-4 w-4 accent-indigo-600" ${done[`${p.key}-${i}`] ? "checked" : ""}>
              <div class="min-w-0">
                <div class="text-sm font-medium">${esc(t.title)}</div>
                <p class="text-sm text-slate-600 mt-1">${esc(t.details)}</p>
                <p class="text-xs text-slate-500 mt-1">Nəticə: ${esc(t.deliverable)}</p>
              </div>
            </label>
          </li>`).join("")}
      </ul>
    </div>`).join("");

    return `<section class="${CARD} p-6 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">${esc(p.days)} gün</p>
        <h3 class="text-lg font-semibold">${esc(p.label)}</h3>
      </div>
      <span id="rm-${p.key}-text" class="text-sm text-slate-500">${ps.done}/${ps.total} tapşırıq</span>
    </div>
    <div id="rm-${p.key}-bar">${progressBar(ps.pct)}</div>
    <p class="text-sm text-slate-700"><strong>Məqsəd:</strong> ${esc(p.goal)}</p>
    <p class="text-sm text-slate-700"><strong>Mərhələnin nəticəsi:</strong> ${esc(p.milestone)}</p>
    ${weeks}
  </section>`;
}

function rmPlan(d) {
    if (!d.generated) {
        return `<section class="${CARD} p-8 text-center">
      <h2 class="text-lg font-semibold">30/60/90 günlük plan</h2>
      <p class="text-sm text-slate-500 mt-1 mb-5">AI Career Gap nəticəsinə əsasən fərdi plan və resurs tövsiyələri hazırlayacaq.</p>
      <button data-rm-generate class="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium">Yol xəritəsi yarat</button>
      <p id="rm-status" class="text-sm mt-3"></p>
    </section>`;
    }

    const stats = rmStats(d);
    return `<section class="${CARD} p-6 space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold">30/60/90 günlük plan</h2>
          <p class="text-sm text-slate-600 mt-1">${esc(d.summary)}</p>
        </div>
        <button data-rm-generate class="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50 font-medium whitespace-nowrap">Yenidən yarat</button>
      </div>
      <div>
        <div class="flex justify-between text-sm mb-1">
          <span class="text-slate-600">Ümumi irəliləyiş</span>
          <span id="rm-overall-text" class="font-medium">${stats.doneTotal}/${stats.total} tapşırıq · ${stats.overall}%</span>
        </div>
        <div id="rm-overall-bar">${progressBar(stats.overall)}</div>
      </div>
      <p id="rm-status" class="text-sm"></p>
    </section>
    ${d.roadmap.map((p) => rmPhase(p, d, stats)).join("")}`;
}

function rmPaint() {
    $("view").innerHTML =
        pageHeader("Yol Xəritəsi", "Career Gap təhlili və 30/60/90 günlük fərdi inkişaf planı") +
        `<div class="space-y-6">${rmCareerGap(rmData)}${rmPlan(rmData)}</div>`;
}

function rmUpdateProgress() {
    if (!rmData || !rmData.generated) return;
    const stats = rmStats(rmData);
    stats.phases.forEach((p) => {
        const bar = $(`rm-${p.key}-bar`);
        const text = $(`rm-${p.key}-text`);
        if (bar) bar.innerHTML = progressBar(p.pct);
        if (text) text.textContent = `${p.done}/${p.total} tapşırıq`;
    });
    const bar = $("rm-overall-bar");
    const text = $("rm-overall-text");
    if (bar) bar.innerHTML = progressBar(stats.overall);
    if (text) text.textContent = `${stats.doneTotal}/${stats.total} tapşırıq · ${stats.overall}%`;
}

function rmSetStatus(msg, isError = false) {
    const el = $("rm-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "text-sm mt-3 " + (isError ? "text-red-600" : "text-slate-600");
}

async function rmGenerate() {
    const current = rmData;
    if (!current) return;
    if (current.generated && !confirm("Plan yenidən yaradılsın? Tapşırıqlar üzrə irəliləyiş sıfırlanacaq.")) return;

    const buttons = document.querySelectorAll("[data-rm-generate]");
    buttons.forEach((b) => { b.disabled = true; });
    const started = Date.now();
    rmSetStatus("AI plan hazırlayır...");
    const ticker = setInterval(() => {
        rmSetStatus(`AI plan hazırlayır... ${Math.round((Date.now() - started) / 1000)} san`);
    }, 1000);

    try {
        const fresh = await api("/api/roadmap/" + current.evaluation_id, { method: "POST" }, 180000);
        rmSaveProgress(current.evaluation_id, {});
        rmData = fresh;
        if (currentRoute() === "roadmap") rmPaint();
    } catch (e) {
        rmSetStatus(e.message, true);
        buttons.forEach((b) => { b.disabled = false; });
    } finally {
        clearInterval(ticker);
    }
}

function rmBind() {
    if (rmBound) return;
    rmBound = true;
    const view = $("view");

    view.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-rm-generate]")) rmGenerate();
    });

    view.addEventListener("change", (ev) => {
        const box = ev.target.closest("input[data-task]");
        if (!box || !rmData) return;
        const progress = rmLoadProgress(rmData.evaluation_id);
        if (box.checked) progress[box.dataset.task] = true;
        else delete progress[box.dataset.task];
        rmSaveProgress(rmData.evaluation_id, progress);
        rmUpdateProgress();
    });
}

async function renderRoadmap() {
    const t = routeToken;
    const header = pageHeader("Yol Xəritəsi", "Career Gap təhlili və 30/60/90 günlük fərdi inkişaf planı");
    rmBind();
    $("view").innerHTML = header + loadingHtml();

    let latest;
    try {
        latest = await loadLatest();
    } catch (e) {
        if (t === routeToken) showError(e.message);
        return;
    }
    if (t !== routeToken) return;

    if (!latest) {
        $("view").innerHTML = header + `
      <div class="${CARD} p-10 text-center">
        <h2 class="text-lg font-semibold">Əvvəl CV analiz et</h2>
        <p class="text-sm text-slate-500 mt-1 mb-5">Yol xəritəsi CV qiymətləndirməsinin nəticəsinə əsasən hazırlanır.</p>
        <a href="#/cv" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg">CV Mərkəzinə keç</a>
      </div>`;
        return;
    }

    try {
        rmData = await api("/api/roadmap/" + latest._id);
    } catch (e) {
        if (t === routeToken) showError(e.message);
        return;
    }
    if (t !== routeToken) return;
    rmPaint();
}