import { esc, markForSymbol, query } from "../dom";
import { toolbox } from "../agent/session";
import { initDetail, renderDetail } from "./detail";
import { loadSeries } from "./data";
import { initPaper } from "./paper";
import { labState } from "./state";
import { renderTiles } from "./tiles";

function paintMarkets() {
  const link = query<HTMLButtonElement>("[data-lab-trade]");
  link.dataset.openAsset = labState.symbol;
  link.textContent = `Trade ${labState.symbol} ↗`;
  query("[data-lab-markets]").innerHTML = labState.symbols
    .map(
      (symbol) =>
        `<button type="button" class="chip chip--market" data-lab-market="${esc(symbol)}" aria-pressed="${symbol === labState.symbol}">${markForSymbol(symbol)}${esc(symbol)}</button>`,
    )
    .join("");
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
