let appItems = [];
let appFilter = "all";
let appBound = false;

const APP_STATUS = {
    applied: { label: "Göndərildi", cls: "bg-indigo-100 text-indigo-800" },
    interview: { label: "Müsahibə", cls: "bg-amber-100 text-amber-800" },
    offer: { label: "Təklif", cls: "bg-green-100 text-green-800" },
    rejected: { label: "Rədd", cls: "bg-slate-100 text-slate-700" },
};

const INPUT = "mt-1 block w-full border border-slate-300 rounded-lg p-2 text-sm bg-white";

const fmtDay = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? "" : d.toLocaleDateString("az-AZ", { dateStyle: "medium" });
};

function appForm() {
    const options = Object.entries(APP_STATUS)
        .map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("");
    return `<details class="${CARD} p-5" ${appItems.length ? "" : "open"}>
    <summary class="font-semibold cursor-pointer">Yeni müraciət əlavə et</summary>
    <form id="app-form" class="mt-4 grid gap-4 sm:grid-cols-2">
      <label class="block text-sm">Şirkət *<input name="company" required maxlength="120" class="${INPUT}"></label>
      <label class="block text-sm">Vəzifə *<input name="position" required maxlength="120" class="${INPUT}"></label>
      <label class="block text-sm">Status<select name="status" class="${INPUT}">${options}</select></label>
      <label class="block text-sm">Müraciət tarixi<input name="applied_date" type="date" class="${INPUT}"></label>
      <label class="block text-sm">Növbəti addım<input name="next_step" maxlength="255" placeholder="Məs.: texniki müsahibə" class="${INPUT}"></label>
      <label class="block text-sm">Növbəti addımın tarixi<input name="next_step_date" type="date" class="${INPUT}"></label>
      <label class="block text-sm sm:col-span-2">Qeyd<textarea name="notes" rows="2" maxlength="2000" class="${INPUT}"></textarea></label>
      <div class="sm:col-span-2 flex items-center gap-3">
        <button class="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium">Əlavə et</button>
        <p id="app-form-error" role="alert" class="text-sm text-red-600"></p>
      </div>
    </form>
  </details>`;
}

function appFilters() {
    const count = (k) => (k === "all" ? appItems.length : appItems.filter((a) => a.status === k).length);
    const tabs = [["all", "Hamısı"], ...Object.entries(APP_STATUS).map(([k, s]) => [k, s.label])];
    return `<div class="flex flex-wrap gap-2" role="group" aria-label="Statusa görə filtr">
    ${tabs.map(([k, label]) => `<button data-app-filter="${k}" aria-pressed="${k === appFilter}"
      class="text-sm px-3 py-1.5 rounded-full border ${k === appFilter ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300 hover:bg-slate-50"}">
      ${label} <span class="opacity-70">${count(k)}</span></button>`).join("")}
  </div>`;
}

function appRow(a) {
    const st = APP_STATUS[a.status] || APP_STATUS.applied;
    const options = Object.entries(APP_STATUS)
        .map(([k, s]) => `<option value="${k}" ${k === a.status ? "selected" : ""}>${s.label}</option>`).join("");
    const next = a.next_step
        ? `<p class="text-sm text-slate-700 mt-2"><strong>Növbəti addım:</strong> ${esc(a.next_step)}${a.next_step_date ? ` · ${fmtDay(a.next_step_date)}` : ""}</p>`
        : "";
    const notes = a.notes ? `<p class="text-sm text-slate-500 mt-1 whitespace-pre-line break-words">${esc(a.notes)}</p>` : "";
    return `<li class="${CARD} p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="font-semibold break-words">${esc(a.position)}</div>
        <div class="text-sm text-slate-500 break-words">${esc(a.company)} · ${fmtDay(a.applied_date)}</div>
      </div>
      <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}">${st.label}</span>
    </div>
    ${next}${notes}
    <div class="flex flex-wrap items-center gap-3 mt-3">
      <label class="text-sm text-slate-600">Status
        <select data-app-status="${a.id}" class="ml-1 border border-slate-300 rounded-lg p-1.5 text-sm bg-white">${options}</select>
      </label>
      <button data-app-delete="${a.id}" class="ml-auto text-sm text-red-600 hover:text-red-800 disabled:opacity-50">Sil</button>
    </div>
  </li>`;
}

function appList() {
    const shown = appFilter === "all" ? appItems : appItems.filter((a) => a.status === appFilter);
    if (!appItems.length) {
        return `<div class="${CARD} p-8 text-center text-sm text-slate-500">Hələ müraciət yoxdur. Göndərdiyin ilk müraciəti yuxarıdakı forma ilə əlavə et.</div>`;
    }
    if (!shown.length) return `<p class="text-sm text-slate-500">Bu statusda müraciət yoxdur.</p>`;
    return `<ul class="space-y-3">${shown.map(appRow).join("")}</ul>`;
}

function appPaint() {
    $("view").innerHTML =
        pageHeader("Müraciətlər", "Göndərdiyin müraciətləri və növbəti addımları izlə") +
        `<div class="space-y-6">${appForm()}${appFilters()}<div id="app-list">${appList()}</div></div>`;
}

async function appCreate(form) {
    const button = form.querySelector("button");
    const error = $("app-form-error");
    const f = form.elements;
    const body = { company: f.company.value, position: f.position.value, status: f.status.value,
        notes: f.notes.value, next_step: f.next_step.value };
    if (f.applied_date.value) body.applied_date = f.applied_date.value;
    if (f.next_step_date.value) body.next_step_date = f.next_step_date.value;

    button.disabled = true;
    error.textContent = "";
    try {
        const created = await api("/api/applications", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        appItems.unshift(created);
        if (currentRoute() === "applications") appPaint();
        notify("Müraciət əlavə olundu.");
    } catch (e) {
        error.textContent = e.message;
        button.disabled = false;
    }
}

async function appUpdateStatus(select) {
    const id = Number(select.dataset.appStatus);
    const item = appItems.find((a) => a.id === id);
    if (!item) return;
    select.disabled = true;
    try {
        const updated = await api("/api/applications/" + id, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: select.value }),
        });
        Object.assign(item, updated);
        notify("Status yeniləndi.");
    } catch (e) {
        select.value = item.status;
        notify(e.message, true);
    }
    if (currentRoute() === "applications") appPaint();
}

async function appDelete(button) {
    const id = Number(button.dataset.appDelete);
    const item = appItems.find((a) => a.id === id);
    if (!item || !confirm(`"${item.position}" (${item.company}) müraciəti silinsin?`)) return;
    button.disabled = true;
    try {
        await api("/api/applications/" + id, { method: "DELETE" });
        appItems = appItems.filter((a) => a.id !== id);
        if (currentRoute() === "applications") appPaint();
        notify("Müraciət silindi.");
    } catch (e) {
        button.disabled = false;
        notify(e.message, true);
    }
}

function appBind() {
    if (appBound) return;
    appBound = true;
    const view = $("view");

    view.addEventListener("submit", (ev) => {
        if (ev.target.id !== "app-form") return;
        ev.preventDefault();
        appCreate(ev.target);
    });
    view.addEventListener("click", (ev) => {
        const filter = ev.target.closest("[data-app-filter]");
        if (filter) {
            appFilter = filter.dataset.appFilter;
            appPaint();
            return;
        }
        const del = ev.target.closest("[data-app-delete]");
        if (del && !del.disabled) appDelete(del);
    });
    view.addEventListener("change", (ev) => {
        const select = ev.target.closest("[data-app-status]");
        if (select) appUpdateStatus(select);
    });
}

async function renderApplications() {
    const t = routeToken;
    appBind();
    $("view").innerHTML = pageHeader("Müraciətlər", "Göndərdiyin müraciətləri və növbəti addımları izlə") + loadingHtml();
    let items;
    try {
        items = await api("/api/applications");
    } catch (e) {
        if (t === routeToken) showError(e.message);
        return;
    }
    if (t !== routeToken) return;
    appItems = items;
    appPaint();
}
