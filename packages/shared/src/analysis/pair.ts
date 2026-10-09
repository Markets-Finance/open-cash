import type { Candle } from "./types.js";
import type { MarketSnapshot } from "./market.js";
import { alignCloses, beta, correlation, logReturns, stdev, zScore } from "./stats.js";

export type PairAnalysis = {
  long: string;
  short: string;
  samples: number;
  correlation: number;
  beta: number;
  ratioZScore: number;
  ratioVolAnnualPct: number;
  carryAprPct: number;
  roundTripFeeBps: number;
  breakEvenDays: number | null;
};

export function analyzePair(
  long: MarketSnapshot,
  short: MarketSnapshot,
  longCandles: Candle[],
  shortCandles: Candle[],
  resolutionSec: number,
): PairAnalysis {
  const aligned = alignCloses(longCandles, shortCandles);
  const ratio = aligned.a.map((value, i) => value / aligned.b[i]);
  const returnsLong = logReturns(aligned.a);
  const returnsShort = logReturns(aligned.b);
  const periodsPerYear = (365 * 86400) / resolutionSec;
  const ratioVol = stdev(logReturns(ratio)) * Math.sqrt(periodsPerYear) * 100;
  const carryAprPct = (-long.funding.meanAprPct + short.funding.meanAprPct) / 2;
  const roundTripFeeBps = long.takerFeeBps + short.takerFeeBps;
  const dailyCarryBps = (carryAprPct / 365) * 100;
  return {
    long: long.symbol,
    short: short.symbol,
    samples: aligned.a.length,
    correlation: correlation(returnsLong, returnsShort),
    beta: beta(returnsLong, returnsShort),
    ratioZScore: ratio.length > 0 ? zScore(ratio, ratio[ratio.length - 1]) : 0,
    ratioVolAnnualPct: ratioVol,
    carryAprPct,
    roundTripFeeBps,
    breakEvenDays: dailyCarryBps > 0 ? roundTripFeeBps / dailyCarryBps : null,
  };
}

export function pairVerdict(pair: PairAnalysis): string {
  const carry = Math.abs(pair.carryAprPct);
  if (pair.samples < 30) return "Not enough history to judge this pair.";
  if (pair.ratioVolAnnualPct > carry * 4) {
    return `Funding carry is ${pair.carryAprPct.toFixed(0)}% a year but the pair swings ${pair.ratioVolAnnualPct.toFixed(0)}% a year. Treat it as a directional bet, not carry.`;
  }
  if (pair.correlation < 0.5) return "These markets move fairly independently, so the hedge is weak.";
  return "Carry is meaningful against the pair's volatility and the markets move together.";
}
