import { query } from "./dom";
import { session } from "./state";

type TabHandlers = Partial<Record<string, () => void | Promise<void>>>;

const dash = query("[data-dash]");
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const panels = new Map(
  Array.from(document.querySelectorAll<HTMLElement>("[data-panel]")).map((el) => [el.dataset.panel!, el]),
);
const loaded = new Set<string>();
let handlers: TabHandlers = {};

export function activateTab(key: string) {
  dash.dataset.tab = key;
  for (const button of buttons) button.setAttribute("aria-selected", String(button.dataset.tab === key));
  for (const [panelKey, el] of panels) el.hidden = panelKey !== key;
  if (!loaded.has(key)) {
    loaded.add(key);
    void handlers[key]?.();
  }
}

export function disconnect() {
  session.trader?.end();
  session.trader = null;
  location.reload();
}

export function initTabs(onFirstOpen: TabHandlers) {
  handlers = onFirstOpen;
  buttons.forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab!)));
  document
    .querySelectorAll<HTMLButtonElement>("[data-goto]")
    .forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.goto!)));
}

export function initAccountMenu(onSearch: (value: string) => void) {
  const menu = query("[data-account-menu]");
  const trigger = query<HTMLButtonElement>("[data-topbar-address]");
  const list = query("[data-account-menu-list]");
  const setOpen = (open: boolean) => {
    list.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
  };

  trigger.addEventListener("click", () => setOpen(list.hidden));
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target as Node)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  query<HTMLButtonElement>("[data-disconnect]").addEventListener("click", disconnect);

  const search = query<HTMLInputElement>("[data-global-search]");
  search.addEventListener("input", () => {
    activateTab("trade");
    onSearch(search.value.trim().toLowerCase());
  });
}
