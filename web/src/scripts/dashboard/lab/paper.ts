import * as templates from "shared";
import { errorText, esc, markForSymbol, px, query, usd } from "../dom";
import { requireTrader } from "../state";
import { equityChart } from "./chart";
import { loadSeries, simOptions, type Series } from "./data";
import { ago, money, pct, tone } from "./format";
import { meta } from "./meta";

const refreshMs = 60_000;
let bots: templates.PaperBot[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

function storageKey(): string {
  return `opencash.paper.${requireTrader().address.toLowerCase()}`;
}

function load(): templates.PaperBot[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) ?? "[]") as templates.PaperBot[];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(bots));
  } catch {
    return;
  }
}

function fillsTable(fills: templates.Fill[], m: templates.SimMetrics): string {
  const rows = fills
    .slice(-60)
    .reverse()
    .map(
      (f) => `<tr><td>${new Date(f.time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td class="${f.qtyDelta > 0 ? "change-up" : "change-down"}">${f.qtyDelta > 0 ? "Buy" : "Sell"}</td><td>${px(f.price)}</td><td>${usd(Math.abs(f.qtyDelta * f.price))}</td><td>${usd(f.feeUsd)}</td><td>${f.reason}</td></tr>`,
    )
    .join("");
  return `<details class="pbot__details"><summary>All data · ${fills.length} fills</summary>
    <div class="pbot__stats pbot__stats--full">
      <span><small>Fees</small>${usd(m.feesUsd)}</span>
      <span><small>Funding</small>${usd(m.fundingUsd)}</span>
      <span><small>Winning exits</small>${m.winRatePct === null ? "—" : `${m.winRatePct.toFixed(0)}%`}</span>
      <span><small>In market</small>${m.exposurePct.toFixed(0)}%</span>
      <span><small>Just holding</small>${pct(m.holdReturnPct)}</span>
    </div>
    ${fills.length === 0 ? `<p class="lab__empty">No fills yet.</p>` : `<div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Side</th><th>Price</th><th>Size</th><th>Fee</th><th>Type</th></tr></thead><tbody>${rows}</tbody></table></div>`}
  </details>`;
}

async function card(bot: templates.PaperBot): Promise<string> {
  const info = meta[bot.templateId];
  let body = `<p class="lab__empty">Loading prices.</p>`;
  try {
    const series = await loadSeries(bot.symbol, bot.resolution);
    const result = templates.runPaper(bot, series.candles, simOptions(series, bot.allocationUsd));
    const m = result.metrics;
    body =
      result.candles === 0
        ? `<p class="lab__empty">Waiting for the next candle. It acts when that candle closes.</p>`
        : `<div class="pbot__big pbot__big--${tone(m.returnPct)}">${pct(m.returnPct, 2)}</div>
          ${equityChart(result, bot.allocationUsd, bot.id, false)}
          <div class="pbot__stats">
            <span><small>Net</small>${money(m.netPnlUsd)}</span>
            <span><small>Exits</small>${m.closingFills}</span>
            <span><small>Worst dip</small>${m.maxDrawdownPct.toFixed(1)}%</span>
            <span><small>Running</small>${ago(Date.now() - bot.startedAt)}</span>
          </div>
          ${fillsTable(result.fills, m)}`;
  } catch (error) {
    body = `<p class="lab__empty">${esc(error instanceof Error ? error.message : String(error))}</p>`;
  }
  return `<div class="pbot tile tile--${info.tint}" data-paper="${esc(bot.id)}">
    <div class="pbot__head">
      <span class="asset-row--link pbot__asset" data-open-asset="${esc(bot.symbol)}" tabindex="0" title="Trade ${esc(bot.symbol)}">${markForSymbol(bot.symbol)}<span class="pbot__name">${esc(bot.name)} ↗</span></span>
      <span class="pill">Paper</span>
      <span class="pbot__cap">Cap $${bot.allocationUsd}</span>
      <span class="bot__spacer"></span>
      <button type="button" class="link-btn" data-paper-delete>Delete</button>
    </div>
    ${body}
  </div>`;
}

export async function paintPapers() {
  const host = query("[data-paper-list]");
  const open = new Set(Array.from(host.querySelectorAll<HTMLElement>("[data-paper]")).filter((el) => el.querySelector("details[open]")).map((el) => el.dataset.paper));
  host.innerHTML = (await Promise.all(bots.map(card))).join("");
  host.querySelectorAll<HTMLElement>("[data-paper]").forEach((el) => {
    if (open.has(el.dataset.paper)) el.querySelector("details")?.setAttribute("open", "");
  });
  host.closest<HTMLElement>(".agent__bots")!.toggleAttribute("data-has-paper", bots.length > 0);
}

export async function addPaperBot(template: templates.Template, params: templates.Params, series: Series, allocationUsd: number) {
  const bot = templates.paperFromBot(`${template.name} · ${series.market.name}`, template.id, series.market.name, series.resolution, params, allocationUsd, Date.now());
  bots = [bot, ...bots];
  save();
  await paintPapers();
}

function paperFailed(error: unknown) {
  query("[data-paper-list]").innerHTML = `<p class="empty">Paper bots could not load: ${esc(errorText(error))}. Retrying shortly.</p>`;
}

export function initPaper() {
  bots = load();
  void paintPapers().catch(paperFailed);
  clearInterval(timer);
  timer = setInterval(() => {
    if (!document.hidden && bots.length > 0) void paintPapers().catch(paperFailed);
  }, refreshMs);
  query("[data-paper-list]").addEventListener("click", async (event) => {
    const root = (event.target as HTMLElement).closest<HTMLElement>("[data-paper]");
    if (!root || !(event.target as HTMLElement).closest("[data-paper-delete]")) return;
    bots = bots.filter((bot) => bot.id !== root.dataset.paper);
    save();
    await paintPapers();
  });
}
