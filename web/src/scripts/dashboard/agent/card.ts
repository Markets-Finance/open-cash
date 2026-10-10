import { binFromCard, cardMaxLossUsd, closeBin, maxOrderNotionalUsd, openBin, sizeBin, type StrategyCard, type StrategyLeg, type StrategyPreview } from "shared";
import type { BotMode } from "shared";
import { agentExchange } from "../../hlSession";
import { errorText, esc, markForSymbol, px, query, say, usd } from "../dom";
import { addBotFromCard } from "../bots";
import { initHome } from "../home";
import { getDesk } from "../desk";
import { guardOrThrow } from "../guardrails";
import { getMarketData, getPositions } from "../market";
import { requireTrader } from "../state";
import { run } from "./session";

const previewDelayMs = 400;

let card: StrategyCard | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let previewToken = 0;

function elements() {
  return {
    empty: query("[data-card-empty]"),
    body: query("[data-card-body]"),
    name: query<HTMLInputElement>("[data-card-name]"),
    margin: query<HTMLInputElement>("[data-card-margin]"),
    stop: query<HTMLInputElement>("[data-card-stop]"),
    tp: query<HTMLInputElement>("[data-card-tp]"),
    legs: query("[data-card-legs]"),
    preview: query("[data-card-preview]"),
    approve: query<HTMLButtonElement>("[data-card-approve]"),
    status: query("[data-card-status]"),
  };
}

function legRow(leg: StrategyLeg, index: number): string {
  return `<div class="leg-edit" data-leg="${index}">
    <input data-f="symbol" value="${esc(leg.symbol)}" aria-label="Market" />
    <select data-f="direction" aria-label="Direction">
      <option value="long"${leg.direction === "long" ? " selected" : ""}>Long</option>
      <option value="short"${leg.direction === "short" ? " selected" : ""}>Short</option>
    </select>
    <input data-f="weight" type="number" min="0" max="100" value="${leg.weightBps / 100}" aria-label="Weight percent" />
    <input data-f="leverage" type="number" min="1" step="0.5" value="${leg.leverage}" aria-label="Leverage" />
    <button type="button" class="leg-edit__remove" data-remove="${index}" aria-label="Remove leg">×</button>
  </div>`;
}

function renderPreview(preview: StrategyPreview) {
  const ui = elements();
  const issues = preview.issues
    .map((i) => `<div class="issue issue--${i.severity}">${esc(i.message)}</div>`)
    .join("");
  const legs = preview.legs
    .map(
      (leg) => `<div class="leg-preview"><span>${markForSymbol(leg.symbol)} ${leg.direction === "long" ? "Long" : "Short"} ${esc(leg.symbol)} ${leg.leverage}x · ${usd(leg.notionalUsd)}</span>
        <span>liq ${px(leg.liquidationPrice)} (${leg.liquidationDistancePct.toFixed(0)}%)${leg.slippageBps === null ? "" : ` · slip ${leg.slippageBps.toFixed(1)} bps`}</span></div>`,
    )
    .join("");
  ui.preview.innerHTML = `<div class="stat-grid">
      <div class="stat"><span class="stat__label">Notional</span><span class="stat__value">${usd(preview.notionalUsd)}</span></div>
      <div class="stat"><span class="stat__label">Entry fees</span><span class="stat__value">${usd(preview.entryFeesUsd)}</span></div>
      <div class="stat"><span class="stat__label">Max loss at stop</span><span class="stat__value change-down">${usd(preview.maxLossAtStopUsd)}</span></div>
    </div>${legs}${issues}`;
  ui.approve.disabled = preview.issues.some((i) => i.severity === "error") || preview.legs.length === 0;
}

async function refreshPreview() {
  if (!card) return;
  const ui = elements();
  const token = (previewToken += 1);
  ui.approve.disabled = true;
  const outcome = await run("preview_strategy", { strategy: card });
  if (token !== previewToken) return;
  if (!outcome.ok) {
    ui.preview.innerHTML = `<div class="issue issue--error">${esc(outcome.error)}</div>`;
    return;
  }
  renderPreview(outcome.result as StrategyPreview);
}

function schedulePreview() {
  clearTimeout(timer);
  timer = setTimeout(() => void refreshPreview(), previewDelayMs);
}

function coinName(value: string): string {
  const [first, second] = value.trim().split(":");
  return second === undefined ? first.toUpperCase() : `${first.toLowerCase()}:${second.toUpperCase()}`;
}

function readFields() {
  if (!card) return;
  const ui = elements();
  card.name = ui.name.value;
  card.marginUsd = Number(ui.margin.value) || 0;
  card.stopLossPct = Number(ui.stop.value) || 0;
  card.takeProfitPct = Number(ui.tp.value) > 0 ? Number(ui.tp.value) : undefined;
  delete card.signal;
  ui.legs.querySelectorAll<HTMLElement>("[data-leg]").forEach((row) => {
    const leg = card!.legs[Number(row.dataset.leg)];
    if (!leg) return;
    leg.symbol = coinName(query<HTMLInputElement>("[data-f=symbol]", row).value);
    leg.direction = query<HTMLSelectElement>("[data-f=direction]", row).value as "long" | "short";
    leg.weightBps = Math.round((Number(query<HTMLInputElement>("[data-f=weight]", row).value) || 0) * 100);
    leg.leverage = Number(query<HTMLInputElement>("[data-f=leverage]", row).value) || 1;
  });
}

export function setCard(next: StrategyCard) {
  card = next;
  const ui = elements();
  ui.empty.hidden = true;
  ui.body.hidden = false;
  ui.name.value = next.name;
  ui.margin.value = String(next.marginUsd);
  ui.stop.value = String(next.stopLossPct);
  ui.tp.value = next.takeProfitPct === undefined ? "" : String(next.takeProfitPct);
  ui.legs.innerHTML = `<div class="leg-head"><span>Market</span><span>Side</span><span>Weight %</span><span>Lev</span><span></span></div>${next.legs.map(legRow).join("")}`;
  say(ui.status, "");
  schedulePreview();
}

export function addLeg(symbol: string, direction: "long" | "short") {
  if (!card) {
    setCard({
      name: `${direction === "long" ? "L" : "S"} ${symbol}`,
      thesis: "",
      kind: "directional",
      marginUsd: 100,
      stopLossPct: 8,
      legs: [{ symbol, direction, weightBps: 10000, leverage: 2 }],
    });
    return;
  }
  readFields();
  card.legs.push({ symbol, direction, weightBps: 0, leverage: card.legs[0]?.leverage ?? 2 });
  const share = Math.floor(10000 / card.legs.length);
  card.legs.forEach((leg, i) => {
    leg.weightBps = i === card!.legs.length - 1 ? 10000 - share * (card!.legs.length - 1) : share;
  });
  card.kind = new Set(card.legs.map((l) => l.direction)).size > 1 ? "pair" : "basket";
  setCard(card);
}

async function approve() {
  if (!card) return;
  readFields();
  const ui = elements();
  ui.approve.disabled = true;
  try {
    const data = await getMarketData();
    const { sized, issues } = sizeBin(binFromCard(card), card.marginUsd, data.markets);
    if (sized.legs.length === 0) {
      say(ui.status, issues.map((i) => i.detail).join(" · ") || "No leg could be sized.", "error");
      return;
    }
    say(ui.status, "Waiting for your passkey…");
    await guardOrThrow(cardMaxLossUsd(card));
    const exchange = await agentExchange(requireTrader());
    say(ui.status, "Opening every leg…");
    const results = await openBin(exchange, sized, data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
    const failed = results.filter((r) => r.error !== null);
    if (failed.length > 0) {
      const filled = results.filter((r) => r.error === null);
      if (filled.length > 0) {
        const positions = (await getDesk(true)).positions.filter((p) => filled.some((r) => r.symbol === p.coin));
        await closeBin(exchange, positions, data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
      }
      say(ui.status, `Not opened: ${failed.map((r) => `${r.symbol} ${r.error}`).join(" · ")}. Any leg that filled was closed.`, "error");
      return;
    }
    say(ui.status, `${card.name} is open.`);
    await getPositions(true);
    void initHome();
  } catch (error) {
    say(ui.status, errorText(error), "error");
  } finally {
    ui.approve.disabled = false;
  }
}

export function initCard() {
  const ui = elements();
  const onEdit = () => {
    readFields();
    schedulePreview();
  };
  [ui.name, ui.margin, ui.stop, ui.tp].forEach((input) => input.addEventListener("input", onEdit));
  ui.legs.addEventListener("input", onEdit);
  ui.legs.addEventListener("click", (event) => {
    const remove = (event.target as HTMLElement).closest<HTMLElement>("[data-remove]");
    if (!remove || !card) return;
    readFields();
    card.legs.splice(Number(remove.dataset.remove), 1);
    setCard(card);
  });
  query<HTMLButtonElement>("[data-card-add]").addEventListener("click", () => {
    if (!card) return;
    readFields();
    card.legs.push({ symbol: "BTC", direction: "long", weightBps: 0, leverage: card.legs[0]?.leverage ?? 2 });
    setCard(card);
  });
  ui.approve.addEventListener("click", () => void approve());
  query<HTMLButtonElement>("[data-card-bot]").addEventListener("click", async () => {
    if (!card) return;
    readFields();
    const mode = query<HTMLSelectElement>("[data-card-mode]").value as BotMode;
    try {
      await addBotFromCard(structuredClone(card), mode);
      say(ui.status, "Bot added under Your bots. Press Start there to run it.");
    } catch (error) {
      say(ui.status, errorText(error), "error");
    }
  });
}
