import { changeClass, errorText, esc, markForSymbol, px, query } from "./dom";
import { displaySymbol } from "./market";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";
const refreshMs = 30_000;
const marketRows = 40;

type Protocol = {
  at: number;
  headline: { markets: number; volume24hUsd: number; openInterestUsd: number; hip3Volume24hUsd: number };
  markets: { symbol: string; dex: string; mark: number; changePct: number; volume24hUsd: number; openInterestUsd: number; fundingAprPct: number; impactSpreadBps: number | null; maxLeverage: number; shareVolume: number }[];
};
type Board = { rows: { rank: number; address: string; displayName: string | null; equityUsd: number; pnlUsd: number; roiPct: number; volumeUsd: number }[] };
type Wallet = {
  found: boolean;
  address: string;
  perpEquityUsd: number;
  withdrawableUsd: number;
  unrealizedPnlUsd: number;
  positions: { coin: string; size: number; entryPx: number; markPx: number; positionValue: number; leverage: number; unrealizedPnl: number; liquidationDistancePct: number | null }[];
  recentFills: { count: number; volumeUsd: number; realizedPnlUsd: number; feesUsd: number; winRatePct: number; liquidations: number; makerSharePct: number };
};

let network = "mainnet";
let updatedAt = 0;
let sort: "pnl" | "roi" | "volume" = "pnl";
let windowKey: "day" | "week" | "month" | "allTime" = "week";

const compact = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(abs < 10 ? 2 : 0)}`;
};
const pct = (value: number, digits = 2) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}%`;
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const ago = (ms: number) => {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${backend}${path}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Analytics ${response.status}`);
  return body;
}

function paintProtocol(data: Protocol) {
  const { headline } = data;
  const cells: [string, string][] = [
    ["24h volume", compact(headline.volume24hUsd)],
    ["Open interest", compact(headline.openInterestUsd)],
    ["Markets", String(headline.markets)],
    ["HIP-3 share of volume", headline.volume24hUsd > 0 ? `${((headline.hip3Volume24hUsd / headline.volume24hUsd) * 100).toFixed(0)}%` : "—"],
  ];
  query("[data-an-headline]").innerHTML = `<div class="stat-grid">${cells.map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("")}</div>`;
  const rows = data.markets
    .slice(0, marketRows)
    .map(
      (m) => `<tr class="asset-row--link" data-open-asset="${esc(m.symbol)}" tabindex="0">
        <td><div class="cell-identity">${markForSymbol(m.symbol)}<b>${esc(displaySymbol(m.symbol))}</b></div></td>
        <td class="is-right">${px(m.mark)}</td>
        <td class="is-right ${changeClass(m.changePct)}">${pct(m.changePct)}</td>
        <td class="is-right">${compact(m.volume24hUsd)}</td>
        <td class="is-right">${(m.shareVolume * 100).toFixed(1)}%</td>
        <td class="is-right">${compact(m.openInterestUsd)}</td>
        <td class="is-right ${changeClass(-m.fundingAprPct)}">${pct(m.fundingAprPct, 1)}</td>
        <td class="is-right">${m.impactSpreadBps === null ? "—" : `${m.impactSpreadBps.toFixed(1)} bps`}</td>
        <td class="is-right">${m.maxLeverage}x</td>
      </tr>`,
    )
    .join("");
  query("[data-an-markets]").innerHTML = `<table class="data-table"><thead><tr><th>Market</th><th class="is-right">Price</th><th class="is-right">24h</th><th class="is-right">Volume</th><th class="is-right">Share</th><th class="is-right">Open interest</th><th class="is-right">Funding a year</th><th class="is-right">Impact spread</th><th class="is-right">Max lev</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function loadProtocol() {
  const live = query("[data-an-live]");
  try {
    const data = await get<Protocol>(`/analytics/protocol?network=${network}`);
    paintProtocol(data);
    updatedAt = data.at;
    live.classList.remove("live--off");
  } catch (error) {
    live.classList.add("live--off");
    query("[data-an-headline]").innerHTML = `<p class="status-line" data-tone="error">${esc(errorText(error))}. Is the backend running?</p>`;
  }
}

async function showBoard() {
  const host = query("[data-an-wallet]");
  host.innerHTML = `<p class="empty">Loading the leaderboard…</p>`;
  try {
    const board = await get<Board>(`/analytics/leaderboard?network=${network}&sort=${sort}&window=${windowKey}&limit=25&minEquity=1000`);
    const chips = (items: [string, string][], active: string, attr: string) => `<div class="chip-row">${items.map(([key, label]) => `<button type="button" class="chip${key === active ? " chip--active" : ""}" ${attr}="${key}">${label}</button>`).join("")}</div>`;
    host.innerHTML =
      `<div class="card">${chips([["pnl", "Profit"], ["roi", "Return"], ["volume", "Volume"]], sort, "data-board-sort")}${chips([["day", "Day"], ["week", "Week"], ["month", "Month"], ["allTime", "All time"]], windowKey, "data-board-window")}` +
      `<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Wallet</th><th class="is-right">Equity</th><th class="is-right">Profit</th><th class="is-right">Return</th><th class="is-right">Volume</th></tr></thead><tbody>${board.rows
        .map((r) => `<tr class="asset-row--link" data-an-lookup="${esc(r.address)}" tabindex="0"><td>${r.rank}</td><td>${esc(r.displayName ?? short(r.address))}</td><td class="is-right">${compact(r.equityUsd)}</td><td class="is-right ${changeClass(r.pnlUsd)}">${compact(r.pnlUsd)}</td><td class="is-right ${changeClass(r.roiPct)}">${pct(r.roiPct, 1)}</td><td class="is-right">${compact(r.volumeUsd)}</td></tr>`)
        .join("")}</tbody></table></div></div>`;
  } catch (error) {
    host.innerHTML = `<p class="status-line" data-tone="error">${esc(errorText(error))}</p>`;
  }
}

async function lookup(address: string) {
  const host = query("[data-an-wallet]");
  host.innerHTML = `<p class="empty">Reading ${esc(short(address))}…</p>`;
  try {
    const w = await get<Wallet>(`/analytics/wallet?network=${network}&address=${address}`);
    if (!w.found) {
      host.innerHTML = `<p class="empty">${esc(short(address))} has never used Hyperliquid on ${network}.</p>`;
      return;
    }
    const f = w.recentFills;
    const cells: [string, string][] = [
      ["Account value", compact(w.perpEquityUsd)],
      ["Withdrawable", compact(w.withdrawableUsd)],
      ["Unrealised", compact(w.unrealizedPnlUsd)],
      ["Recent fills", String(f.count)],
      ["Realised", compact(f.realizedPnlUsd)],
      ["Fees paid", compact(f.feesUsd)],
      ["Win rate", `${f.winRatePct.toFixed(0)}%`],
      ["Maker share", `${f.makerSharePct.toFixed(0)}%`],
      ["Liquidations", String(f.liquidations)],
    ];
    const positions = w.positions
      .map((p) => `<tr><td><div class="cell-identity">${markForSymbol(p.coin)}${p.size >= 0 ? "Long" : "Short"} ${esc(displaySymbol(p.coin))}</div></td><td class="is-right">${compact(p.positionValue)}</td><td class="is-right">${p.leverage}x</td><td class="is-right">${px(p.entryPx)}</td><td class="is-right">${px(p.markPx)}</td><td class="is-right ${changeClass(p.unrealizedPnl)}">${compact(p.unrealizedPnl)}</td><td class="is-right">${p.liquidationDistancePct === null ? "—" : `${p.liquidationDistancePct.toFixed(1)}% away`}</td></tr>`)
      .join("");
    host.innerHTML = `<div class="card"><span class="panel__label">${esc(short(w.address))}</span><div class="stat-grid">${cells.map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("")}</div></div>` +
      `<div class="card"><span class="panel__label">Open positions</span>${w.positions.length === 0 ? `<p class="empty">No open positions.</p>` : `<div class="table-wrap"><table class="data-table"><thead><tr><th>Position</th><th class="is-right">Size</th><th class="is-right">Lev</th><th class="is-right">Entry</th><th class="is-right">Mark</th><th class="is-right">PnL</th><th class="is-right">Liquidation</th></tr></thead><tbody>${positions}</tbody></table></div>`}</div>` +
      `<p class="quote-line">Fill statistics cover the wallet's last 2,000 fills only.</p>`;
  } catch (error) {
    host.innerHTML = `<p class="status-line" data-tone="error">${esc(errorText(error))}</p>`;
  }
}

export function initAnalytics() {
  void loadProtocol();
  void showBoard();
  setInterval(() => {
    const label = query("[data-an-live] span");
    label.textContent = updatedAt === 0 ? "Connecting…" : `Live · updated ${ago(updatedAt)}`;
    if (!document.hidden && Date.now() - updatedAt > refreshMs) void loadProtocol();
  }, 1000);

  query("[data-an-net]").parentElement!.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-an-net]");
    if (!button || button.dataset.anNet === network) return;
    network = button.dataset.anNet!;
    button.parentElement!.querySelectorAll("[data-an-net]").forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
    updatedAt = 0;
    void loadProtocol();
    void showBoard();
  });

  query<HTMLFormElement>("[data-an-search]").addEventListener("submit", (event) => {
    event.preventDefault();
    const address = query<HTMLInputElement>("[data-an-address]").value.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(address)) void lookup(address);
    else query("[data-an-wallet]").innerHTML = `<p class="status-line" data-tone="error">That is not a wallet address.</p>`;
  });
  query("[data-an-board-btn]").addEventListener("click", () => void showBoard());

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-an-lookup]");
    if (row) {
      query<HTMLInputElement>("[data-an-address]").value = row.dataset.anLookup!;
      void lookup(row.dataset.anLookup!);
      return;
    }
    const sortButton = target.closest<HTMLElement>("[data-board-sort]");
    const windowButton = target.closest<HTMLElement>("[data-board-window]");
    if (sortButton) sort = sortButton.dataset.boardSort as typeof sort;
    if (windowButton) windowKey = windowButton.dataset.boardWindow as typeof windowKey;
    if (sortButton || windowButton) void showBoard();
  });
}
