import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  closeFloor,
  floorDigest,
  floorId,
  floorMessage,
  floorStatus,
  getSpotBalances,
  maxOrderNotionalUsd,
  moveUsd,
  openFloor,
  rearmFloor,
  type FloorPlan,
  type FloorRecord,
  type FloorStatus,
  type TradingAccount,
} from "shared";
import { backendUrl } from "./config";
import { guardOrThrow } from "./guardrails";
import { agentExchange, hlNetwork, info, mainExchange } from "./hl";
import { loadMarkets } from "./market";

const options = { maxNotionalUsd: maxOrderNotionalUsd };
const keyFor = (owner: string) => `opencash.floors.${hlNetwork}.${owner.toLowerCase()}`;

async function cachedRecords(owner: string): Promise<FloorRecord[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(keyFor(owner))) ?? "[]") as FloorRecord[];
  } catch {
    return [];
  }
}

const cacheRecords = (owner: string, records: FloorRecord[]) => AsyncStorage.setItem(keyFor(owner), JSON.stringify(records));

export async function loadFloorRecords(owner: string): Promise<FloorRecord[]> {
  try {
    const response = await fetch(`${backendUrl}/floors?owner=${owner}&network=${hlNetwork}`);
    if (!response.ok) throw new Error(String(response.status));
    const { records } = (await response.json()) as { records: (FloorRecord & { id?: string; savedAt?: number })[] };
    const clean = records.map(({ id: _id, savedAt: _savedAt, ...record }) => record as FloorRecord);
    await cacheRecords(owner, clean);
    return clean;
  } catch {
    return cachedRecords(owner);
  }
}

async function signedPost(trader: TradingAccount, path: string, action: "add" | "remove" | "replace", subject: string, extra: Record<string, unknown> = {}) {
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: floorMessage(trader.address, hlNetwork, action, subject, issuedAt) });
  const response = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: trader.address, network: hlNetwork, issuedAt, signature, ...extra }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Floor store ${response.status}`);
  }
}

async function addRecord(trader: TradingAccount, record: FloorRecord) {
  await cacheRecords(trader.address, [...(await cachedRecords(trader.address)), record]);
  await signedPost(trader, "/floors", "add", floorDigest(record), { record });
}

async function removeRecord(trader: TradingAccount, record: FloorRecord) {
  await cacheRecords(trader.address, (await cachedRecords(trader.address)).filter((r) => floorId(r) !== floorId(record)));
  await signedPost(trader, `/floors/${encodeURIComponent(floorId(record))}/remove`, "remove", floorId(record));
}

async function replaceRecord(trader: TradingAccount, old: FloorRecord, next: FloorRecord) {
  await cacheRecords(trader.address, (await cachedRecords(trader.address)).map((r) => (floorId(r) === floorId(old) ? next : r)));
  await signedPost(trader, `/floors/${encodeURIComponent(floorId(old))}/replace`, "replace", `${floorId(old)}>${floorDigest(next)}`, { record: next });
}

export async function openProtected(trader: TradingAccount, plan: FloorPlan, floorUsd: number, sleeveUsd: number): Promise<FloorRecord> {
  await guardOrThrow(trader.address, sleeveUsd);
  const spot = await getSpotBalances(info, trader.address);
  const have = spot.find((b) => b.coin === "USDC")?.available ?? 0;
  if (have < floorUsd) await moveUsd(mainExchange(trader), Math.ceil((floorUsd - have) * 100) / 100, false);
  const record = await openFloor(await agentExchange(trader), info, trader.address, plan, options);
  await addRecord(trader, record);
  return record;
}

export async function loadFloorStatuses(trader: TradingAccount): Promise<FloorStatus[]> {
  const records = await loadFloorRecords(trader.address);
  if (records.length === 0) return [];
  const { markets } = await loadMarkets(true);
  return floorStatus(info, trader.address, records, [...markets.values()]);
}

export async function closeProtected(trader: TradingAccount, status: FloorStatus): Promise<void> {
  const { markets } = await loadMarkets(true);
  const closed = await closeFloor(await agentExchange(trader), info, trader.address, status.record, [...markets.values()], status.floorValueUsd, options);
  await removeRecord(trader, status.record);
  if (closed.floorWithdrawnUsd > 0) await moveUsd(mainExchange(trader), Math.floor(closed.floorWithdrawnUsd * 100) / 100, true);
}

export async function rearmProtected(trader: TradingAccount, status: FloorStatus): Promise<void> {
  const { markets } = await loadMarkets(true);
  const market = markets.get(status.record.coin);
  if (!market) throw new Error(`${status.record.coin} is not listed.`);
  const sleeve = status.record.sleeveUsd < status.record.floorUsd ? status.record.sleeveUsd : status.record.floorUsd / 2;
  const next = await rearmFloor(await agentExchange(trader), mainExchange(trader), info, trader.address, status.record, market, sleeve, options);
  await replaceRecord(trader, status.record, next);
}
