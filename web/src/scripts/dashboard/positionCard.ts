import { cancelOrder, checkTrigger, closeBin, maxOrderNotionalUsd, placeTrigger, triggerKindOf, triggerPriceFor, updateIsolatedMargin, type HlFill, type HlOrder, type HlPosition, type TriggerKind } from "shared";
import { agentExchange } from "../hlSession";
import { changeClass, errorText, esc, px, query, say, usd } from "./dom";
import { getDesk } from "./desk";
import { displaySymbol, getMarketData } from "./market";
import { requireTrader } from "./state";

const closeShares = [0.25, 0.5, 0.75, 1];
const marginSteps = [5, 10, 25];
const triggerPresets: Record<TriggerKind, number[]> = { sl: [5, 10, 20], tp: [5, 10, 25] };

type Hooks = { symbol: () => string; addToPosition: (side: "long" | "short") => void; changed: () => void };

function ago(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}

function stat(label: string, value: string, tone = ""): string {
  return `<div class="stat"><small>${label}</small><b class="${tone}">${value}</b></div>`;
}

type Sheet = "close" | "margin" | "protect" | "grow";

function summary(position: HlPosition, mark: number): string {
  const long = position.size >= 0;
  const roe = position.marginUsed > 0 ? (position.unrealizedPnl / position.marginUsed) * 100 : 0;
  const away = position.liquidationPx === null ? null : (Math.abs(mark - position.liquidationPx) / mark) * 100;
  const sign = position.unrealizedPnl >= 0 ? "+" : "−";
  return `<div class="pos-head">
      <div class="pos-title"><span class="pos-side pos-side--${long ? "long" : "short"}">${long ? "Long" : "Short"} ${position.leverage}x</span><b>${esc(displaySymbol(position.coin))}</b><small>${esc(position.leverageType)} · ${Math.abs(position.size)} · ${usd(Math.abs(position.positionValue))}</small></div>
      <div class="pos-pnl ${changeClass(position.unrealizedPnl)}">${sign}${usd(Math.abs(position.unrealizedPnl))}<small>${roe.toFixed(1)}%</small></div>
    </div>
    <div class="pos-facts">
      ${stat("Entry", px(position.entryPx))}
      ${stat("Now", px(mark))}
      ${stat("Liquidates at", position.liquidationPx === null ? "—" : `${px(position.liquidationPx)}${away === null ? "" : ` · ${away.toFixed(0)}% away`}`, away !== null && away < 8 ? "change-down" : "")}
      ${stat("Margin", usd(position.marginUsed))}
    </div>`;
}

function triggerBlock(kind: TriggerKind, position: HlPosition, mark: number, active: HlOrder[]): string {
  const isLong = position.size >= 0;
  const current = active.filter((o) => triggerKindOf(o) === kind);
  const title = kind === "sl" ? "Stop-loss" : "Take profit";
  const hint = kind === "sl" ? "Closes the trade if the price moves against you." : "Closes the trade and keeps the profit.";
  const direction = kind === "sl" ? (isLong ? "below" : "above") : isLong ? "above" : "below";
  const live = current.map((o) => `<span class="pos-live">${px(o.triggerPx)} <button type="button" class="link-btn" data-cancel-order="${o.oid}">Remove</button></span>`).join("");
  return `<div class="pos-trig" data-trig-row="${kind}">
    <div class="pos-trig__head"><b>${title}</b>${live}</div>
    <small class="quote-line">${hint}</small>
    <div class="chip-row">${triggerPresets[kind].map((pct) => `<button type="button" class="chip" data-trig-preset="${kind}:${pct}">${pct}% ${direction}</button>`).join("")}</div>
    <div class="pos-inline"><input type="number" min="0" step="any" placeholder="Price (now ${px(mark)})" data-trig-price="${kind}" /><button type="button" class="btn" data-trig-set="${kind}">Set</button></div>
    <small class="quote-line" data-trig-note="${kind}"></small>
  </div>`;
}

function sheetHtml(sheet: Sheet, position: HlPosition, mark: number, orders: HlOrder[]): string {
  const long = position.size >= 0;
  if (sheet === "close") {
    return `<div class="pos-sheet"><small class="quote-line">Closes at the market price right now.</small><div class="chip-row">${closeShares.map((x) => `<button type="button" class="chip" data-close-share="${x}">${x === 1 ? "Close all" : `${x * 100}%`}</button>`).join("")}</div></div>`;
  }
  if (sheet === "margin") {
    return `<div class="pos-sheet"><small class="quote-line">Margin is the money backing this trade. Adding more pushes liquidation further away. Taking out brings it closer.</small>
      <div class="chip-row">${marginSteps.map((m) => `<button type="button" class="chip" data-margin-fill="${m}">$${m}</button>`).join("")}</div>
      <div class="pos-inline"><input type="number" min="0" step="any" placeholder="Amount in $" data-margin-amount /><button type="button" class="btn btn--primary" data-margin-add>Add</button><button type="button" class="btn" data-margin-remove>Take out</button></div></div>`;
  }
  if (sheet === "protect") {
    return `<div class="pos-sheet pos-sheet--two">${triggerBlock("sl", position, mark, orders)}${triggerBlock("tp", position, mark, orders)}</div>`;
  }
  return `<div class="pos-sheet"><small class="quote-line">Make the trade bigger, or open the other side to offset it.</small><div class="chip-row"><button type="button" class="chip" data-add-more>Add to this ${long ? "long" : "short"}</button><button type="button" class="chip" data-add-opposite>Hedge with a ${long ? "short" : "long"}</button></div></div>`;
}

function actionsHtml(sheet: Sheet | null, position: HlPosition, mark: number, orders: HlOrder[]): string {
  const tabs: [Sheet, string][] = [["close", "Close"], ["margin", "Margin"], ["protect", "Stop & target"], ["grow", "Add more"]];
  const shown = tabs.filter(([key]) => key !== "margin" || position.leverageType === "isolated");
  return `<div class="pos-tabs">${shown.map(([key, label]) => `<button type="button" class="pos-tab" aria-pressed="${sheet === key}" data-pos-sheet="${key}">${label}</button>`).join("")}</div>${sheet ? sheetHtml(sheet, position, mark, orders) : ""}`;
}

function ordersTable(orders: HlOrder[]): string {
  if (orders.length === 0) return `<p class="empty">No resting orders.</p>`;
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Side</th><th>Size</th><th>Price</th><th>Type</th><th></th></tr></thead><tbody>${orders
    .map(
      (o) =>
        `<tr><td>${o.isBuy ? "Buy" : "Sell"}</td><td class="cell-muted">${o.size}</td><td class="cell-muted">${px(o.isTrigger ? o.triggerPx : o.price)}</td><td class="cell-muted">${o.isTrigger ? (triggerKindOf(o) === "sl" ? "Stop" : triggerKindOf(o) === "tp" ? "Target" : esc(o.orderType)) : esc(o.tif ?? "limit")}${o.reduceOnly ? " · reduce only" : ""}</td><td><button type="button" class="link-btn" data-cancel-order="${o.oid}">Cancel</button></td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function fillsTable(fills: HlFill[]): string {
  if (fills.length === 0) return `<p class="empty">No fills yet.</p>`;
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>What</th><th>Price</th><th>Size</th><th>Fee</th><th style="text-align:right">Result</th></tr></thead><tbody>${fills
    .map(
      (f) =>
        `<tr><td class="cell-muted">${ago(f.time)}</td><td>${esc(f.dir)}</td><td class="cell-muted">${px(f.price)}</td><td class="cell-muted">${f.size}</td><td class="cell-muted">${usd(f.fee)}</td><td class="cell-value ${changeClass(f.closedPnl)}">${f.dir.toLowerCase().startsWith("close") ? `${f.closedPnl >= 0 ? "+" : "−"}${usd(Math.abs(f.closedPnl))}` : "—"}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

export function initPositionCard(hooks: Hooks) {
  const card = query("[data-position-card]");
  const stats = query("[data-position-stats]");
  const tools = query("[data-position-tools]");
  const statusEl = query("[data-position-status]");
  const ordersEl = query("[data-position-orders]");
  const fillsEl = query("[data-position-fills]");
  let current: HlPosition | null = null;
  let currentMark = 0;
  let busy = false;
  let sheet: Sheet | null = null;
  let toolsKey = "";

  async function paint() {
    const coin = hooks.symbol();
    const [desk, { markets }] = await Promise.all([getDesk(), getMarketData()]);
    const market = markets.get(coin);
    const position = desk.positions.find((p) => p.coin === coin) ?? null;
    const orders = desk.orders.filter((o) => o.coin === coin);
    const fills = desk.fills.filter((f) => f.coin === coin).slice(0, 6);
    current = position;
    currentMark = market?.markPx ?? 0;
    card.hidden = !position && orders.length === 0 && fills.length === 0;
    if (card.hidden || !market) return;
    stats.innerHTML = position ? summary(position, market.markPx) : `<p class="empty">No open position in ${esc(displaySymbol(coin))}.</p>`;
    const key = position ? JSON.stringify([coin, sheet, position.size, position.leverageType, orders.map((o) => o.oid)]) : "";
    if (key !== toolsKey) {
      toolsKey = key;
      tools.innerHTML = position ? actionsHtml(sheet, position, market.markPx, orders) : "";
    }
    ordersEl.innerHTML = ordersTable(orders);
    fillsEl.innerHTML = fillsTable(fills);
  }

  async function act(label: string, run: () => Promise<void>) {
    if (busy) return;
    busy = true;
    say(statusEl, label);
    try {
      await run();
      await getDesk(true);
      hooks.changed();
      await paint();
    } catch (error) {
      say(statusEl, errorText(error), "error");
    } finally {
      busy = false;
    }
  }

  card.addEventListener("input", (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-trig-price]");
    if (!input || !current) return;
    const kind = input.dataset.trigPrice as TriggerKind;
    const note = card.querySelector<HTMLElement>(`[data-trig-note="${kind}"]`)!;
    const price = Number(input.value);
    if (!(price > 0)) {
      note.textContent = "";
      return;
    }
    const check = checkTrigger(current, currentMark, kind, price);
    note.textContent = check.ok ? `If it is hit you ${check.resultUsd >= 0 ? "make" : "lose"} about ${usd(Math.abs(check.resultUsd))} on this position.` : (check.reason ?? "");
    note.dataset.tone = check.ok ? "" : "error";
  });

  card.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const position = current;
    const share = target.closest<HTMLElement>("[data-close-share]");
    const add = target.closest<HTMLElement>("[data-margin-add]");
    const remove = target.closest<HTMLElement>("[data-margin-remove]");
    const cancel = target.closest<HTMLElement>("[data-cancel-order]");
    if (target.closest("[data-add-more]") && position) hooks.addToPosition(position.size >= 0 ? "long" : "short");
    if (target.closest("[data-add-opposite]") && position) hooks.addToPosition(position.size >= 0 ? "short" : "long");
    if (share && position) {
      const fraction = Number(share.dataset.closeShare);
      await act(fraction === 1 ? "Closing the position…" : `Closing ${fraction * 100}% of the position…`, async () => {
        const { markets } = await getMarketData(true);
        const part = fraction === 1 ? position : { ...position, size: position.size * fraction };
        const [result] = await closeBin(await agentExchange(requireTrader()), [part], markets, { maxNotionalUsd: maxOrderNotionalUsd });
        if (result?.error) throw new Error(result.error);
        say(statusEl, fraction === 1 ? "Position closed." : `Closed ${fraction * 100}% of the position.`);
      });
    }
    const pick = target.closest<HTMLElement>("[data-pos-sheet]");
    if (pick) {
      const next = pick.dataset.posSheet as Sheet;
      sheet = sheet === next ? null : next;
      toolsKey = "";
      await paint();
    }
    const fill = target.closest<HTMLElement>("[data-margin-fill]");
    if (fill) card.querySelector<HTMLInputElement>("[data-margin-amount]")!.value = fill.dataset.marginFill!;
    if ((add || remove) && position) {
      const amount = Number(card.querySelector<HTMLInputElement>("[data-margin-amount]")!.value);
      if (!(amount > 0)) {
        say(statusEl, "Enter how many dollars of margin.", "error");
        return;
      }
      const { markets } = await getMarketData();
      const market = markets.get(position.coin);
      if (!market) return;
      await act(add ? `Adding $${amount} margin…` : `Taking out $${amount} margin…`, async () => {
        await updateIsolatedMargin(await agentExchange(requireTrader()), market.assetId, position.size >= 0, add ? amount : -amount);
        say(statusEl, add ? `Added $${amount} margin. Liquidation moved further away.` : `Took out $${amount} margin.`);
      });
    }
    const preset = target.closest<HTMLElement>("[data-trig-preset]");
    if (preset && position) {
      const [kind, pct] = preset.dataset.trigPreset!.split(":") as [TriggerKind, string];
      const input = card.querySelector<HTMLInputElement>(`[data-trig-price="${kind}"]`)!;
      input.value = String(Number(triggerPriceFor(currentMark, position.size >= 0, kind, Number(pct)).toPrecision(6)));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const setTrigger = target.closest<HTMLElement>("[data-trig-set]");
    if (setTrigger && position) {
      const kind = setTrigger.dataset.trigSet as TriggerKind;
      const price = Number(card.querySelector<HTMLInputElement>(`[data-trig-price="${kind}"]`)!.value);
      const { markets } = await getMarketData(true);
      const market = markets.get(position.coin);
      if (!market) return;
      await act(kind === "sl" ? "Placing the stop…" : "Placing the target…", async () => {
        const exchange = await agentExchange(requireTrader());
        const existing = (await getDesk(true)).orders.filter((o) => o.coin === position.coin && triggerKindOf(o) === kind);
        await placeTrigger(exchange, { assetId: market.assetId, szDecimals: market.szDecimals, position, markPx: market.markPx, kind, triggerPx: price, maxNotionalUsd: maxOrderNotionalUsd });
        for (const old of existing) await cancelOrder(exchange, market.assetId, old.oid);
        say(statusEl, kind === "sl" ? `Stop set at ${px(price)}. It closes the whole position if the price gets there.` : `Target set at ${px(price)}. It closes the whole position and takes the profit.`);
      });
    }
    if (cancel) {
      const { markets } = await getMarketData();
      const market = markets.get(hooks.symbol());
      if (!market) return;
      await act("Cancelling the order…", async () => {
        await cancelOrder(await agentExchange(requireTrader()), market.assetId, Number(cancel.dataset.cancelOrder));
        say(statusEl, "Order cancelled.");
      });
    }
  });

  return paint;
}
