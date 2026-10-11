import { esc, markForSymbol, query } from "../dom";
import { toolbox } from "../agent/session";
import { initDetail, renderDetail } from "./detail";
import { loadSeries } from "./data";
import { initPaper } from "./paper";
import { labState } from "./state";
import { renderTiles } from "./tiles";

let comboWired = false;

function marketItem(symbol: string): string {
  const name = symbol.split(":").pop() ?? symbol;
  return `<button type="button" class="combo__item" data-lab-market="${esc(symbol)}" aria-pressed="${symbol === labState.symbol}">${markForSymbol(symbol)}<span>${esc(name)}</span></button>`;
}

function paintMarkets() {
  const link = query<HTMLButtonElement>("[data-lab-trade]");
  link.dataset.openAsset = labState.symbol;
  link.textContent = `Trade ${labState.symbol.split(":").pop()} ↗`;
  const crypto = labState.symbols.filter((symbol) => !symbol.includes(":"));
  const traditional = labState.symbols.filter((symbol) => symbol.includes(":"));
  const current = labState.symbol.split(":").pop() ?? labState.symbol;
  query("[data-lab-markets]").innerHTML = `
    <div class="combo" data-combo>
      <button type="button" class="combo__btn" data-combo-toggle aria-expanded="false">${markForSymbol(labState.symbol)}<b>${esc(current)}</b><span aria-hidden="true">▾</span></button>
      <div class="combo__panel" data-combo-panel hidden>
        <input class="combo__search" data-combo-search type="search" placeholder="Search ${labState.symbols.length} markets" autocomplete="off" />
        <div class="combo__list" data-combo-list>
          <p class="combo__group" data-combo-group>Crypto</p>${crypto.map(marketItem).join("")}
          <p class="combo__group" data-combo-group>Stocks, commodities and indices</p>${traditional.map(marketItem).join("")}
        </div>
      </div>
    </div>`;
  const toggle = query<HTMLButtonElement>("[data-combo-toggle]");
  const panel = query("[data-combo-panel]");
  const search = query<HTMLInputElement>("[data-combo-search]");
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) search.focus();
  });
  search.addEventListener("input", () => {
    const needle = search.value.trim().toLowerCase();
    panel.querySelectorAll<HTMLElement>("[data-lab-market]").forEach((item) => {
      item.hidden = needle !== "" && !item.dataset.labMarket!.toLowerCase().includes(needle);
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
  if (!comboWired) {
    comboWired = true;
    document.addEventListener("click", (event) => {
      const open = document.querySelector<HTMLElement>("[data-combo-panel]:not([hidden])");
      if (open && !(event.target as HTMLElement).closest("[data-combo]")) open.hidden = true;
    });
  }
}

function paintDays() {
  document
    .querySelectorAll<HTMLElement>("[data-lab-days]")
    .forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.labDays) === labState.days)));
}

function paintFrames() {
  document
    .querySelectorAll<HTMLElement>("[data-lab-frame]")
    .forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.labFrame) === labState.resolution)));
}

async function refresh() {
  const status = query("[data-lab-state]");
  status.textContent = labState.days > 90 ? "Loading a long history. This can take a moment." : "Loading history.";
  try {
    labState.series = await loadSeries(labState.symbol, labState.resolution, labState.days);
    status.textContent = "";
    renderTiles();
    renderDetail();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
}

export async function initLab() {
  initDetail();
  initPaper();
  const markets = await toolbox.getMarkets();
  labState.symbols = markets.map((m) => m.name);
  labState.symbol = labState.symbols.includes("BTC") ? "BTC" : (labState.symbols[0] ?? "");
  paintMarkets();
  paintFrames();
  paintDays();

  query("[data-lab-markets]").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-lab-market]");
    if (!button) return;
    labState.symbol = button.dataset.labMarket!;
    paintMarkets();
    void refresh();
  });

  document.querySelectorAll<HTMLElement>("[data-lab-frame]").forEach((button) =>
    button.addEventListener("click", () => {
      labState.resolution = Number(button.dataset.labFrame);
      paintFrames();
      void refresh();
    }),
  );

  document.querySelectorAll<HTMLElement>("[data-lab-days]").forEach((button) =>
    button.addEventListener("click", () => {
      labState.days = Number(button.dataset.labDays);
      paintDays();
      void refresh();
    }),
  );

  query("[data-lab-tiles]").addEventListener("click", (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-lab-tile]");
    if (!tile) return;
    labState.selected = tile.dataset.labTile as typeof labState.selected;
    renderTiles();
    renderDetail();
    query("[data-lab-detail]").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.addEventListener("lab:changed", renderTiles);
  await refresh();
}
