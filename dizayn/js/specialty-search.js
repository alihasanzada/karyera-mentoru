/* Filter the shared catalog while keeping a selected specialty available. */
function bindSpecialtySearch(input, select, fields, selected, placeholder = "İxtisasını seç") {
  const fold = (text) => String(text ?? "").toLocaleLowerCase("az").replaceAll("ı", "i")
    .replaceAll("ə", "e").normalize("NFD").replace(/\p{M}/gu, "");
  const catalog = fields.map((field) => ({
    ...field,
    search: fold([field.name, field.id, field.group, field.role].join(" ")),
  }));

  function render(value) {
    const words = fold(input.value).trim().split(/\s+/).filter(Boolean);
    const matched = catalog.filter((field) => words.every((word) => field.search.includes(word)));
    const visible = matched.length ? [...matched] : [];
    if (value && !visible.some((field) => field.id === value)) {
      const current = catalog.find((field) => field.id === value);
      if (current) visible.unshift(current);
    }
    const groups = new Map();
    for (const field of visible) {
      const group = field.group || "İxtisaslar";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(field);
    }
    select.replaceChildren(new Option(matched.length ? placeholder : "Nəticə tapılmadı", ""));
    for (const [label, entries] of groups) {
      const group = document.createElement("optgroup");
      group.label = label;
      entries.sort((a, b) => (a.name === "Digər") - (b.name === "Digər") || a.name.localeCompare(b.name, "az"));
      for (const field of entries) group.append(new Option(field.name, field.id));
      select.append(group);
    }
    select.value = visible.some((field) => field.id === value) ? value : "";
  }

  input.addEventListener("input", () => render(select.value));
  input.form?.addEventListener("reset", () => setTimeout(() => {
    if (input.isConnected) render(select.value);
  }, 0));
  render(selected);
}
