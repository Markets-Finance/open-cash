import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import type { HlMarket } from "./markets.js";
import { formatSize, minNotionalUsd, placeLimitOrder, setLeverage, type HlBuilder } from "./orders.js";
import { getAccount } from "./positions.js";
import { getSpotBalances } from "./spot.js";
import { moveUsd } from "./transfers.js";

export const usdcLendToken = 0;
export const maxSleeveLeverage = 5;

export type FloorPlan = {
  market: HlMarket;
  amountUsd: number;
  floorPct: number;
  sleeveLeverage: number;
  isLong: boolean;
};

export type FloorPreview = {
  floorUsd: number;
  sleeveUsd: number;
  notionalUsd: number;
  participation: number;
  maxLossUsd: number;
  knockOutPx: number;
};

export type FloorRecord = {
  coin: string;
  dex: string;
  assetId: number;
  szDecimals: number;
  isLong: boolean;
  floorUsd: number;
  sleeveUsd: number;
  leverage: number;
  size: number;
  entryPx: number;
  openedAt: number;
  groupId?: string;
  binId?: string;
  closeAt?: number;
};

export type FloorStatus = {
  record: FloorRecord;
  knockedOut: boolean;
  floorValueUsd: number;
  sleeveValueUsd: number;
  totalUsd: number;
  markPx: number;
  knockOutPx: number;
  distanceToKnockOutPct: number;
};

export type FloorOrderOptions = {
  maxNotionalUsd: number;
  builder?: HlBuilder;
  slippage?: number;
};

function knockOutPrice(entryPx: number, leverage: number, maxLeverage: number, isLong: boolean): number {
  const buffer = 1 / leverage - 1 / (2 * maxLeverage);
  return isLong ? entryPx * (1 - buffer) : entryPx * (1 + buffer);
}

export function previewFloor(plan: FloorPlan): FloorPreview {
  if (!(plan.floorPct > 0 && plan.floorPct < 1)) throw new Error("Floor must be between 0% and 100%");
  if (plan.sleeveLeverage < 1 || plan.sleeveLeverage > maxSleeveLeverage) {
    throw new Error(`Sleeve leverage must be between 1x and ${maxSleeveLeverage}x`);
  }
  if (plan.sleeveLeverage > plan.market.maxLeverage) {
    throw new Error(`${plan.market.name} allows at most ${plan.market.maxLeverage}x`);
  }
  const floorUsd = plan.amountUsd * plan.floorPct;
  const sleeveUsd = plan.amountUsd - floorUsd;
  const notionalUsd = sleeveUsd * plan.sleeveLeverage;
  return {
    floorUsd,
    sleeveUsd,
    notionalUsd,
    participation: notionalUsd / plan.amountUsd,
    maxLossUsd: sleeveUsd,
    knockOutPx: knockOutPrice(plan.market.markPx, plan.sleeveLeverage, plan.market.maxLeverage, plan.isLong),
  };
}

function sleeveSize(
  notionalUsd: number,
  limitPx: number,
  markPx: number,
  szDecimals: number,
  maxNotionalUsd: number,
): number {
  const step = 10 ** szDecimals;
  const low = Math.min(limitPx, markPx);
  const high = Math.max(limitPx, markPx);
  const down = Math.floor((notionalUsd / limitPx) * step) / step;
  if (down * low >= minNotionalUsd) return down;
  const up = Math.ceil(((minNotionalUsd * 1.002) / low) * step) / step;
  if (up * high > maxNotionalUsd) throw new Error("Sleeve too small for the $10 minimum within the cap");
  return up;
}

async function openSleeve(
  agent: ExchangeClient,
  market: HlMarket,
  isLong: boolean,
  sleeveUsd: number,
  leverage: number,
  options: FloorOrderOptions,
) {
  const slippage = options.slippage ?? 0.01;
  const price = market.markPx * (isLong ? 1 + slippage : 1 - slippage);
  const size = sleeveSize(sleeveUsd * leverage, price, market.markPx, market.szDecimals, options.maxNotionalUsd);
  await setLeverage(agent, market.assetId, leverage, false);
  const result = await placeLimitOrder(agent, {
    assetId: market.assetId,
    isBuy: isLong,
    price,
    size,
    szDecimals: market.szDecimals,
    kind: "perp",
    tif: "Ioc",
    builder: options.builder,
    maxNotionalUsd: options.maxNotionalUsd,
  });
  const status = result.response.data.statuses[0] as { filled?: { totalSz: string; avgPx: string } };
  if (!status.filled) throw new Error(`Sleeve order did not fill: ${JSON.stringify(status)}`);
  return { size: Number(status.filled.totalSz), entryPx: Number(status.filled.avgPx) };
}

export async function openFloor(
  agent: ExchangeClient,
  info: InfoClient,
  user: `0x${string}`,
  plan: FloorPlan,
  options: FloorOrderOptions,
): Promise<FloorRecord> {
  const preview = previewFloor(plan);
  const [spot, perp] = await Promise.all([
    getSpotBalances(info, user),
    getAccount(info, user, plan.market.dex),
  ]);
  const spotUsdc = spot.find((b) => b.coin === "USDC")?.available ?? 0;
  if (spotUsdc < preview.floorUsd) {
    throw new Error(`Floor needs $${preview.floorUsd.toFixed(2)} USDC in spot; $${spotUsdc.toFixed(2)} available`);
  }
  if (perp.withdrawable < preview.sleeveUsd) {
    throw new Error(`Sleeve needs $${preview.sleeveUsd.toFixed(2)} in perp; $${perp.withdrawable.toFixed(2)} available`);
  }
  if (perp.positions.some((p) => p.coin === plan.market.name)) {
    throw new Error(`A position in ${plan.market.name} is already open; one floor per market`);
  }
  await agent.borrowLend({ operation: "supply", token: usdcLendToken, amount: preview.floorUsd.toFixed(6) });
  try {
    const fill = await openSleeve(agent, plan.market, plan.isLong, preview.sleeveUsd, plan.sleeveLeverage, options);
    return {
      coin: plan.market.name,
      dex: plan.market.dex,
      assetId: plan.market.assetId,
      szDecimals: plan.market.szDecimals,
      isLong: plan.isLong,
      floorUsd: preview.floorUsd,
      sleeveUsd: preview.sleeveUsd,
      leverage: plan.sleeveLeverage,
      size: fill.size,
      entryPx: fill.entryPx,
      openedAt: Date.now(),
    };
  } catch (error) {
    await withdrawSupply(agent, info, user, preview.floorUsd);
    throw error;
  }
}

export async function suppliedUsdc(info: InfoClient, user: `0x${string}`): Promise<number> {
  const state = await info.borrowLendUserState({ user });
  const usdc = state.tokenToState.find(([token]) => token === usdcLendToken);
  return usdc ? Number(usdc[1].supply.value) : 0;
}

export const minSupplyUsd = 1;

export async function withdrawSupply(
  agent: ExchangeClient,
  info: InfoClient,
  user: `0x${string}`,
  amountUsd: number,
) {
  const supplied = await suppliedUsdc(info, user);
  if (supplied <= 0) return 0;
  if (supplied - amountUsd < minSupplyUsd) {
    await agent.borrowLend({ operation: "withdraw", token: usdcLendToken, amount: null });
    return supplied;
  }
  await agent.borrowLend({ operation: "withdraw", token: usdcLendToken, amount: amountUsd.toFixed(6) });
  return amountUsd;
}

export async function floorStatus(
  info: InfoClient,
  user: `0x${string}`,
  records: FloorRecord[],
  markets: HlMarket[],
): Promise<FloorStatus[]> {
  const supplied = await suppliedUsdc(info, user);
  const totalFloors = records.reduce((sum, r) => sum + r.floorUsd, 0);
  const dexes = [...new Set(records.map((r) => r.dex))];
  const accounts = new Map(
    await Promise.all(dexes.map(async (dex) => [dex, await getAccount(info, user, dex)] as const)),
  );
  return records.map((record) => {
    const position = accounts.get(record.dex)?.positions.find((p) => p.coin === record.coin);
    const market = markets.find((m) => m.name === record.coin);
    const markPx = market?.markPx ?? record.entryPx;
    const maxLeverage = market?.maxLeverage ?? record.leverage;
    const knockOutPx = position?.liquidationPx ?? knockOutPrice(record.entryPx, record.leverage, maxLeverage, record.isLong);
    const floorValueUsd = totalFloors > 0 ? (supplied * record.floorUsd) / totalFloors : 0;
    const sleeveValueUsd = position ? record.sleeveUsd + position.unrealizedPnl : 0;
    return {
      record,
      knockedOut: !position,
      floorValueUsd,
      sleeveValueUsd,
      totalUsd: floorValueUsd + sleeveValueUsd,
      markPx,
      knockOutPx,
      distanceToKnockOutPct: position ? Math.abs(markPx - knockOutPx) / markPx : 0,
    };
  });
}

export async function closeFloor(
  agent: ExchangeClient,
  info: InfoClient,
  user: `0x${string}`,
  record: FloorRecord,
  markets: HlMarket[],
  floorValueUsd: number,
  options: FloorOrderOptions,
) {
  const account = await getAccount(info, user, record.dex);
  const position = account.positions.find((p) => p.coin === record.coin);
  const market = markets.find((m) => m.name === record.coin);
  if (position && market) {
    const slippage = options.slippage ?? 0.01;
    await placeLimitOrder(agent, {
      assetId: record.assetId,
      isBuy: !record.isLong,
      price: market.markPx * (record.isLong ? 1 - slippage : 1 + slippage),
      size: Number(formatSize(Math.abs(position.size), record.szDecimals)),
      szDecimals: record.szDecimals,
      kind: "perp",
      tif: "Ioc",
      reduceOnly: true,
      builder: options.builder,
      maxNotionalUsd: options.maxNotionalUsd,
    });
  }
  const withdrawn = await withdrawSupply(agent, info, user, floorValueUsd);
  return { sleeveClosed: Boolean(position), floorWithdrawnUsd: withdrawn };
}

export async function rearmFloor(
  agent: ExchangeClient,
  main: ExchangeClient,
  info: InfoClient,
  user: `0x${string}`,
  record: FloorRecord,
  market: HlMarket,
  sleeveUsd: number,
  options: FloorOrderOptions,
): Promise<FloorRecord> {
  if (sleeveUsd >= record.floorUsd) throw new Error("Re-arm sleeve must be smaller than the floor");
  await withdrawSupply(agent, info, user, sleeveUsd);
  await moveUsd(main, sleeveUsd, true);
  const fill = await openSleeve(agent, market, record.isLong, sleeveUsd, record.leverage, options);
  return {
    ...record,
    floorUsd: record.floorUsd - sleeveUsd,
    sleeveUsd,
    size: fill.size,
    entryPx: fill.entryPx,
    openedAt: Date.now(),
  };
}
