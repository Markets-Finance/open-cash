import type { MarketSnapshot, ToolOutcome } from "shared";
import { pairVerdict } from "shared";
import { changeClass, esc, markForSymbol, px, usd } from "../dom";

type Rows = [label: string, value: string, tone?: string][];

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function signed(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function stats(rows: Rows): string {
  return `<div class="stat-grid">${rows
    .map(
      ([label, value, tone]) =>
        `<div class="stat"><span class="stat__label">${esc(label)}</span><span class="stat__value ${tone ?? ""}">${esc(value)}</span></div>`,
    )
    .join("")}</div>`;
}

function snapshotRows(s: MarketSnapshot): Rows {
  return [
    ["Mark", px(s.mark)],
    ["24h", `${signed(s.change24hPct)}%`, changeClass(s.change24hPct)],
    ["Spread", `${s.spreadBps.toFixed(1)} bps`],
    ["Volume 24h", compact(s.volume24hUsd)],
    ["Open interest", compact(s.openInterestUsd)],
    ["Max leverage", `${s.maxLeverage}x`],
    ["Funding now", `${signed(s.funding.nowAprPct, 0)}% APR`, changeClass(s.funding.nowAprPct)],
    ["Funding 7d avg", `${signed(s.funding.meanAprPct, 1)}% APR`, changeClass(s.funding.meanAprPct)],
    ["Fees maker / taker", `${s.makerFeeBps.toFixed(2)} / ${s.takerFeeBps.toFixed(2)} bps`],
  ];
}

type MarketRow = { symbol: string; mark: number; change24hPct: number; volume24hUsd: number; openInterestUsd: number; maxLeverage: number; fundingAprPct: number };

function marketsTable(list: MarketRow[]): string {
  const rows = [...list]
    .sort((x, y) => y.volume24hUsd - x.volume24hUsd)
    .slice(0, 60)
    .map(
      (s) => `<tr>
        <td><div class="cell-identity">${markForSymbol(s.symbol)}<b>${esc(s.symbol.split(":").pop() ?? s.symbol)}</b></div></td>
        <td class="cell-value">${px(s.mark)}</td>
        <td class="cell-value ${changeClass(s.change24hPct)}">${signed(s.change24hPct, 2)}%</td>
        <td class="cell-muted">${compact(s.volume24hUsd)}</td>
        <td class="cell-muted">${compact(s.openInterestUsd)}</td>
        <td class="cell-muted">${s.maxLeverage}x</td>
        <td class="cell-value ${changeClass(-s.fundingAprPct)}">${signed(s.fundingAprPct, 0)}%</td>
        <td><button type="button" class="link-btn" data-add-leg="${esc(s.symbol)}" data-dir="long">+Long</button>
            <button type="button" class="link-btn" data-add-leg="${esc(s.symbol)}" data-dir="short">+Short</button></td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Market</th><th>Mark</th><th>24h</th><th>Volume</th><th>Open interest</th><th>Max lev</th><th>Funding a year</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div><p class="agent__note">Top 60 markets by 24h volume.</p>`;
}

function depthRows(depth: Record<string, number>): string {
  const peak = Math.max(...Object.values(depth), 1);
  return [10, 25, 50]
    .map((bps) => {
      const bid = depth[`bidUsdWithin${bps}Bps`];
      const ask = depth[`askUsdWithin${bps}Bps`];
      return `<div class="depth-row"><span>${bps} bps</span>
        <div class="depth-cell"><div class="depth-bar depth-bar--bid" style="width:${(bid / peak) * 100}%"></div><span>${compact(bid)}</span></div>
        <div class="depth-cell"><div class="depth-bar depth-bar--ask" style="width:${(ask / peak) * 100}%"></div><span>${compact(ask)}</span></div>
      </div>`;
    })
    .join("");
}

function bps(value: unknown): string {
  return typeof value === "number" ? `${value.toFixed(1)} bps` : "book too thin";
}

type Any = Record<string, any>;

function renderResult(tool: string, r: Any): string {
  switch (tool) {
    case "list_markets":
      return marketsTable(r as unknown as MarketRow[]);
    case "market_snapshot":
      return stats(snapshotRows(r as MarketSnapshot));
    case "funding_history":
      return stats([
        ["Now", `${signed(r.summary.nowAprPct, 0)}% APR`, changeClass(r.summary.nowAprPct)],
        ["Average", `${signed(r.summary.meanAprPct, 1)}% APR`, changeClass(r.summary.meanAprPct)],
        ["Median", `${signed(r.summary.medianAprPct, 1)}% APR`],
        ["Longs pay", `${(r.summary.positiveShare * 100).toFixed(0)}% of the time`],
        ["Samples", String(r.summary.samples)],
        ["Interval", `${Math.round(r.intervalSec / 60)} min`],
      ]);
    case "price_stats":
      return stats([
        ["Return", `${signed(r.returnPct, 2)}%`, changeClass(r.returnPct)],
        ["High", px(r.highPrice)],
        ["Low", px(r.lowPrice)],
        ["Volatility", `${r.annualizedVolPct.toFixed(0)}% annual`],
        ["Max drawdown", `${r.maxDrawdownPct.toFixed(1)}%`, "change-down"],
        ["Candles", String(r.candles)],
      ]);
    case "order_book":
      return `${stats([
        ["Mid", px(r.mid)],
        ["Spread", `${r.spreadBps.toFixed(1)} bps`],
        ["Buy slippage", bps(r.buySlippageBps)],
        ["Sell slippage", bps(r.sellSlippageBps)],
      ])}<div class="depth-row"><span></span><span>Bids</span><span>Asks</span></div>${depthRows(r.depth)}<p class="agent__note">Counts the top 100 price levels on each side.</p>`;
    case "compare_pair":
      return `${stats([
        ["Correlation", r.correlation.toFixed(2)],
        ["Beta", r.beta.toFixed(2)],
        ["Ratio z-score", signed(r.ratioZScore, 2)],
        ["Ratio volatility", `${r.ratioVolAnnualPct.toFixed(0)}% annual`],
        ["Funding carry", `${signed(r.carryAprPct, 1)}% APR`, changeClass(r.carryAprPct)],
        ["Round trip fees", `${r.roundTripFeeBps.toFixed(1)} bps`],
        ["Break even", r.breakEvenDays === null ? "no carry" : `${r.breakEvenDays.toFixed(1)} days`],
      ])}<p class="tool-card__verdict">${esc(pairVerdict(r as any))}</p>`;
    default:
      return `<pre>${esc(JSON.stringify(r, null, 2))}</pre>`;
  }
}

export function describeArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([key]) => key !== "strategy")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

export function renderOutcome(outcome: ToolOutcome): string {
  const body = outcome.ok
    ? renderResult(outcome.tool, outcome.result as Any)
    : `<p class="tool-card__error">${esc(outcome.error)}</p>`;
  return `<div class="tool-card__head"><span class="tool-card__name">${esc(outcome.tool)}</span>
    <span>${esc(describeArgs(outcome.args))}</span><span class="tool-card__ms">${outcome.ms} ms</span></div>${body}`;
}

export { usd };
