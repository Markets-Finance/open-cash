import type { InfoClient } from "@nktkas/hyperliquid";
import { stockLogoUrl } from "./logos.js";
import { listMarkets } from "./markets.js";
import type { HlMarketKind } from "./orders.js";
import { getAccount, type HlPosition } from "./positions.js";
import { getSpotBalances, listSpotMarkets } from "./spot.js";

export const maxOrderNotionalUsd = Infinity;
export const hlDexes = ["", "xyz"];

export type TradeMarket = {
  coin: string;
  symbol: string;
  detail: string;
  kind: HlMarketKind;
  dex: string;
  assetId: number;
  szDecimals: number;
  maxLeverage: number;
  markPx: number;
  prevDayPx: number;
  dayNtlVlm: number;
};

export function coinLogoUrl(symbol: string): string {
  return `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
}

export function marketLogoUrl(market: TradeMarket): string {
  return market.dex ? stockLogoUrl(market.symbol) : coinLogoUrl(market.symbol);
}

export async function loadTradeMarkets(info: InfoClient): Promise<TradeMarket[]> {
  const [main, xyz, spot] = await Promise.all([
    listMarkets(info, ""),
    listMarkets(info, "xyz"),
    listSpotMarkets(info),
  ]);
  const perps = [...main, ...xyz].map((m) => {
    const symbol = m.name.split(":").pop()!;
    return {
      coin: m.name,
      symbol,
      detail: m.dex ? `${m.dex} · HIP-3 perp` : `${symbol}-USD · Perp`,
      kind: "perp" as const,
      dex: m.dex,
      assetId: m.assetId,
      szDecimals: m.szDecimals,
      maxLeverage: m.maxLeverage,
      markPx: m.markPx,
      prevDayPx: m.prevDayPx,
      dayNtlVlm: m.dayNtlVlm,
    };
  });
  const spots = spot.map((m) => ({
    coin: m.coin,
    symbol: m.base,
    detail: `${m.pair} · Spot`,
    kind: "spot" as const,
    dex: "",
    assetId: m.assetId,
    szDecimals: m.szDecimals,
    maxLeverage: 1,
    markPx: m.markPx,
    prevDayPx: m.prevDayPx,
    dayNtlVlm: m.dayNtlVlm,
  }));
  return [...perps, ...spots].filter((m) => m.markPx > 0);
}

export const chartRanges = {
  "1h": { interval: "1m", spanMs: 3_600_000 },
  "4h": { interval: "5m", spanMs: 14_400_000 },
  "1d": { interval: "15m", spanMs: 86_400_000 },
  "1w": { interval: "2h", spanMs: 604_800_000 },
  "1m": { interval: "8h", spanMs: 2_592_000_000 },
} as const;

export type ChartRangeKey = keyof typeof chartRanges;
export type HlCandle = { time: number; open: number; close: number };

export async function loadCandles(
  info: InfoClient,
  coin: string,
  range: ChartRangeKey,
): Promise<HlCandle[]> {
  const { interval, spanMs } = chartRanges[range];
  const candles = await info.candleSnapshot({ coin, interval, startTime: Date.now() - spanMs });
  return candles.map((c) => ({ time: c.t, open: Number(c.o), close: Number(c.c) }));
}

export type HlOrder = {
  coin: string;
  oid: number;
  isBuy: boolean;
  price: number;
  size: number;
  tif: string | null;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPx: number;
  orderType: string;
};

export type HlFill = {
  coin: string;
  time: number;
  dir: string;
  price: number;
  size: number;
  fee: number;
  closedPnl: number;
};

export type HlDesk = {
  equity: number;
  updatedAt: Date;
  positions: HlPosition[];
  orders: HlOrder[];
  fills: HlFill[];
};

export async function loadDesk(info: InfoClient, user: `0x${string}`): Promise<HlDesk> {
  const [accounts, orders, spot, fills] = await Promise.all([
    Promise.all(hlDexes.map((dex) => getAccount(info, user, dex))),
    Promise.all(hlDexes.map((dex) => info.frontendOpenOrders(dex ? { user, dex } : { user }))),
    getSpotBalances(info, user),
    info.userFills({ user }),
  ]);
  return {
    equity:
      accounts.reduce((sum, a) => sum + a.equity, 0) +
      (spot.find((b) => b.coin === "USDC")?.available ?? 0),
    updatedAt: new Date(),
    positions: accounts.flatMap((a) => a.positions),
    orders: orders.flat().map((o) => ({
      coin: o.coin,
      oid: o.oid,
      isBuy: o.side === "B",
      price: Number(o.limitPx),
      size: Number(o.sz),
      tif: o.tif,
      reduceOnly: o.reduceOnly,
      isTrigger: o.isTrigger,
      triggerPx: Number(o.triggerPx),
      orderType: o.orderType,
    })),
    fills: fills.slice(0, 50).map((f) => ({
      coin: f.coin,
      time: f.time,
      dir: f.dir,
      price: Number(f.px),
      size: Number(f.sz),
      fee: Number(f.fee),
      closedPnl: Number(f.closedPnl),
    })),
  };
}
