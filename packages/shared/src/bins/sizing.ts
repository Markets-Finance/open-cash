import type { HlMarket } from "../hl/markets.js";
import { minNotionalUsd } from "../hl/orders.js";
import type { Bin, BinSizingIssue, SizedBin, SizedLeg } from "./types.js";

export const totalWeightBps = 10000;

export function validateBin(bin: Bin): void {
  const total = bin.legs.reduce((sum, leg) => sum + leg.weightBps, 0);
  if (total !== totalWeightBps) {
    throw new Error(`Bin ${bin.id} weights sum to ${total}, expected ${totalWeightBps}`);
  }
}

export function sizeBin(
  bin: Bin,
  margin: number,
  markets: Map<string, HlMarket>,
  depthCapUsd: Map<string, number> = new Map(),
): { sized: SizedBin; issues: BinSizingIssue[] } {
  validateBin(bin);
  const issues: BinSizingIssue[] = [];
  const legs: SizedLeg[] = [];

  for (const leg of bin.legs) {
    const market = markets.get(leg.symbol);
    if (!market) {
      issues.push({ symbol: leg.symbol, reason: "unknown-market", detail: `${leg.symbol} is not listed on Hyperliquid` });
      continue;
    }
    if (!(market.markPx > 0) || market.dayNtlVlm <= 0) {
      issues.push({ symbol: leg.symbol, reason: "no-liquidity", detail: `${leg.symbol} has no recent trading` });
      continue;
    }
    const leverage = Math.min(leg.leverage, market.maxLeverage);
    if (leverage < leg.leverage) {
      issues.push({ symbol: leg.symbol, reason: "leverage-capped", detail: `${leg.symbol} capped from ${leg.leverage}x to ${leverage}x` });
    }
    const legMargin = (margin * leg.weightBps) / totalWeightBps;
    const step = 10 ** market.szDecimals;
    let notional = legMargin * leverage;
    const depthCap = depthCapUsd.get(leg.symbol);
    if (depthCap !== undefined && notional > depthCap) {
      notional = depthCap;
      issues.push({ symbol: leg.symbol, reason: "depth-limited", detail: `${leg.symbol} limited to $${depthCap.toFixed(0)} by book depth` });
    }
    const size = Math.floor((notional / market.markPx) * step) / step;
    const sizedNotional = size * market.markPx;
    if (sizedNotional < minNotionalUsd) {
      issues.push({
        symbol: leg.symbol,
        reason: "below-minimum",
        detail: `$${legMargin.toFixed(2)} at ${leverage}x is $${sizedNotional.toFixed(2)}, under the $${minNotionalUsd} minimum for ${leg.symbol}`,
      });
      continue;
    }
    legs.push({
      leg,
      assetId: market.assetId,
      szDecimals: market.szDecimals,
      margin: sizedNotional / leverage,
      notional: sizedNotional,
      size,
      mark: market.markPx,
      leverage,
    });
  }

  return {
    sized: {
      bin,
      legs,
      margin: legs.reduce((sum, leg) => sum + leg.margin, 0),
      notional: legs.reduce((sum, leg) => sum + leg.notional, 0),
    },
    issues,
  };
}
