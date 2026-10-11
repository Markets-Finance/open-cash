import { esc } from "./dom";

export type ComboItem = { key: string; label: string; markHtml?: string; group?: string };

let wired = false;

export function mountCombo(host: HTMLElement, options: { buttonHtml: string; items: ComboItem[]; searchPlaceholder?: string; onPick: (key: string) => void }) {
  const groups = [...new Set(options.items.map((item) => item.group ?? ""))];
  const rows = groups
    .map((group) => {
      const items = options.items.filter((item) => (item.group ?? "") === group);
      return (group ? `<p class="combo__group" data-combo-group>${esc(group)}</p>` : "") + items.map((item) => `<button type="button" class="combo__item" data-combo-key="${esc(item.key)}">${item.markHtml ?? ""}<span>${esc(item.label)}</span></button>`).join("");
    })
    .join("");
  const searchable = options.searchPlaceholder !== undefined;
  host.innerHTML = `<div class="combo" data-combo>
    <button type="button" class="combo__btn" data-combo-toggle aria-expanded="false">${options.buttonHtml}<span aria-hidden="true">▾</span></button>
    <div class="combo__panel" data-combo-panel hidden>
      ${searchable ? `<input class="combo__search" data-combo-search type="search" placeholder="${esc(options.searchPlaceholder!)}" autocomplete="off" />` : ""}
      <div class="combo__list">${rows}</div>
    </div>
  </div>`;
  const toggle = host.querySelector<HTMLButtonElement>("[data-combo-toggle]")!;
  const panel = host.querySelector<HTMLElement>("[data-combo-panel]")!;
  const search = host.querySelector<HTMLInputElement>("[data-combo-search]");
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) search?.focus();
  });
  search?.addEventListener("input", () => {
    const needle = search.value.trim().toLowerCase();
    panel.querySelectorAll<HTMLElement>("[data-combo-key]").forEach((item) => {
      item.hidden = needle !== "" && !`${item.dataset.comboKey} ${item.textContent}`.toLowerCase().includes(needle);
    });
    panel.querySelectorAll<HTMLElement>("[data-combo-group]").forEach((group) => {
      let next = group.nextElementSibling as HTMLElement | null;
      let any = false;
      while (next && !next.hasAttribute("data-combo-group")) {
        if (!next.hidden) any = true;
        next = next.nextElementSibling as HTMLElement | null;
      }
      group.hidden = !any;
    });
  });
  panel.addEventListener("click", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-combo-key]");
    if (!item) return;
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    options.onPick(item.dataset.comboKey!);
  });
  if (!wired) {
    wired = true;
    document.addEventListener("click", (event) => {
      document.querySelectorAll<HTMLElement>("[data-combo-panel]:not([hidden])").forEach((open) => {
        if (!open.closest("[data-combo]")!.contains(event.target as Node)) open.hidden = true;
      });
    });
  }
}
