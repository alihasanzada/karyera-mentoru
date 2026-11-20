/* Keep the account's existing application tracker inside the beta cabinet. */
(() => {
  const dialog = document.querySelector("#applications-modal");
  const form = document.querySelector("#application-form");
  const add = document.querySelector("#application-add");
  const submit = form.querySelector("button[type=submit]");
  const list = document.querySelector("#applications-list");
  const status = document.querySelector("#applications-status");
  const filter = document.querySelector("#applications-filter");
  const statuses = [...form.elements.status.options].map((option) => [option.value, option.text]);
  filter.replaceChildren(new Option("Hamısı", ""),
    ...statuses.map(([value, label]) => new Option(label, value)));

  let items = [];
  let view = 0;

  function text(tag, value) {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  }

  function paint() {
    list.replaceChildren();
    for (const item of items) {
      if (filter.value && item.status !== filter.value) continue;
      const row = document.createElement("li");
      row.className = "card";
      row.append(text("strong", item.position), text("p", [item.company, item.applied_date].join(" · ")));
      if (item.next_step) row.append(text("p", ["Növbəti addım: " + item.next_step, item.next_step_date].filter(Boolean).join(" · ")));
      if (item.notes) row.append(text("p", item.notes));

      const controls = document.createElement("div");
      controls.className = "field-row";
      const select = document.createElement("select");
      select.className = "input";
      select.setAttribute("aria-label", item.position + " üçün status");
      select.replaceChildren(...statuses.map(([value, label]) =>
        new Option(label, value, false, value === item.status)));
      select.addEventListener("change", () => send(select, async () => {
        try {
          return await sendJson("/api/applications/" + item.id, { status: select.value }, "PATCH");
        } catch (error) {
          select.value = item.status;
          throw error;
        }
      }, (updated) => {
        items = items.map((row) => row.id === updated.id ? updated : row);
        paint();
        status.textContent = "Status yeniləndi.";
      }));

      const remove = text("button", "Sil");
      remove.className = "btn btn-ghost";
      remove.type = "button";
      remove.setAttribute("aria-label", item.position + " müraciətini sil");
      remove.addEventListener("click", () => {
        if (!confirm(item.position + " müraciəti silinsin?")) return;
        send(remove, () => api("/api/applications/" + item.id, { method: "DELETE" }), () => {
          items = items.filter((row) => row.id !== item.id);
          paint();
          status.textContent = "Müraciət silindi.";
        });
      });
      controls.append(select, remove);
      row.append(controls);
      list.append(row);
    }
    if (!list.children.length) list.append(text("li", filter.value ? "Bu statusda müraciət yoxdur." : "Hələ müraciət yoxdur."));
  }

  async function send(control, request, success) {
    const current = view;
    const owner = apiUser?.id;
    const active = () => dialog.open && view === current && apiUser?.id === owner;
    control.disabled = true;
    status.textContent = "Yüklənir…";
    try {
      const data = await request();
      if (active()) {
        status.textContent = "";
        success(data);
      }
    } catch (error) {
      if (active()) status.textContent = error.message;
    } finally {
      if (active()) control.disabled = false;
    }
  }

  document.querySelector("#applications-open").addEventListener("click", () => {
    if (!apiUser || dialog.open) return;
    ++view;
    add.open = false;
    dialog.showModal();
    send(submit, () => api("/api/applications"), (saved) => {
      items = saved;
      add.open = items.length === 0;
      paint();
    });
  });
  document.querySelector("#applications-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    ++view;
    items = [];
    form.reset();
    filter.value = "";
    status.textContent = "";
    list.replaceChildren();
  });
  filter.addEventListener("change", paint);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const data = Object.fromEntries(new FormData(form));
    for (const key of ["applied_date", "next_step_date"]) {
      if (!data[key]) delete data[key];
    }
    send(submit, () => sendJson("/api/applications", data), (created) => {
      items.unshift(created);
      filter.value = "";
      form.reset();
      add.open = false;
      paint();
      status.textContent = "Müraciət əlavə olundu.";
    });
  });
})();
