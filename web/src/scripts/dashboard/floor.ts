import {
  closeFloor,
  floorDigest,
  floorId,
  floorMessage,
  floorStatus,
  getSpotBalances,
  maxOrderNotionalUsd,
  maxSleeveLeverage,
  moveUsd,
  openFloor,
  previewFloor,
  rearmFloor,
  type FloorRecord,
  type FloorStatus,
} from "shared";
import { hlNetwork, info } from "../hl";
import { agentExchange, mainExchange } from "../hlSession";
import { changeClass, errorText, markForSymbol, px, query, say, usd } from "./dom";
import { getMarketData, displaySymbol } from "./market";
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

export function initFloorCard(current: () => { symbol: string; isLong: boolean }) {
  const amountEl = query<HTMLInputElement>("[data-floor-amount]");
  const levEl = query<HTMLInputElement>("[data-floor-lev]");
  const levLabel = query("[data-floor-lev-label]");
  const pctRow = query("[data-floor-pcts]");
  const previewEl = query("[data-floor-preview]");
  const openBtn = query<HTMLButtonElement>("[data-floor-open]");
  const statusEl = query("[data-floor-status]");
  let floorPct = 0.8;

  levEl.max = String(maxSleeveLeverage);
  pctRow.innerHTML = floorChoices
    .map((value) => `<button type="button" class="chip${value === floorPct ? " chip--active" : ""}" data-floor-pct="${value}">${Math.round(value * 100)}% floor</button>`)
    .join("");

  async function paint() {
    levLabel.textContent = `${levEl.value}x`;
    const amount = Number(amountEl.value);
    const { symbol, isLong } = current();
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
        ["Lent as your floor", usd(preview.floorUsd)],
        ["Traded", `${usd(preview.sleeveUsd)} at ${levEl.value}x`],
        ["Position size", usd(preview.notionalUsd)],
        ["Most you can lose", usd(preview.maxLossUsd)],
        ["Trade is closed at", px(preview.knockOutPx)],
      ]
        .map(([label, value]) => `<div class="cost__row"><span>${label}</span><b>${value}</b></div>`)
        .join("");
      if (preview.notionalUsd < 10) {
        previewEl.insertAdjacentHTML("beforeend", `<p class="cost__warn">The traded position is below the $10 minimum. Raise the amount or the leverage.</p>`);
        return;
      }
      if (preview.notionalUsd > maxOrderNotionalUsd) {
        previewEl.insertAdjacentHTML("beforeend", `<p class="cost__warn">The traded position is above the ${usd(maxOrderNotionalUsd)} testnet cap. Lower the amount or the leverage.</p>`);
        return;
      }
      openBtn.disabled = false;
    } catch (error) {
      previewEl.innerHTML = `<p class="cost__warn">${errorText(error)}</p>`;
    }
  }

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
    const { symbol, isLong } = current();
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
      const record = await openFloor(agent, info, trader.address, plan, options);
      await addRecord(record);
      say(statusEl, `${isLong ? "Long" : "Short"} ${displaySymbol(symbol)} is open with ${usd(record.floorUsd)} held as the floor.`);
      amountEl.value = "";
      document.dispatchEvent(new CustomEvent("floor:changed"));
      void paint();
    } catch (error) {
      say(statusEl, errorText(error), "error");
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

  async function refresh() {
    const records = await loadRecords();
    if (records.length === 0) {
      statuses = [];
      host.className = "empty";
      host.textContent = "No floors yet. Open one from any asset page.";
      return;
    }
    try {
      const { markets } = await getMarketData(true);
      statuses = await floorStatus(info, requireTrader().address, records, [...markets.values()]);
      host.className = "table-wrap";
      host.innerHTML = `<table class="data-table"><thead><tr><th>Market</th><th>Floor</th><th>Trade</th><th>Total</th><th>Closed at</th><th></th></tr></thead><tbody>${statuses
        .map(
          (s, index) => `<tr>
            <td><div class="cell-identity">${markForSymbol(s.record.coin)}${s.record.isLong ? "Long" : "Short"} ${displaySymbol(s.record.coin)} ${s.record.leverage}x</div></td>
            <td class="cell-muted">${usd(s.floorValueUsd)}</td>
            <td class="cell-muted ${changeClass(s.sleeveValueUsd - s.record.sleeveUsd)}">${s.knockedOut ? "closed out" : usd(s.sleeveValueUsd)}</td>
            <td class="cell-value">${usd(s.totalUsd)}</td>
            <td class="cell-muted">${s.knockedOut ? "—" : `${px(s.knockOutPx)} (${(s.distanceToKnockOutPct * 100).toFixed(1)}% away)`}</td>
            <td>${s.knockedOut ? `<button type="button" class="link-btn" data-floor-rearm="${index}">Re-arm</button> ` : ""}<button type="button" class="link-btn" data-floor-close="${index}">Close</button></td>
          </tr>`,
        )
        .join("")}</tbody></table>`;
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
    const status = statuses[Number((closeBtn ?? rearmBtn)!.dataset.floorClose ?? rearmBtn!.dataset.floorRearm)];
    if (!status) return;
    button.disabled = true;
    try {
      const trader = requireTrader();
      const agent = await agentExchange(trader);
      const { markets } = await getMarketData(true);
      const list = [...markets.values()];
      if (closeBtn) {
        say(statusEl, "Closing the trade and taking back the floor…");
        const closed = await closeFloor(agent, info, trader.address, status.record, list, status.floorValueUsd, options);
        await removeRecord(status.record);
        if (closed.floorWithdrawnUsd > 0) {
          say(statusEl, "Floor closed. Moving the floor back to your trading balance…");
          await moveUsd(mainExchange(trader), Math.floor(closed.floorWithdrawnUsd * 100) / 100, true);
        }
        say(statusEl, "Floor closed. The money is back in your trading balance.");
      } else {
        const market = markets.get(status.record.coin);
        if (!market) throw new Error(`${status.record.coin} is not listed.`);
        const sleeve = status.record.sleeveUsd < status.record.floorUsd ? status.record.sleeveUsd : status.record.floorUsd / 2;
        say(statusEl, "Waiting for your passkey…");
        const next = await rearmFloor(agent, mainExchange(trader), info, trader.address, status.record, market, sleeve, options);
        await replaceRecord(status.record, next);
        say(statusEl, `Re-armed with ${usd(next.sleeveUsd)} for the trade. The floor is now ${usd(next.floorUsd)}.`);
      }
      document.dispatchEvent(new CustomEvent("floor:changed"));
    } catch (error) {
      say(statusEl, errorText(error), "error");
      button.disabled = false;
    }
  });

  document.addEventListener("floor:changed", () => void refresh());
  void refresh();
}
