import type { HlMarket } from "../hl/markets.js";
import { minNotionalUsd } from "../hl/orders.js";
import type { Book } from "./types.js";
import type { StrategyCard, StrategyIssue, RiskLimits } from "../strategy/types.js";
import { slippageBps, type MarketSnapshot } from "./market.js";

export type LegPreview = {
  symbol: string;
  direction: "long" | "short";
  leverage: number;
  marginUsd: number;
  notionalUsd: number;
  size: number;
  entryPrice: number;
  liquidationPrice: number;
  liquidationDistancePct: number;
  slippageBps: number | null;
  entryFeeUsd: number;
};

export type StrategyPreview = {
  marginUsd: number;
  notionalUsd: number;
  entryFeesUsd: number;
  maxLossAtStopUsd: number;
  takeProfitUsd: number | null;
  legs: LegPreview[];
  issues: StrategyIssue[];
};

export type MarketContext = {
  market: HlMarket;
  snapshot: MarketSnapshot;
  book: Book | null;
};

export function liquidationDistancePct(leverage: number, maxLeverage: number): number {
  return Math.max(0, (1 / leverage - 1 / (2 * maxLeverage)) * 100);
}

export function previewStrategy(
  card: StrategyCard,
  contexts: Map<string, MarketContext>,
  limits: RiskLimits,
): StrategyPreview {
  const issues: StrategyIssue[] = [];
  const legs: LegPreview[] = [];
  const add = (severity: StrategyIssue["severity"], code: string, message: string) =>
    issues.push({ severity, code, message });

  const weightSum = card.legs.reduce((sum, leg) => sum + leg.weightBps, 0);
  if (weightSum !== 10000) add("error", "weights", `Leg weights sum to ${weightSum}, expected 10000.`);
  if (card.legs.length === 0) add("error", "no-legs", "Strategy has no legs.");
  if (card.legs.length > limits.maxLegs) add("error", "too-many-legs", `More than ${limits.maxLegs} legs.`);
  if (!(card.marginUsd > 0)) add("error", "margin", "Margin must be above zero.");
  if (card.marginUsd > limits.maxMarginUsd) {
    add("error", "margin-cap", `Margin exceeds the $${limits.maxMarginUsd} cap.`);
  }
  if (!(card.stopLossPct > 0)) add("error", "no-stop", "A stop loss is required.");
  if (card.stopLossPct > limits.maxStopLossPct) {
    add("error", "stop-cap", `Stop loss is wider than ${limits.maxStopLossPct}% of margin.`);
  }

  for (const leg of card.legs) {
    const context = contexts.get(leg.symbol);
    if (!context) {
      add("error", "unknown-market", `${leg.symbol} is not a Hyperliquid market.`);
      continue;
    }
    const { market, snapshot, book } = context;
    const cap = Math.min(limits.maxLeverage, market.maxLeverage);
    if (leg.leverage > cap) {
      add("error", "leverage", `${leg.symbol} leverage ${leg.leverage}x is above the ${cap}x cap.`);
    }
    if (snapshot.spreadBps > limits.maxSpreadBps) {
      add("warning", "wide-spread", `${leg.symbol} spread is ${snapshot.spreadBps.toFixed(1)} bps.`);
    }

    const legMargin = (card.marginUsd * leg.weightBps) / 10000;
    const step = 10 ** market.szDecimals;
    const size = Math.floor(((legMargin * leg.leverage) / snapshot.mark) * step) / step;
    const notional = size * snapshot.mark;
    if (notional < minNotionalUsd) {
      add("error", "below-minimum", `${leg.symbol} is $${notional.toFixed(2)}, under the $${minNotionalUsd} order minimum.`);
      continue;
    }

    const distance = liquidationDistancePct(leg.leverage, market.maxLeverage);
    const liquidationPrice =
      leg.direction === "long" ? snapshot.mark * (1 - distance / 100) : snapshot.mark * (1 + distance / 100);
    const slip = book ? slippageBps(book, leg.direction === "long" ? "buy" : "sell", notional, snapshot.mark) : null;
    if (book && slip === null) add("error", "thin-book", `${leg.symbol} book cannot absorb $${notional.toFixed(0)}.`);
    if (slip !== null && slip > limits.maxSlippageBps) {
      add("warning", "slippage", `${leg.symbol} slippage is ${slip.toFixed(1)} bps.`);
    }
    const stopMovePct = card.stopLossPct / leg.leverage;
    if (stopMovePct >= distance) {
      add("error", "stop-unreachable", `${leg.symbol} liquidates before the ${card.stopLossPct}% stop.`);
    }

    legs.push({
      symbol: leg.symbol,
      direction: leg.direction,
      leverage: leg.leverage,
      marginUsd: legMargin,
      notionalUsd: notional,
      size,
      entryPrice: snapshot.mark,
      liquidationPrice,
      liquidationDistancePct: distance,
      slippageBps: slip,
      entryFeeUsd: (notional * snapshot.takerFeeBps) / 1e4,
    });
  }

  const notionalUsd = legs.reduce((sum, leg) => sum + leg.notionalUsd, 0);
  const entryFeesUsd = legs.reduce((sum, leg) => sum + leg.entryFeeUsd, 0);
  return {
    marginUsd: card.marginUsd,
    notionalUsd,
    entryFeesUsd,
    maxLossAtStopUsd: (card.marginUsd * card.stopLossPct) / 100 + entryFeesUsd,
    takeProfitUsd: card.takeProfitPct ? (card.marginUsd * card.takeProfitPct) / 100 : null,
    legs,
    issues,
  };
}

export function hasBlockingIssue(preview: StrategyPreview): boolean {
  return preview.issues.some((issue) => issue.severity === "error");
}
