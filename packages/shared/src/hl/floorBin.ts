import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import type { Bin } from "../bins/types.js";
import { marketSession } from "./session.js";
import { closeFloor, maxSleeveLeverage, openFloor, previewFloor, type FloorOrderOptions, type FloorRecord, type FloorStatus } from "./floor.js";
import type { HlMarket } from "./markets.js";
import { minNotionalUsd } from "./orders.js";

export type FloorBinLegPreview = {
  symbol: string;
  isLong: boolean;
  amountUsd: number;
  floorUsd: number;
  sleeveUsd: number;
  notionalUsd: number;
  knockOutPx: number;
  issue: string | null;
};

export type FloorBinPreview = {
  legs: FloorBinLegPreview[];
  floorUsd: number;
  sleeveUsd: number;
  maxLossUsd: number;
  blocked: string | null;
};

export type FloorBinPlan = {
  bin: Bin;
  markets: Map<string, HlMarket>;
  amountUsd: number;
  floorPct: number;
  sleeveLeverage: number;
  closeAt?: number;
};

export function previewFloorBin(plan: FloorBinPlan): FloorBinPreview {
  const legs = plan.bin.legs.map((leg): FloorBinLegPreview => {
    const amountUsd = (plan.amountUsd * leg.weightBps) / 10_000;
    const isLong = leg.direction === "long";
    const market = plan.markets.get(leg.symbol);
    if (!market) return { symbol: leg.symbol, isLong, amountUsd, floorUsd: 0, sleeveUsd: 0, notionalUsd: 0, knockOutPx: 0, issue: `${leg.symbol} is not listed here.` };
    try {
      const preview = previewFloor({ market, amountUsd, floorPct: plan.floorPct, sleeveLeverage: Math.min(plan.sleeveLeverage, maxSleeveLeverage), isLong });
      const issue = preview.notionalUsd < minNotionalUsd ? `${leg.symbol} would trade $${preview.notionalUsd.toFixed(2)}, below the $${minNotionalUsd} minimum.` : null;
      return { symbol: leg.symbol, isLong, amountUsd, floorUsd: preview.floorUsd, sleeveUsd: preview.sleeveUsd, notionalUsd: preview.notionalUsd, knockOutPx: preview.knockOutPx, issue };
    } catch (error) {
      return { symbol: leg.symbol, isLong, amountUsd, floorUsd: 0, sleeveUsd: 0, notionalUsd: 0, knockOutPx: 0, issue: error instanceof Error ? error.message : String(error) };
    }
  });
  const blocked = legs.find((l) => l.issue)?.issue ?? null;
  const floorUsd = legs.reduce((sum, l) => sum + l.floorUsd, 0);
  const sleeveUsd = legs.reduce((sum, l) => sum + l.sleeveUsd, 0);
  return { legs, floorUsd, sleeveUsd, maxLossUsd: sleeveUsd, blocked };
}

export function newGroupId(binId: string, now: number): string {
  return `${binId}@${now}`;
}

export async function openFloorBin(
  agent: ExchangeClient,
  info: InfoClient,
  user: `0x${string}`,
  plan: FloorBinPlan,
  options: FloorOrderOptions,
  now: number = Date.now(),
): Promise<FloorRecord[]> {
  const preview = previewFloorBin(plan);
  if (preview.blocked) throw new Error(preview.blocked);
  const groupId = newGroupId(plan.bin.id, now);
  const opened: FloorRecord[] = [];
  try {
    for (const leg of plan.bin.legs) {
      const market = plan.markets.get(leg.symbol)!;
      const record = await openFloor(
        agent,
        info,
        user,
        { market, amountUsd: (plan.amountUsd * leg.weightBps) / 10_000, floorPct: plan.floorPct, sleeveLeverage: Math.min(plan.sleeveLeverage, maxSleeveLeverage), isLong: leg.direction === "long" },
        options,
      );
      opened.push({ ...record, groupId, binId: plan.bin.id, ...(plan.closeAt ? { closeAt: plan.closeAt } : {}) });
    }
    return opened;
  } catch (error) {
    const markets = [...plan.markets.values()];
    for (const record of opened) await closeFloor(agent, info, user, record, markets, record.floorUsd, options).catch(() => undefined);
    throw new Error(`Floored bin rolled back: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function groupFloors(statuses: FloorStatus[]): { key: string; binId: string | null; closeAt: number | null; items: FloorStatus[] }[] {
  const groups = new Map<string, { key: string; binId: string | null; closeAt: number | null; items: FloorStatus[] }>();
  for (const status of statuses) {
    const key = status.record.groupId ?? `${status.record.coin}@${status.record.openedAt}`;
    const group = groups.get(key) ?? { key, binId: status.record.binId ?? null, closeAt: status.record.closeAt ?? null, items: [] };
    group.items.push(status);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function closeFloorGroup(
  agent: ExchangeClient,
  info: InfoClient,
  user: `0x${string}`,
  statuses: FloorStatus[],
  markets: HlMarket[],
  options: FloorOrderOptions,
): Promise<{ floorWithdrawnUsd: number }> {
  let floorWithdrawnUsd = 0;
  for (const status of statuses) {
    const result = await closeFloor(agent, info, user, status.record, markets, status.floorValueUsd, options);
    floorWithdrawnUsd += result.floorWithdrawnUsd;
  }
  return { floorWithdrawnUsd };
}

export function weekendCloseAt(coins: string[], now: number = Date.now(), bufferMs = 5 * 60_000): number | null {
  const sessions = coins.map((coin) => marketSession(coin, now));
  const closed = sessions.filter((s) => s.tradfiOpen === false && s.nextChangeAt !== null);
  if (closed.length === 0) return null;
  return Math.max(...closed.map((s) => s.nextChangeAt as number)) + bufferMs;
}


