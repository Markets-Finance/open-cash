import type { Book, Candle, FundingPoint } from "./types.js";
import { annualizedVolPct, maxDrawdownPct, mean, median } from "./stats.js";

export type FundingSummary = {
  samples: number;
  nowAprPct: number;
  meanAprPct: number;
  medianAprPct: number;
  positiveShare: number;
};

export type MarketSnapshot = {
  symbol: string;
  mark: number;
  spreadBps: number;
  change24hPct: number;
  volume24hUsd: number;
  openInterestUsd: number;
  maxLeverage: number;
  makerFeeBps: number;
  takerFeeBps: number;
  funding: FundingSummary;
};

export type PriceStats = {
  candles: number;
  returnPct: number;
  highPrice: number;
  lowPrice: number;
  annualizedVolPct: number;
  maxDrawdownPct: number;
};

export type DepthSummary = {
  bidUsdWithin10Bps: number;
  askUsdWithin10Bps: number;
  bidUsdWithin25Bps: number;
  askUsdWithin25Bps: number;
  bidUsdWithin50Bps: number;
  askUsdWithin50Bps: number;
};

export function fundingAprPct(hourlyRate: number): number {
  return hourlyRate * 24 * 365 * 100;
}

export function summarizeFunding(points: FundingPoint[]): FundingSummary {
  const aprs = points.map((p) => fundingAprPct(p.hourlyRate));
  return {
    samples: aprs.length,
    nowAprPct: aprs.length > 0 ? aprs[aprs.length - 1] : 0,
    meanAprPct: mean(aprs),
    medianAprPct: median(aprs),
    positiveShare: aprs.length === 0 ? 0 : aprs.filter((a) => a > 0).length / aprs.length,
  };
}

export function bookSpreadBps(book: Book): number {
  const bid = book.bids[0];
  const ask = book.asks[0];
  if (!bid || !ask) return 0;
  const mid = (bid.price + ask.price) / 2;
  return ((ask.price - bid.price) / mid) * 1e4;
}

export function snapshotMarket(input: {
  symbol: string;
  mark: number;
  prevDay: number;
  volume24hUsd: number;
  openInterestUsd: number;
  maxLeverage: number;
  makerFeeBps: number;
  takerFeeBps: number;
  book: Book;
  funding: FundingPoint[];
}): MarketSnapshot {
  return {
    symbol: input.symbol,
    mark: input.mark,
    spreadBps: bookSpreadBps(input.book),
    change24hPct: input.prevDay > 0 ? ((input.mark - input.prevDay) / input.prevDay) * 100 : 0,
    volume24hUsd: input.volume24hUsd,
    openInterestUsd: input.openInterestUsd,
    maxLeverage: input.maxLeverage,
    makerFeeBps: input.makerFeeBps,
    takerFeeBps: input.takerFeeBps,
    funding: summarizeFunding(input.funding),
  };
}

export function priceStats(candles: Candle[], resolutionSec: number): PriceStats {
  const closes = candles.map((c) => c.close);
  if (closes.length < 2) {
    return { candles: closes.length, returnPct: 0, highPrice: 0, lowPrice: 0, annualizedVolPct: 0, maxDrawdownPct: 0 };
  }
  return {
    candles: closes.length,
    returnPct: ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100,
    highPrice: Math.max(...candles.map((c) => c.high)),
    lowPrice: Math.min(...candles.map((c) => c.low)),
    annualizedVolPct: annualizedVolPct(closes, resolutionSec),
    maxDrawdownPct: maxDrawdownPct(closes),
  };
}

function usdWithin(levels: Book["bids"], mid: number, bps: number, side: "bid" | "ask"): number {
  const limit = side === "bid" ? mid * (1 - bps / 1e4) : mid * (1 + bps / 1e4);
  return levels
    .filter((level) => (side === "bid" ? level.price >= limit : level.price <= limit))
    .reduce((sum, level) => sum + level.price * level.size, 0);
}

export function summarizeDepth(book: Book, mid: number): DepthSummary {
  return {
    bidUsdWithin10Bps: usdWithin(book.bids, mid, 10, "bid"),
    askUsdWithin10Bps: usdWithin(book.asks, mid, 10, "ask"),
    bidUsdWithin25Bps: usdWithin(book.bids, mid, 25, "bid"),
    askUsdWithin25Bps: usdWithin(book.asks, mid, 25, "ask"),
    bidUsdWithin50Bps: usdWithin(book.bids, mid, 50, "bid"),
    askUsdWithin50Bps: usdWithin(book.asks, mid, 50, "ask"),
  };
}

export function slippageBps(book: Book, side: "buy" | "sell", notionalUsd: number, mid: number): number | null {
  const levels = side === "buy" ? book.asks : book.bids;
  let remaining = notionalUsd;
  let cost = 0;
  let filledBase = 0;
  for (const level of levels) {
    const levelUsd = level.price * level.size;
    const take = Math.min(remaining, levelUsd);
    cost += take;
    filledBase += take / level.price;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining > 0 || filledBase === 0) return null;
  const average = cost / filledBase;
  return side === "buy" ? ((average - mid) / mid) * 1e4 : ((mid - average) / mid) * 1e4;
}

export const slippageWarnBps = 25;

export type LiquidityGrade = "deep" | "okay" | "thin";

export type ExecutionEstimate = {
  slippageBps: number | null;
  slippageUsd: number | null;
  spreadBps: number;
  feeUsd: number;
  fundingDailyUsd: number;
  maxSizeUsd: number;
  grade: LiquidityGrade;
};

export function maxNotionalWithinBps(book: Book, side: "buy" | "sell", bps: number, mid: number): number {
  const levels = side === "buy" ? book.asks : book.bids;
  let low = 0;
  let high = levels.reduce((sum, level) => sum + level.price * level.size, 0);
  if (high <= 0) return 0;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    const slip = slippageBps(book, side, middle, mid);
    if (slip !== null && slip <= bps) low = middle;
    else high = middle;
  }
  return low;
}

export function liquidityGrade(slippage: number | null): LiquidityGrade {
  if (slippage === null || slippage > slippageWarnBps) return "thin";
  return slippage <= 10 ? "deep" : "okay";
}

export function estimateExecution(input: {
  book: Book;
  side: "buy" | "sell";
  notionalUsd: number;
  takerFeeBps: number;
  fundingAprPct: number;
}): ExecutionEstimate | null {
  const { book, side, notionalUsd, takerFeeBps, fundingAprPct: apr } = input;
  const bid = book.bids[0];
  const ask = book.asks[0];
  if (!bid || !ask || notionalUsd <= 0) return null;
  const mid = (bid.price + ask.price) / 2;
  const slippage = slippageBps(book, side, notionalUsd, mid);
  const direction = side === "buy" ? 1 : -1;
  return {
    slippageBps: slippage,
    slippageUsd: slippage === null ? null : (notionalUsd * slippage) / 1e4,
    spreadBps: ((ask.price - bid.price) / mid) * 1e4,
    feeUsd: (notionalUsd * takerFeeBps) / 1e4,
    fundingDailyUsd: (notionalUsd * apr * direction) / 100 / 365,
    maxSizeUsd: maxNotionalWithinBps(book, side, slippageWarnBps, mid),
    grade: liquidityGrade(slippage),
  };
}
