import type { InfoClient } from "@nktkas/hyperliquid";
import {
  estimateExecution,
  snapshotMarket,
  summarizeDepth,
  type DepthSummary,
  type ExecutionEstimate,
  type MarketSnapshot,
} from "../analysis/market.js";
import type { Book, Candle, FundingPoint } from "../analysis/types.js";
import type { HlMarket } from "./markets.js";

export const hip3FeeMultiplier = 2;
export const defaultTakerFeeBps = 4.5;
export const defaultMakerFeeBps = 1.5;

export type HlFeeRates = { takerFeeBps: number; makerFeeBps: number };

export async function loadBook(info: InfoClient, coin: string, nSigFigs?: 2 | 3 | 4 | 5): Promise<Book> {
  const book = await info.l2Book(nSigFigs ? { coin, nSigFigs } : { coin });
  if (!book) throw new Error(`No order book for ${coin}`);
  const side = (levels: { px: string; sz: string; n: number }[]) =>
    levels.map((l) => ({ price: Number(l.px), size: Number(l.sz), orders: l.n }));
  return { bids: side(book.levels[0]), asks: side(book.levels[1]), atMs: book.time };
}

export async function loadDeepBook(info: InfoClient, coin: string): Promise<Book> {
  const [fine, coarse] = await Promise.all([loadBook(info, coin), loadBook(info, coin, 3)]);
  const lastAsk = fine.asks[fine.asks.length - 1]?.price ?? 0;
  const lastBid = fine.bids[fine.bids.length - 1]?.price ?? Infinity;
  return {
    bids: [...fine.bids, ...coarse.bids.filter((l) => l.price < lastBid)],
    asks: [...fine.asks, ...coarse.asks.filter((l) => l.price > lastAsk)],
    atMs: fine.atMs,
  };
}

export async function loadOhlc(
  info: InfoClient,
  coin: string,
  interval: "1h" | "4h" | "1d",
  startTime: number,
): Promise<Candle[]> {
  const candles = await info.candleSnapshot({ coin, interval, startTime });
  return candles.map((c) => ({
    time: c.t,
    open: Number(c.o),
    high: Number(c.h),
    low: Number(c.l),
    close: Number(c.c),
    volume: Number(c.v),
  }));
}

export async function loadFunding(info: InfoClient, coin: string, startTime: number): Promise<FundingPoint[]> {
  const points = await info.fundingHistory({ coin, startTime });
  return points.map((p) => ({ timeMs: p.time, hourlyRate: Number(p.fundingRate) }));
}

export async function loadFeeRates(info: InfoClient, user?: `0x${string}`): Promise<HlFeeRates> {
  if (!user) return { takerFeeBps: defaultTakerFeeBps, makerFeeBps: defaultMakerFeeBps };
  const fees = await info.userFees({ user });
  return {
    takerFeeBps: Number(fees.userCrossRate) * 1e4,
    makerFeeBps: Number(fees.userAddRate) * 1e4,
  };
}

export function marketFeeRates(market: HlMarket, base: HlFeeRates): HlFeeRates {
  const scale = market.dex ? hip3FeeMultiplier : 1;
  return { takerFeeBps: base.takerFeeBps * scale, makerFeeBps: base.makerFeeBps * scale };
}

export async function loadMarketSnapshot(
  info: InfoClient,
  market: HlMarket,
  fees: HlFeeRates,
  fundingLookbackMs = 7 * 864e5,
): Promise<{ snapshot: MarketSnapshot; book: Book; depth: DepthSummary }> {
  const [book, funding] = await Promise.all([
    loadDeepBook(info, market.name),
    loadFunding(info, market.name, Date.now() - fundingLookbackMs),
  ]);
  const rates = marketFeeRates(market, fees);
  const snapshot = snapshotMarket({
    symbol: market.name,
    mark: market.markPx,
    prevDay: market.prevDayPx,
    volume24hUsd: market.dayNtlVlm,
    openInterestUsd: market.openInterest * market.markPx,
    maxLeverage: market.maxLeverage,
    makerFeeBps: rates.makerFeeBps,
    takerFeeBps: rates.takerFeeBps,
    book,
    funding,
  });
  const bid = book.bids[0]?.price ?? market.markPx;
  const ask = book.asks[0]?.price ?? market.markPx;
  return { snapshot, book, depth: summarizeDepth(book, (bid + ask) / 2) };
}

export function estimateMarketOrder(
  book: Book,
  snapshot: MarketSnapshot,
  side: "buy" | "sell",
  notionalUsd: number,
): ExecutionEstimate | null {
  return estimateExecution({
    book,
    side,
    notionalUsd,
    takerFeeBps: snapshot.takerFeeBps,
    fundingAprPct: snapshot.funding.nowAprPct,
  });
}
