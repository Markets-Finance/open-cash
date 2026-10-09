import type { ExchangeClient } from "@nktkas/hyperliquid";

export type HlMarketKind = "perp" | "spot";
export type HlTif = "Alo" | "Gtc" | "Ioc";
export type HlBuilder = { address: `0x${string}`; feeTenthsBps: number };

const maxDecimals: Record<HlMarketKind, number> = { perp: 6, spot: 8 };

function trim(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export function formatPrice(price: number, szDecimals: number, kind: HlMarketKind): string {
  const decimals = Math.max(0, maxDecimals[kind] - szDecimals);
  if (price >= 100000) return String(Math.round(price));
  const significant = Number(price.toPrecision(5));
  return trim(significant.toFixed(decimals));
}

export function formatSize(size: number, szDecimals: number): string {
  return trim(size.toFixed(szDecimals));
}

export type LimitOrderInput = {
  assetId: number;
  isBuy: boolean;
  price: number;
  size: number;
  szDecimals: number;
  kind: HlMarketKind;
  tif?: HlTif;
  reduceOnly?: boolean;
  builder?: HlBuilder;
  maxNotionalUsd: number;
};

export const minNotionalUsd = 10;

function checkedOrder(input: LimitOrderInput) {
  const size = formatSize(input.size, input.szDecimals);
  if (Number(size) === 0) throw new Error("Order size rounds to zero");
  const price = formatPrice(input.price, input.szDecimals, input.kind);
  const notional = Number(size) * Number(price);
  if (notional < minNotionalUsd && !input.reduceOnly) {
    throw new Error(`Order notional ${notional.toFixed(4)} is below the $${minNotionalUsd} minimum`);
  }
  if (notional > input.maxNotionalUsd) {
    throw new Error(`Order notional ${notional.toFixed(4)} exceeds cap ${input.maxNotionalUsd}`);
  }
  return {
    a: input.assetId,
    b: input.isBuy,
    p: price,
    s: size,
    r: input.reduceOnly ?? false,
    t: { limit: { tif: input.tif ?? "Alo" } },
  };
}

export async function placeLimitOrder(exchange: ExchangeClient, input: LimitOrderInput) {
  return exchange.order({
    orders: [checkedOrder(input)],
    grouping: "na",
    ...(input.builder
      ? { builder: { b: input.builder.address, f: input.builder.feeTenthsBps } }
      : {}),
  });
}

export async function placeLimitOrders(
  exchange: ExchangeClient,
  inputs: LimitOrderInput[],
  builder?: HlBuilder,
) {
  return exchange.order({
    orders: inputs.map(checkedOrder),
    grouping: "na",
    ...(builder ? { builder: { b: builder.address, f: builder.feeTenthsBps } } : {}),
  });
}

export function modifyOrder(exchange: ExchangeClient, orderId: number, input: LimitOrderInput) {
  return exchange.modify({ oid: orderId, order: checkedOrder(input) });
}

export function cancelOrder(exchange: ExchangeClient, assetId: number, orderId: number) {
  return exchange.cancel({ cancels: [{ a: assetId, o: orderId }] });
}

export function setLeverage(
  exchange: ExchangeClient,
  assetId: number,
  leverage: number,
  isCross = true,
) {
  return exchange.updateLeverage({ asset: assetId, isCross, leverage });
}
