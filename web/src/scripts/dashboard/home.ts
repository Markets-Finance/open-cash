import { bins, type HlPosition } from "shared";
import { drawLine } from "./charts";
import { filterHistory, loadHistory, recordSnapshot, type HistoryRange } from "./history";
import { changeClass, legStackHtml, markForSymbol, px, query, usd } from "./dom";
import { getDesk } from "./desk";
import { displaySymbol, getMarketData, getPositions, type MarketData } from "./market";
import { requireTrader } from "./state";

const featuredSymbols = [...new Set(bins.flatMap((bin) => bin.legs.map((leg) => leg.symbol)))];

function listedSymbols(data: MarketData): string[] {
  return featuredSymbols.filter((symbol) => data.markets.has(symbol));
}

async function loadSummary() {
  const desk = await getDesk(true);
  return { total: desk.equity, unrealizedPnl: desk.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0), symbols: desk.positions.map((p) => p.coin) };
}

function renderPositionsTable(container: HTMLElement, positions: HlPosition[]) {
  if (positions.length === 0) {
    container.className = "empty";
    container.textContent = "No open positions yet. Open a bin or place a trade.";
    return;
  }
  container.className = "table-wrap";
  const rows = positions
    .map(
      (position) => `
        <tr class="asset-row--link" data-open-asset="${position.coin}" tabindex="0">
          <td><div class="cell-identity">${markForSymbol(position.coin)}${position.size >= 0 ? "Long" : "Short"} ${displaySymbol(position.coin)}</div></td>
          <td class="cell-muted">${position.leverage}x ${position.leverageType}</td>
          <td class="cell-value">${usd(position.marginUsed + position.unrealizedPnl)}</td>
        </tr>`,
    )
    .join("");
  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Position</th><th>Leverage</th><th style="text-align:right">Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderMarkets(container: HTMLElement, data: MarketData) {
  container.className = "asset-list";
  container.innerHTML = listedSymbols(data)
    .map((symbol) => {
      const market = data.markets.get(symbol);
      return `
        <div class="asset-row asset-row--link" data-open-asset="${symbol}" role="button" tabindex="0" aria-label="Trade ${symbol}">
          ${markForSymbol(symbol)}
          <span class="asset-row__identity">${displaySymbol(symbol)}</span>
          <span class="asset-row__price">${market ? px(market.markPx) : "—"}</span>
          <span class="asset-row__change">${market ? `max ${market.maxLeverage}x` : "—"}</span>
        </div>`;
    })
    .join("");
}

function renderTicker(container: HTMLElement, data: MarketData) {
  container.className = "ticker-row";
  container.innerHTML = listedSymbols(data)
    .slice(0, 4)
    .map((symbol) => {
      const market = data.markets.get(symbol);
      return `
        <div class="ticker-card asset-row--link" data-open-asset="${symbol}" role="button" tabindex="0" aria-label="Trade ${symbol}">
          <div class="ticker-card__head">${markForSymbol(symbol)}<span class="ticker-card__symbol">${displaySymbol(symbol)}</span></div>
          <span class="ticker-card__price">${market ? px(market.markPx) : "—"}</span>
        </div>`;
    })
    .join("");
}

export async function initHome() {
  const trader = requireTrader();
  const balanceEl = query("[data-home-balance]");
  const updatedEl = query("[data-home-updated]");
  const portfolioValueEl = query("[data-portfolio-value]");
  const portfolioChangeEl = query("[data-portfolio-change]");

  const chartEl = query("[data-portfolio-chart]");
  const rangeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-portfolio-range] [data-range]"),
  );
  let history = loadHistory(trader.address);
  let range: HistoryRange = "1d";

  function paintHistory() {
    drawLine(
      chartEl,
      filterHistory(history, range),
      "Portfolio history builds up as you use the app. Each visit adds a data point.",
    );
  }
  rangeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      range = button.dataset.range as HistoryRange;
      rangeButtons.forEach((b) => b.classList.toggle("chip--active", b === button));
      paintHistory();
    }),
  );
  paintHistory();

  const changeEl = query("[data-wallet-change]");
  const coinsEl = query("[data-wallet-coins]");

  function paintTotal(total: number, pnl: number, symbols: string[]) {
    const [whole, cents] = Math.abs(total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(".");
    balanceEl.innerHTML = `${total < 0 ? "−" : ""}$${whole}<small>.${cents}</small>`;
    changeEl.textContent = `${pnl >= 0 ? "+" : "−"} ${usd(Math.abs(pnl))}`;
    coinsEl.innerHTML = symbols.slice(0, 4).map(markForSymbol).join("");
    updatedEl.textContent = new Date().toLocaleTimeString();
  }

  async function refreshBalance() {
    const data = await getMarketData();
    const summary = await loadSummary();
    paintTotal(summary.total, summary.unrealizedPnl, summary.symbols.length ? summary.symbols : listedSymbols(data));
  }
  query<HTMLButtonElement>("[data-home-refresh]").addEventListener("click", () => void refreshBalance().catch(() => {}));
  void refreshBalance().catch(() => {});

  try {
    const data = await getMarketData();
    renderMarkets(query("[data-top-assets]"), data);
    renderTicker(query("[data-ticker-row]"), data);
    const summary = await loadSummary();
    portfolioValueEl.textContent = usd(summary.total);
    portfolioChangeEl.textContent = `${usd(summary.unrealizedPnl)} unrealised`;
    portfolioChangeEl.className = `chart-change ${changeClass(summary.unrealizedPnl)}`;
    history = recordSnapshot(trader.address, summary.total);
    paintHistory();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const selector of ["[data-top-assets]", "[data-ticker-row]"]) {
      const el = query(selector);
      el.className = "error-text";
      el.textContent = message;
    }
  }

  renderPositionsTable(query("[data-home-positions-table]"), await getPositions().catch(() => []));
}
