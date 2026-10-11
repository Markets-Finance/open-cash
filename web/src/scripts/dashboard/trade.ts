import { closeBin, estimateMarketOrder, marketKind, marketSession, weekendGapStats, type WeekendGapStats, maxOrderNotionalUsd, openBin, sizeBin, slippageWarnBps, type Bin, type ChartRangeKey, type ExecutionEstimate, type HlPosition } from "shared";
import { agentExchange } from "../hlSession";
import { drawCandles } from "./charts";
import { buildOverlay } from "./chartOverlay";
import { withFundingHint, changeClass, errorText, markForSymbol, px, query, say, usd } from "./dom";
import { getCandles } from "./candles";
import { getDesk } from "./desk";
import { displaySymbol, getMarketData, getMarketView } from "./market";
import { guardOrThrow } from "./guardrails";
import { info } from "../hl";
import { initBoard } from "./board";
import { initFloorCard, initFloorList } from "./floor";
import { initPositionCard } from "./positionCard";
import { requireTrader } from "./state";
import { activateTab } from "./tabs";

type Side = "long" | "short";

let searchTerm = "";
let symbol = "BTC";
let side: Side = "long";
let positions: HlPosition[] = [];
let range: ChartRangeKey = "1d";
let rerender: () => void = () => {};
let openHook: ((next: string) => void) | null = null;
let pendingAsset = false;
let accepted = false;
let availableUsd = 0;
let costRun = 0;
const gapCache = new Map<string, WeekendGapStats>();

export function openAsset(next: string) {
  symbol = next;
  searchTerm = "";
  if (openHook) openHook(next);
  else pendingAsset = true;
  activateTab("trade");
}

export function setTradeQuery(value: string) {
  searchTerm = value;
  rerender();
}

function elements() {
  return {
    balance: query("[data-trade-balance]"),
    updated: query("[data-trade-updated]"),
    note: query("[data-trade-wallet-note]"),
    label: query("[data-trade-market-label]"),
    price: query("[data-trade-market-price]"),
    meta: query("[data-trade-market-meta]"),
    session: query("[data-trade-session]"),
    gapCard: query("[data-gap-card]"),
    gapStats: query("[data-gap-stats]"),
    gapNote: query("[data-gap-note]"),
    chart: query("[data-trade-chart]"),
    legend: query("[data-trade-legend]"),
    desk: query("[data-trade-desk]"),
    deskStatus: query("[data-trade-desk-status]"),
    title: query("[data-trade-ticket-title]"),
    margin: query<HTMLInputElement>("[data-ticket-margin]"),
    leverage: query<HTMLInputElement>("[data-ticket-leverage]"),
    size: query("[data-ticket-size]"),
    cost: query("[data-ticket-cost]"),
    levLabel: query("[data-ticket-leverage-label]"),
    levBox: query(".lev"),
    ticks: query("[data-ticket-ticks]"),
    risk: query("[data-ticket-risk]"),
    available: query("[data-ticket-available]"),
    quick: query("[data-ticket-quick]"),
    submit: query<HTMLButtonElement>("[data-ticket-submit]"),
    status: query("[data-ticket-status]"),
    stats: query("[data-trade-stats]"),
    depth: query("[data-trade-depth]"),
    list: query("[data-trade-list]"),
    asset: query("[data-trade-asset]"),
    search: query<HTMLInputElement>("[data-trade-search]"),
  };
}

function slippageCap(estimate: ExecutionEstimate | null): number {
  const expected = estimate?.slippageBps ?? 20;
  return Math.min(0.01, Math.max(0.002, (expected * 2) / 10_000));
}

function singleLegBin(coin: string, direction: Side, leverage: number): Bin {
  return { id: `single:${coin}`, name: displaySymbol(coin), thesis: "", legs: [{ symbol: coin, direction, weightBps: 10000, leverage }] };
}

function liquidationDistancePct(leverage: number, maxLeverage: number): number {
  return Math.max(0, (1 / leverage - 1 / (2 * maxLeverage)) * 100);
}

export async function initTrade() {
  const trader = requireTrader();
  const ui = elements();
  const data = await getMarketData();
  if (!data.markets.has(symbol)) symbol = data.markets.has("BTC") ? "BTC" : ([...data.markets.keys()][0] ?? symbol);

  const board = initBoard(data, (next, chosen) => {
    if (chosen) setSide(chosen);
    showAsset(next);
  });

  function renderMarkets() {
    board.setSearch(searchTerm);
  }

  function setSide(next: Side) {
    side = next;
    document.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((b) => b.classList.toggle("is-on", b.dataset.side === next));
  }

  function renderMarketHead() {
    const market = data.markets.get(symbol);
    ui.label.textContent = market ? `${displaySymbol(market.name)} · ${market.dex ? `${market.dex} perp` : "Perp"}` : "—";
    ui.price.textContent = market ? px(market.markPx) : "—";
    ui.meta.textContent = market ? `max ${market.maxLeverage}x · open interest ${compact(market.openInterest * market.markPx)}` : "";
    ui.title.textContent = `${side === "long" ? "Long" : "Short"} ${displaySymbol(symbol)}`;
    syncLeverageRange();
    renderSession();
    void renderGaps();
    document.dispatchEvent(new Event("floor:refresh"));
  }

  function renderSession() {
    const session = marketSession(symbol);
    ui.session.textContent = session.label;
    ui.session.dataset.open = String(session.tradfiOpen);
  }

  async function renderGaps() {
    const shown = symbol;
    if (marketKind(shown) === "crypto") {
      ui.gapCard.hidden = true;
      return;
    }
    ui.gapCard.hidden = false;
    ui.gapStats.innerHTML = `<p class="empty">Loading…</p>`;
    ui.gapNote.textContent = "";
    try {
      let stats = gapCache.get(shown);
      if (!stats) {
        stats = await weekendGapStats(info, shown);
        gapCache.set(shown, stats);
      }
      if (shown !== symbol) return;
      if (stats.gaps.length === 0) {
        ui.gapCard.hidden = true;
        return;
      }
      const cells: [string, string][] = [
        ["Weeks measured", String(stats.weeks)],
        ["Typical weekend gap", stats.medianAbsGapPct === null ? "—" : `${stats.medianAbsGapPct.toFixed(2)}%`],
        ["Weekend moved the right way", stats.directionHitRate === null ? "—" : `${Math.round(stats.directionHitRate * 100)}%`],
        ["Gap already priced in", stats.medianCapturedShare === null ? "—" : `${Math.round(stats.medianCapturedShare * 100)}%`],
      ];
      ui.gapStats.innerHTML = cells.map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("");
      ui.gapNote.textContent = [...new Set([stats.method, stats.caveat, marketSession(shown).caveat].filter(Boolean))].join(" ");
    } catch (error) {
      if (shown === symbol) ui.gapStats.innerHTML = `<p class="empty">${errorText(error)}</p>`;
    }
  }

  function syncLeverageRange() {
    const max = Math.max(1, data.markets.get(symbol)?.maxLeverage ?? 1);
    ui.leverage.max = String(max);
    if (Number(ui.leverage.value) > max) ui.leverage.value = String(max);
    const marks = [...new Set([1, Math.round(max / 3), Math.round((max * 2) / 3), max])].filter((value) => value >= 1);
    ui.ticks.innerHTML = marks.map((value) => `<button type="button" data-lev-tick="${value}">${value}x</button>`).join("");
    paintLeverage();
  }

  function paintLeverage() {
    const max = Number(ui.leverage.max) || 1;
    const value = Number(ui.leverage.value) || 1;
    ui.levLabel.textContent = `${value}x`;
    ui.leverage.style.setProperty("--fill", `${max > 1 ? ((value - 1) / (max - 1)) * 100 : 100}%`);
    const ratio = max > 1 ? (value - 1) / (max - 1) : 0;
    ui.levBox.dataset.levRisk = ratio < 0.34 ? "low" : ratio < 0.67 ? "mid" : "high";
    ui.risk.textContent = `About a ${liquidationDistancePct(value, max).toFixed(1)}% move against you liquidates this position.`;
  }

  async function renderChart() {
    const market = data.markets.get(symbol);
    if (!market) return;
    const shown = symbol;
    try {
      const candles = await getCandles(market.name, range);
      const built = await buildOverlay(market.name, candles).catch(() => null);
      if (shown === symbol) {
        drawCandles(ui.chart, candles, "No trades in this range on Hyperliquid testnet.", built?.overlay);
        ui.legend.textContent = built?.legend ?? "";
      }
    } catch (error) {
      ui.chart.innerHTML = `<div class="chart-empty">${errorText(error)}</div>`;
    }
  }

  function currentSizing() {
    const margin = Number(ui.margin.value);
    const leverage = Math.min(Number(ui.leverage.value) || 1, data.markets.get(symbol)?.maxLeverage ?? 1);
    if (!(margin > 0)) return null;
    return sizeBin(singleLegBin(symbol, side, leverage), margin, data.markets);
  }

  function isRisky(estimate: ExecutionEstimate | null) {
    return estimate !== null && (estimate.slippageBps === null || estimate.slippageBps > slippageWarnBps);
  }

  let lastEstimate: ExecutionEstimate | null = null;

  function paintCost(estimate: ExecutionEstimate | null) {
    lastEstimate = estimate;
    ui.cost.hidden = estimate === null;
    if (estimate === null) return;
    const risky = isRisky(estimate);
    const funding = estimate.fundingDailyUsd;
    const rows: [string, string][] = [
      ["Slippage", estimate.slippageBps === null ? "Beyond the book" : `${estimate.slippageBps.toFixed(1)} bps · ${usd(estimate.slippageUsd ?? 0)}`],
      ["Spread", `${estimate.spreadBps.toFixed(1)} bps`],
      ["Taker fee", usd(estimate.feeUsd)],
      ["Price limit", `${(slippageCap(estimate) * 100).toFixed(2)}% from the mark`],
      ["Funding a day", `${funding >= 0 ? "pay" : "earn"} ${usd(Math.abs(funding))}`],
    ];
    ui.cost.innerHTML =
      rows.map(([label, value], index) => `<div class="cost__row${risky && index === 0 ? " cost__row--warn" : ""}"><span>${label}</span><b>${value}</b></div>`).join("") +
      (risky ? `<p class="cost__warn">Thin book for this size. Up to ${usd(estimate.maxSizeUsd)} fills within ${slippageWarnBps} bps.</p>` : "");
  }

  async function renderCost() {
    const run = ++costRun;
    const sizing = currentSizing();
    const leg = sizing?.sized.legs[0];
    if (!leg) return paintCost(null);
    const shown = symbol;
    try {
      const { book, snapshot } = await getMarketView(shown);
      if (run !== costRun) return;
      paintCost(estimateMarketOrder(book, snapshot, side === "long" ? "buy" : "sell", leg.notional));
    } catch {
      if (run === costRun) paintCost(null);
    }
  }

  function renderTicketSize() {
    const sizing = currentSizing();
    const leg = sizing?.sized.legs[0];
    ui.size.textContent = leg
      ? `${leg.size} ${displaySymbol(symbol)} · ${usd(leg.notional)} notional · ${leg.leverage}x`
      : (sizing?.issues[0]?.detail ?? "");
    accepted = false;
    ui.submit.textContent = `${side === "long" ? "Long" : "Short"} ${displaySymbol(symbol)}`;
    ui.submit.dataset.side = side;
    void renderCost();
  }

  function renderDesk() {
    if (positions.length === 0) {
      ui.desk.className = "empty";
      ui.desk.textContent = "No open positions on Hyperliquid testnet for this address.";
      return;
    }
    ui.desk.className = "table-wrap";
    ui.desk.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Market</th><th>Size</th><th>Entry</th><th>Margin</th><th>Liq.</th><th style="text-align:right">PnL</th><th></th></tr></thead>
        <tbody>${positions
          .map(
            (entry, index) => `
              <tr>
                <td><div class="cell-identity">${markForSymbol(entry.coin)}${entry.size >= 0 ? "Long" : "Short"} ${displaySymbol(entry.coin)}</div></td>
                <td class="cell-muted">${Math.abs(entry.size)}</td>
                <td class="cell-muted">${px(entry.entryPx)}</td>
                <td class="cell-muted">${usd(entry.marginUsed)}</td>
                <td class="cell-muted">${entry.liquidationPx === null ? "—" : px(entry.liquidationPx)}</td>
                <td class="cell-value ${changeClass(entry.unrealizedPnl)}">${usd(entry.unrealizedPnl)}</td>
                <td><button type="button" class="link-btn" data-close-index="${index}">Close</button></td>
              </tr>`,
          )
          .join("")}</tbody>
      </table>`;
    ui.desk.querySelectorAll<HTMLButtonElement>("[data-close-index]").forEach((button) =>
      button.addEventListener("click", async () => {
        const entry = positions[Number(button.dataset.closeIndex)];
        button.disabled = true;
        say(ui.deskStatus, "Closing…");
        try {
          const [result] = await closeBin(await agentExchange(trader), [entry], data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
          if (result?.error) throw new Error(result.error);
          say(ui.deskStatus, `${displaySymbol(entry.coin)} closed.`);
          await refresh();
        } catch (error) {
          say(ui.deskStatus, errorText(error), "error");
          button.disabled = false;
        }
      }),
    );
  }

  async function refresh() {
    const desk = await getDesk(true);
    positions = desk.positions;
    const used = desk.positions.reduce((sum, p) => sum + p.marginUsed, 0);
    ui.balance.textContent = usd(desk.equity);
    availableUsd = Math.max(0, desk.equity - used);
    ui.available.textContent = `Available ${usd(availableUsd)}`;
    ui.note.textContent = desk.equity > 0 ? `${usd(used)} in margin on ${desk.positions.length} open positions` : "No funds yet. Use Deposit to add USDC.";
    ui.updated.textContent = desk.updatedAt.toLocaleTimeString();
    renderDesk();
    if (!ui.asset.hidden) {
      void renderChart();
      void paintPosition();
    }
  }

  function showAsset(next: string) {
    symbol = next;
    ui.list.hidden = true;
    ui.asset.hidden = false;
    renderAll();
    void loadStats();
    void paintPosition();
    window.scrollTo({ top: 0 });
  }

  function showList() {
    ui.asset.hidden = true;
    ui.list.hidden = false;
    renderMarkets();
  }

  const compact = (value: number) => (value >= 1e6 ? `$${(value / 1e6).toFixed(2)}M` : value >= 1e3 ? `$${(value / 1e3).toFixed(1)}K` : `$${value.toFixed(0)}`);

  async function loadStats() {
    const shown = symbol;
    ui.stats.innerHTML = `<p class="empty">Loading…</p>`;
    ui.depth.innerHTML = "";
    try {
      const { snapshot, depth } = await getMarketView(shown);
      if (shown !== symbol) return;
      const cells: [string, string][] = [
        ["24h volume", compact(snapshot.volume24hUsd)],
        ["Open interest", compact(snapshot.openInterestUsd)],
        ["Max leverage", `${snapshot.maxLeverage}x`],
        ["Today", `${snapshot.change24hPct >= 0 ? "▲" : "▼"} ${Math.abs(snapshot.change24hPct).toFixed(2)}%`],
        ["Spread", `${snapshot.spreadBps.toFixed(1)} bps`],
        ["Funding now", `${snapshot.funding.nowAprPct.toFixed(1)}% a year`],
        ["Funding avg 7d", `${snapshot.funding.meanAprPct.toFixed(1)}% a year`],
        ["Fees maker · taker", `${snapshot.makerFeeBps.toFixed(1)} · ${snapshot.takerFeeBps.toFixed(1)} bps`],
      ];
      ui.depth.innerHTML = depth
        ? ([
            ["10 bps", depth.bidUsdWithin10Bps, depth.askUsdWithin10Bps],
            ["25 bps", depth.bidUsdWithin25Bps, depth.askUsdWithin25Bps],
            ["50 bps", depth.bidUsdWithin50Bps, depth.askUsdWithin50Bps],
          ] as [string, number, number][])
            .map(([label, bid, ask]) => {
              const share = bid + ask > 0 ? Math.round((bid / (bid + ask)) * 100) : 50;
              return `<div class="depth__row"><span class="depth__label">Within ${label}</span><b class="depth__bid">${compact(bid)}</b><div class="depth__bar" style="--bid:${share}%"><i></i></div><b class="depth__ask">${compact(ask)}</b></div>`;
            })
            .join("")
        : `<p class="empty">Book unavailable.</p>`;
      ui.stats.innerHTML = cells.map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("");
    } catch (error) {
      ui.stats.innerHTML = `<p class="empty">${errorText(error)}</p>`;
    }
  }

  function renderAll() {
    renderMarkets();
    renderMarketHead();
    renderTicketSize();
    void renderChart();
  }
  rerender = renderMarkets;
  openHook = (next) => showAsset(next);
  ui.search.addEventListener("input", () => {
    searchTerm = ui.search.value.trim().toLowerCase();
    renderMarkets();
  });
  query<HTMLButtonElement>("[data-trade-back]").addEventListener("click", showList);

  const rangeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-trade-range] [data-range]"));
  rangeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      range = button.dataset.range as ChartRangeKey;
      rangeButtons.forEach((b) => b.classList.toggle("chip--active", b === button));
      void renderChart();
    }),
  );

  document.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((button) =>
    button.addEventListener("click", () => {
      side = button.dataset.side as Side;
      document
        .querySelectorAll<HTMLButtonElement>("[data-side]")
        .forEach((b) => b.classList.toggle("is-on", b === button));
      renderMarketHead();
      renderTicketSize();
    }),
  );
  ui.margin.addEventListener("input", renderTicketSize);
  ui.leverage.addEventListener("input", () => {
    paintLeverage();
    renderTicketSize();
  });
  ui.ticks.addEventListener("click", (event) => {
    const tick = (event.target as HTMLElement).closest<HTMLElement>("[data-lev-tick]");
    if (!tick) return;
    ui.leverage.value = tick.dataset.levTick!;
    paintLeverage();
    renderTicketSize();
  });
  ui.quick.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-quick]");
    if (!button || !(availableUsd > 0)) return;
    ui.margin.value = (Math.floor(availableUsd * Number(button.dataset.quick) * 100) / 100).toString();
    renderTicketSize();
  });
  query<HTMLButtonElement>("[data-trade-refresh]").addEventListener("click", () => void refresh().catch(() => {}));

  ui.submit.addEventListener("click", async () => {
    const sizing = currentSizing();
    if (!sizing || sizing.sized.legs.length === 0) {
      say(ui.status, sizing?.issues[0]?.detail ?? "Enter a margin amount.", "error");
      return;
    }
    if (isRisky(lastEstimate) && !accepted) {
      accepted = true;
      ui.submit.textContent = "Click again to accept slippage";
      return;
    }
    ui.submit.disabled = true;
    say(ui.status, "Waiting for your passkey…");
    try {
      if (Number(ui.margin.value) > availableUsd) throw new Error("Not enough balance. Tap Add funds above the amount box to deposit.");
      await guardOrThrow(Number(ui.margin.value));
      const exchange = await agentExchange(trader);
      say(ui.status, "Opening position…");
      const cap = slippageCap(lastEstimate);
      const [result] = await openBin(exchange, sizing.sized, data.markets, { maxNotionalUsd: maxOrderNotionalUsd, slippage: cap });
      if (!result || result.error) throw new Error(result?.error ?? "The order was not accepted.");
      const wanted = sizing.sized.legs[0]?.size ?? 0;
      say(
        ui.status,
        wanted > 0 && result.filledSize < wanted * 0.98
          ? `Partly filled: ${result.filledSize} of ${wanted} ${displaySymbol(symbol)}. The rest was not taken because the price moved more than ${(cap * 100).toFixed(2)}%.`
          : `${side === "long" ? "Long" : "Short"} ${displaySymbol(symbol)} is open at ${result.avgPx === null ? "market" : px(result.avgPx)}.`,
      );
      ui.margin.value = "";
      renderTicketSize();
      await refresh();
    } catch (error) {
      say(ui.status, withFundingHint(symbol, errorText(error)), "error");
    } finally {
      ui.submit.disabled = false;
    }
  });

  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-ticket-mode]"));
  const modePanes = Array.from(document.querySelectorAll<HTMLElement>("[data-ticket-pane]"));
  function setMode(mode: "floor" | "pro") {
    modeButtons.forEach((b) => b.classList.toggle("is-on", b.dataset.ticketMode === mode));
    modePanes.forEach((pane) => (pane.hidden = pane.dataset.ticketPane !== mode));
    try {
      localStorage.setItem("opencash.ticket.mode.v2", mode);
    } catch {
      return;
    }
  }
  modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.ticketMode as "floor" | "pro")));
  let savedMode: string | null = null;
  try {
    savedMode = localStorage.getItem("opencash.ticket.mode.v2");
  } catch {
    savedMode = null;
  }
  setMode(savedMode === "floor" ? "floor" : "pro");

  const paintPosition = initPositionCard({
    symbol: () => symbol,
    addToPosition: (next) => {
      setSide(next);
      setMode("pro");
      renderMarketHead();
      renderTicketSize();
      ui.margin.focus();
      ui.margin.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    changed: () => {
      void refresh();
      void renderChart();
    },
  });
  document.addEventListener("floor:changed", () => void paintPosition());
  initFloorList();
  initFloorCard({
    current: () => ({ symbol, isLong: side === "long" }),
    setSide: (next) => {
      setSide(next);
      renderMarketHead();
      renderTicketSize();
    },
  });
  renderAll();
  renderMarkets();
  if (pendingAsset) {
    pendingAsset = false;
    showAsset(symbol);
  }
  await refresh().catch((error) => say(ui.deskStatus, errorText(error), "error"));
}
