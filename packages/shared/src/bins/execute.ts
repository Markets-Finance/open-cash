import type { ExchangeClient } from "@nktkas/hyperliquid";
import type { HlMarket } from "../hl/markets.js";
import {
  minNotionalUsd,
  placeLimitOrders,
  setLeverage,
  type HlBuilder,
  type HlTif,
  type LimitOrderInput,
} from "../hl/orders.js";
import type { HlPosition } from "../hl/positions.js";
import type { SizedBin } from "./types.js";

export type BinOrderOptions = {
  maxNotionalUsd: number;
  tif?: HlTif;
  slippage?: number;
  builder?: HlBuilder;
};

export function binEntryOrders(
  sized: SizedBin,
  markets: Map<string, HlMarket>,
  options: BinOrderOptions,
): LimitOrderInput[] {
  const tif = options.tif ?? "Ioc";
  const slippage = tif === "Alo" ? 0 : options.slippage ?? 0.01;
  return sized.legs.map((leg) => {
    const market = markets.get(leg.leg.symbol);
    if (!market) throw new Error(`Market ${leg.leg.symbol} missing at execution`);
    const isBuy = leg.leg.direction === "long";
    return {
      assetId: leg.assetId,
      isBuy,
      price: market.markPx * (isBuy ? 1 + slippage : 1 - slippage),
      size: leg.size,
      szDecimals: leg.szDecimals,
      kind: "perp",
      tif,
      maxNotionalUsd: options.maxNotionalUsd,
    };
  });
}

export type BinLegResult = {
  symbol: string;
  filledSize: number;
  avgPx: number | null;
  error: string | null;
};

function exitChunks(totalSize: number, markPx: number, szDecimals: number, maxNotionalUsd: number): number[] {
  const step = 10 ** szDecimals;
  const total = Math.round(totalSize * step);
  const notional = totalSize * markPx;
  if (notional <= maxNotionalUsd) return [total / step];
  const pieces = Math.ceil(notional / (maxNotionalUsd * 0.98));
  const base = Math.floor(total / pieces);
  if ((base / step) * markPx < minNotionalUsd) {
    throw new Error(`Cannot split $${notional.toFixed(2)} into orders between $${minNotionalUsd} and $${maxNotionalUsd}`);
  }
  const chunks = Array.from({ length: pieces }, () => base);
  chunks[pieces - 1] += total - base * pieces;
  return chunks.map((units) => units / step);
}

export function binExitOrders(
  positions: HlPosition[],
  markets: Map<string, HlMarket>,
  options: BinOrderOptions,
): LimitOrderInput[] {
  const slippage = options.slippage ?? 0.01;
  return positions.flatMap((position) => {
    const market = markets.get(position.coin);
    if (!market) throw new Error(`Market ${position.coin} missing at exit`);
    const isLong = position.size > 0;
    return exitChunks(Math.abs(position.size), market.markPx, market.szDecimals, options.maxNotionalUsd).map(
      (size): LimitOrderInput => ({
        assetId: market.assetId,
        isBuy: !isLong,
        price: market.markPx * (isLong ? 1 - slippage : 1 + slippage),
        size,
        szDecimals: market.szDecimals,
        kind: "perp",
        tif: "Ioc",
        reduceOnly: true,
        maxNotionalUsd: options.maxNotionalUsd,
      }),
    );
  });
}

type OrderStatus = { filled?: { totalSz: string; avgPx: string }; resting?: { oid: number }; error?: string };

async function submitLegs(
  exchange: ExchangeClient,
  orders: LimitOrderInput[],
  symbols: string[],
  builder?: HlBuilder,
): Promise<BinLegResult[]> {
  let statuses: OrderStatus[];
  try {
    const result = await placeLimitOrders(exchange, orders, builder);
    statuses = result.response.data.statuses as OrderStatus[];
  } catch (error) {
    const response = (error as { response?: { response?: { data?: { statuses?: OrderStatus[] } } } }).response;
    const partial = response?.response?.data?.statuses;
    if (!partial) throw error;
    statuses = partial;
  }
  return statuses.map((status, index) => ({
    symbol: symbols[index],
    filledSize: status.filled ? Number(status.filled.totalSz) : 0,
    avgPx: status.filled ? Number(status.filled.avgPx) : null,
    error: status.error ?? (status.resting ? "resting, not filled" : null),
  }));
}

export async function openBin(
  exchange: ExchangeClient,
  sized: SizedBin,
  markets: Map<string, HlMarket>,
  options: BinOrderOptions,
): Promise<BinLegResult[]> {
  if (sized.legs.length === 0) throw new Error("No legs to open");
  const orders = binEntryOrders(sized, markets, options);
  for (const leg of sized.legs) {
    await setLeverage(exchange, leg.assetId, leg.leverage, false);
  }
  return submitLegs(exchange, orders, sized.legs.map((leg) => leg.leg.symbol), options.builder);
}

export async function closeBin(
  exchange: ExchangeClient,
  positions: HlPosition[],
  markets: Map<string, HlMarket>,
  options: BinOrderOptions,
): Promise<BinLegResult[]> {
  if (positions.length === 0) return [];
  const orders = binExitOrders(positions, markets, options);
  const symbols = orders.map((order) => positions.find((p) => markets.get(p.coin)?.assetId === order.assetId)?.coin ?? "");
  return submitLegs(exchange, orders, symbols, options.builder);
}
