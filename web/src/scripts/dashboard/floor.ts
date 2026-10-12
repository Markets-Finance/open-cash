import {
  closeFloorGroup,
  floorDigest,
  floorId,
  floorMessage,
  floorStatus,
  getSpotBalances,
  groupFloors,
  marketKind,
  marketSession,
  weekendCloseAt,
  maxOrderNotionalUsd,
  maxSleeveLeverage,
  moveUsd,
  openFloor,
  openFloorBin,
  previewFloor,
  previewFloorBin,
  rearmFloor,
  type Bin,
  type FloorRecord,
  type FloorStatus,
} from "shared";
import { hlNetwork, info } from "../hl";
import { agentExchange, mainExchange } from "../hlSession";
import { changeClass, errorText, esc, markForSymbol, px, query, say, usd, withFundingHint } from "./dom";
import { getMarketData, displaySymbol } from "./market";
import type { HlMarket } from "shared";
import { guardOrThrow } from "./guardrails";
import { requireTrader } from "./state";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";
const options = { maxNotionalUsd: maxOrderNotionalUsd };
const floorChoices = [0.9, 0.8, 0.7];

function storageKey(): string {
  return `opencash.floors.${hlNetwork}.${requireTrader().address.toLowerCase()}`;
}

function cachedRecords(): FloorRecord[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) ?? "[]") as FloorRecord[];
  } catch {
    return [];
  }
}

function cacheRecords(records: FloorRecord[]) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(records));
  } catch {
    return;
  }
}

async function loadRecords(): Promise<FloorRecord[]> {
  const trader = requireTrader();
  try {
    const response = await fetch(`${backend}/floors?owner=${trader.address}&network=${hlNetwork}`);
    if (!response.ok) throw new Error(String(response.status));
    const { records } = (await response.json()) as { records: (FloorRecord & { id?: string; savedAt?: number })[] };
    const clean = records.map(({ id: _id, savedAt: _savedAt, ...record }) => record as FloorRecord);
    cacheRecords(clean);
    return clean;
  } catch {
    return cachedRecords();
  }
}

async function signedPost(path: string, action: "add" | "remove" | "replace", subject: string, extra: Record<string, unknown> = {}) {
  const trader = requireTrader();
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: floorMessage(trader.address, hlNetwork, action, subject, issuedAt) });
  const response = await fetch(`${backend}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: trader.address, network: hlNetwork, issuedAt, signature, ...extra }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Floor store ${response.status}`);
  }
}

async function addRecord(record: FloorRecord) {
  cacheRecords([...cachedRecords(), record]);
  await signedPost("/floors", "add", floorDigest(record), { record });
}

async function removeRecord(record: FloorRecord) {
  cacheRecords(cachedRecords().filter((r) => floorId(r) !== floorId(record)));
  await signedPost(`/floors/${encodeURIComponent(floorId(record))}/remove`, "remove", floorId(record));
}

async function replaceRecord(old: FloorRecord, next: FloorRecord) {
  cacheRecords(cachedRecords().map((r) => (floorId(r) === floorId(old) ? next : r)));
  await signedPost(`/floors/${encodeURIComponent(floorId(old))}/replace`, "replace", `${floorId(old)}>${floorDigest(next)}`, { record: next });
}

async function ensureSpot(floorUsd: number) {
  const trader = requireTrader();
  const spot = await getSpotBalances(info, trader.address);
  const have = spot.find((b) => b.coin === "USDC")?.available ?? 0;
  if (have < floorUsd) await moveUsd(mainExchange(trader), Math.ceil((floorUsd - have) * 100) / 100, false);
}

function clock(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function until(ms: number): string {
  const minutes = Math.round((ms - Date.now()) / 60_000);
  if (minutes <= 0) return "due now";
  if (minutes < 90) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `in ${hours} h` : `in ${Math.round(hours / 24)} d`;
}

export async function loadFloorStatuses(): Promise<FloorStatus[]> {
  const records = await loadRecords();
  if (records.length === 0) return [];
  const { markets } = await getMarketData(true);
  return floorStatus(info, requireTrader().address, records, [...markets.values()]);
}

export async function openFlooredBin(bin: Bin, markets: Map<string, HlMarket>, amountUsd: number, floorPct: number, leverage: number, timebox: boolean): Promise<FloorRecord[]> {
  const trader = requireTrader();
  const closeAt = timebox ? (weekendCloseAt(bin.legs.map((l) => l.symbol)) ?? undefined) : undefined;
  const plan = { bin, markets, amountUsd, floorPct, sleeveLeverage: leverage, closeAt };
  const preview = previewFloorBin(plan);
  if (preview.blocked) throw new Error(preview.blocked);
  await guardOrThrow(preview.sleeveUsd);
  await ensureSpot(preview.floorUsd);
  const agent = await agentExchange(trader);
  const records = await openFloorBin(agent, info, trader.address, plan, options);
  for (const record of records) await addRecord(record);
  document.dispatchEvent(new CustomEvent("floor:changed"));
  return records;
}

export function binFloorPreview(bin: Bin, markets: Map<string, HlMarket>, amountUsd: number, floorPct: number, leverage: number) {
  return previewFloorBin({ bin, markets, amountUsd, floorPct, sleeveLeverage: leverage });
}

export function binTimebox(bin: Bin): number | null {
  return weekendCloseAt(bin.legs.map((l) => l.symbol));
}

export const floorPercentChoices = floorChoices;

export function initFloorCard(hooks: { current: () => { symbol: string; isLong: boolean }; setSide: (side: "long" | "short") => void }) {
  const amountEl = query<HTMLInputElement>("[data-floor-amount]");
  const levEl = query<HTMLInputElement>("[data-floor-lev]");
  const levLabel = query("[data-floor-lev-label]");
  const pctRow = query("[data-floor-pcts]");
  const previewEl = query("[data-floor-preview]");
  const openBtn = query<HTMLButtonElement>("[data-floor-open]");
  const statusEl = query("[data-floor-status]");
  const timeboxRow = query("[data-floor-timebox-row]");
  const timeboxEl = query<HTMLInputElement>("[data-floor-timebox]");
  const timeboxLabel = query("[data-floor-timebox-label]");
  const sideButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-fside]"));
  let floorPct = 0.8;

  levEl.max = String(maxSleeveLeverage);
  pctRow.innerHTML = floorChoices
    .map((value) => `<button type="button" class="chip${value === floorPct ? " chip--active" : ""}" data-floor-pct="${value}">${Math.round(value * 100)}% floor</button>`)
    .join("");

  function paintTimebox(symbol: string) {
    const session = marketSession(symbol);
    const show = marketKind(symbol) !== "crypto" && session.tradfiOpen === false && session.nextChangeAt !== null;
    timeboxRow.hidden = !show;
    if (show) timeboxLabel.textContent = `Close automatically when the market reopens (${clock((weekendCloseAt([symbol]) ?? session.nextChangeAt!) as number)})`;
    else timeboxEl.checked = false;
  }

  async function paint() {
    levLabel.textContent = `${levEl.value}x`;
    const amount = Number(amountEl.value);
    const { symbol, isLong } = hooks.current();
    sideButtons.forEach((b) => b.classList.toggle("is-on", (b.dataset.fside === "long") === isLong));
    paintTimebox(symbol);
    openBtn.textContent = `${isLong ? "Long" : "Short"} ${displaySymbol(symbol)} with a floor`;
    previewEl.innerHTML = "";
    openBtn.disabled = true;
    if (!(amount > 0)) return;
    try {
      const { markets } = await getMarketData();
      const market = markets.get(symbol);
      if (!market) throw new Error(`${symbol} is not listed.`);
      const preview = previewFloor({ market, amountUsd: amount, floorPct, sleeveLeverage: Number(levEl.value), isLong });
      previewEl.innerHTML = [
        ["You can't end below", usd(preview.floorUsd)],
        ["Traded", `${usd(preview.sleeveUsd)} at ${levEl.value}x`],
        ["Position size", usd(preview.notionalUsd)],
        ["Most you can lose", usd(preview.maxLossUsd)],
        ["Trade is closed at", px(preview.knockOutPx)],
      ]
        .map(([label, value]) => `<div class="cost__row"><span>${label}</span><b>${value}</b></div>`)
        .join("");
      if (preview.notionalUsd < 10) {
        const lev = Number(levEl.value);
        const needLev = [1, 2, 3, 4, 5].find((l) => preview.sleeveUsd * l >= 10);
        const needTotal = Math.ceil(10.05 / (lev * (1 - floorPct)));
        previewEl.insertAdjacentHTML(
          "beforeend",
          `<p class="cost__warn">At ${lev}x this trades ${usd(preview.notionalUsd)}, and the exchange needs at least $10. ${needLev ? `Use ${needLev}x, or commit` : "Commit"} at least ${usd(needTotal)} at ${lev}x with a ${Math.round(floorPct * 100)}% floor.</p>`,
        );
        return;
      }
      openBtn.disabled = false;
    } catch (error) {
      previewEl.innerHTML = `<p class="cost__warn">${errorText(error)}</p>`;
    }
  }

  sideButtons.forEach((button) =>
    button.addEventListener("click", () => {
      hooks.setSide(button.dataset.fside as "long" | "short");
      void paint();
    }),
  );
  pctRow.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-floor-pct]");
    if (!button) return;
    floorPct = Number(button.dataset.floorPct);
    pctRow.querySelectorAll("[data-floor-pct]").forEach((el) => el.classList.toggle("chip--active", el === button));
    void paint();
  });
  amountEl.addEventListener("input", () => void paint());
  levEl.addEventListener("input", () => void paint());
  document.addEventListener("floor:refresh", () => void paint());

  openBtn.addEventListener("click", async () => {
    const { symbol, isLong } = hooks.current();
    openBtn.disabled = true;
    try {
      const trader = requireTrader();
      const { markets } = await getMarketData();
      const market = markets.get(symbol);
      if (!market) throw new Error(`${symbol} is not listed.`);
      const plan = { market, amountUsd: Number(amountEl.value), floorPct, sleeveLeverage: Number(levEl.value), isLong };
      const preview = previewFloor(plan);
      await guardOrThrow(preview.sleeveUsd);
      say(statusEl, "Waiting for your passkey…");
      await ensureSpot(preview.floorUsd);
      const agent = await agentExchange(trader);
      say(statusEl, "Lending the floor and opening the trade…");
      const opened = await openFloor(agent, info, trader.address, plan, options);
      const closeAt = timeboxEl.checked && !timeboxRow.hidden ? (weekendCloseAt([symbol]) ?? undefined) : undefined;
      const record = closeAt ? { ...opened, closeAt } : opened;
      await addRecord(record);
      say(statusEl, `${isLong ? "Long" : "Short"} ${displaySymbol(symbol)} is open. You can't end below ${usd(record.floorUsd)}.${closeAt ? ` It closes by itself ${clock(closeAt)} while this page is open.` : ""}`);
      amountEl.value = "";
      document.dispatchEvent(new CustomEvent("floor:changed"));
      void paint();
    } catch (error) {
      say(statusEl, withFundingHint(hooks.current().symbol, errorText(error)), "error");
    } finally {
      openBtn.disabled = false;
    }
  });
  void paint();
}

export function initFloorList() {
  const host = query("[data-floor-list]");
  const statusEl = query("[data-floor-list-status]");
  let statuses: FloorStatus[] = [];
  let closing = false;

  async function runClose(items: FloorStatus[], reason: string) {
    if (closing) return;
    closing = true;
    try {
      const trader = requireTrader();
      const agent = await agentExchange(trader);
      const { markets } = await getMarketData(true);
      say(statusEl, reason);
      const closed = await closeFloorGroup(agent, info, trader.address, items, [...markets.values()], options);
      for (const item of items) await removeRecord(item.record);
      if (closed.floorWithdrawnUsd > 0) {
        say(statusEl, "Closed. Moving the floor back to your trading balance…");
        await moveUsd(mainExchange(trader), Math.floor(closed.floorWithdrawnUsd * 100) / 100, true);
      }
      say(statusEl, "Closed. The money is back in your trading balance.");
      document.dispatchEvent(new CustomEvent("floor:changed"));
    } catch (error) {
      say(statusEl, errorText(error), "error");
    } finally {
      closing = false;
    }
  }

  async function refresh() {
    const records = await loadRecords();
    if (records.length === 0) {
      statuses = [];
      host.className = "empty";
      host.textContent = "No floors yet. Open one from any asset page or a bin.";
      return;
    }
    try {
      const { markets } = await getMarketData(true);
      statuses = await floorStatus(info, requireTrader().address, records, [...markets.values()]);
      const groups = groupFloors(statuses);
      host.className = "table-wrap";
      host.innerHTML = `<table class="data-table"><thead><tr><th>Position</th><th>Floor</th><th>Trade</th><th>Total</th><th>Closed at</th><th></th></tr></thead><tbody>${groups
        .map((group, gi) => {
          const items = group.items;
          const floorValue = items.reduce((sum, s) => sum + s.floorValueUsd, 0);
          const tradeValue = items.reduce((sum, s) => sum + (s.knockedOut ? 0 : s.sleeveValueUsd), 0);
          const startTrade = items.reduce((sum, s) => sum + s.record.sleeveUsd, 0);
          const out = items.filter((s) => s.knockedOut).length;
          const nearest = items.filter((s) => !s.knockedOut).sort((a, b) => a.distanceToKnockOutPct - b.distanceToKnockOutPct)[0];
          const title = group.binId ? `${group.binId} bin · ${items.length} legs` : `${items[0].record.isLong ? "Long" : "Short"} ${displaySymbol(items[0].record.coin)} ${items[0].record.leverage}x`;
          const timer = group.closeAt ? `<div class="cell-muted">Closes ${until(group.closeAt)} (${clock(group.closeAt)})</div>` : "";
          return `<tr>
            <td><div class="cell-identity">${markForSymbol(items[0].record.coin)}<span class="cell-stack"><b>${esc(title)}</b>${timer}</span></div></td>
            <td class="cell-muted">${usd(floorValue)}</td>
            <td class="cell-muted ${changeClass(tradeValue - startTrade + (out === items.length ? 0 : 0))}">${out === items.length ? "closed out" : usd(tradeValue)}${out > 0 && out < items.length ? ` (${out} closed out)` : ""}</td>
            <td class="cell-value">${usd(floorValue + tradeValue)}</td>
            <td class="cell-muted">${nearest ? `${px(nearest.knockOutPx)} (${(nearest.distanceToKnockOutPct * 100).toFixed(1)}% away)` : "—"}</td>
            <td>${out > 0 && items.length === 1 ? `<button type="button" class="link-btn" data-floor-rearm="${gi}">Re-arm</button> ` : ""}<button type="button" class="link-btn" data-floor-close="${gi}">Close</button></td>
          </tr>`;
        })
        .join("")}</tbody></table>`;
      host.dataset.groups = JSON.stringify(groups.map((g) => g.key));
      const due = groups.find((g) => g.closeAt !== null && g.closeAt <= Date.now());
      if (due) void runClose(due.items, "The timed floor reached its reopen time. Closing…");
    } catch (error) {
      host.className = "empty";
      host.textContent = errorText(error);
    }
  }

  host.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const closeBtn = target.closest<HTMLButtonElement>("[data-floor-close]");
    const rearmBtn = target.closest<HTMLButtonElement>("[data-floor-rearm]");
    const button = closeBtn ?? rearmBtn;
    if (!button) return;
    const groups = groupFloors(statuses);
    const group = groups[Number((closeBtn ?? rearmBtn)!.dataset.floorClose ?? rearmBtn!.dataset.floorRearm)];
    if (!group) return;
    button.disabled = true;
    try {
      if (closeBtn) {
        await runClose(group.items, "Closing the trade and taking back the floor…");
      } else {
        const trader = requireTrader();
        const status = group.items[0];
        const agent = await agentExchange(trader);
        const { markets } = await getMarketData(true);
        const market = markets.get(status.record.coin);
        if (!market) throw new Error(`${status.record.coin} is not listed.`);
        const sleeve = status.record.sleeveUsd < status.record.floorUsd ? status.record.sleeveUsd : status.record.floorUsd / 2;
        say(statusEl, "Waiting for your passkey…");
        const next = await rearmFloor(agent, mainExchange(trader), info, trader.address, status.record, market, sleeve, options);
        await replaceRecord(status.record, { ...next, ...(status.record.closeAt ? { closeAt: status.record.closeAt } : {}) });
        say(statusEl, `Re-armed with ${usd(next.sleeveUsd)} for the trade. The floor is now ${usd(next.floorUsd)}.`);
        document.dispatchEvent(new CustomEvent("floor:changed"));
      }
    } catch (error) {
      say(statusEl, errorText(error), "error");
      button.disabled = false;
    }
  });

  document.addEventListener("floor:changed", () => void refresh());
  setInterval(() => void refresh(), 60_000);
  void refresh();
}
