import { guardrailBounds, type GuardrailLoss, type GuardrailState, type GuardrailVerdict, type Guardrails, type TradeRisk } from "./types.js";

export function utcDayStart(now: number): number {
  const day = new Date(now);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
}

export function guardrailIssues(settings: Guardrails): string[] {
  const issues: string[] = [];
  for (const key of Object.keys(guardrailBounds) as (keyof Guardrails)[]) {
    const { min, max } = guardrailBounds[key];
    const value = settings[key];
    if (!Number.isFinite(value) || value < min || value > max) issues.push(`${key} must be between ${min} and ${max}.`);
  }
  if (settings.maxLossPerTradeUsd > settings.dailyLossLimitUsd) issues.push("Per-trade max loss cannot exceed the daily limit.");
  return issues;
}

export function isLoosening(current: Guardrails, next: Guardrails): boolean {
  return (
    next.dailyLossLimitUsd > current.dailyLossLimitUsd ||
    next.maxLossPerTradeUsd > current.maxLossPerTradeUsd ||
    next.coolOffMinutes < current.coolOffMinutes
  );
}

export function computeLoss(input: {
  fills: { time: number; closedPnl: string; fee: string }[];
  fundings: { time: number; delta: { usdc: string } }[];
  unrealisedPnls: number[];
  now: number;
}): GuardrailLoss {
  const start = utcDayStart(input.now);
  const today = input.fills.filter((f) => f.time >= start && f.time <= input.now);
  const realisedUsd = today.reduce((sum, f) => sum + Number(f.closedPnl), 0);
  const feesUsd = today.reduce((sum, f) => sum + Number(f.fee), 0);
  const fundingUsd = input.fundings
    .filter((f) => f.time >= start && f.time <= input.now)
    .reduce((sum, f) => sum + Number(f.delta.usdc), 0);
  const unrealisedLossUsd = input.unrealisedPnls.reduce((sum, pnl) => sum + Math.min(0, pnl), 0);
  const net = realisedUsd - feesUsd + fundingUsd + unrealisedLossUsd;
  return { realisedUsd, feesUsd, fundingUsd, unrealisedLossUsd, lossTodayUsd: Math.max(0, -net) };
}

export function evaluateGuardrails(input: {
  settings: Guardrails;
  state: GuardrailState;
  loss: GuardrailLoss;
  now: number;
  trade?: TradeRisk;
}): GuardrailVerdict {
  const { settings, state, loss, now, trade } = input;
  const remainingTodayUsd = Math.max(0, settings.dailyLossLimitUsd - loss.lossTodayUsd);
  const base = { lossTodayUsd: loss.lossTodayUsd, remainingTodayUsd };
  if (state.lockedUntil !== null && state.lockedUntil > now) {
    return { ...base, allowed: false, breached: false, lockedUntil: state.lockedUntil, reason: `Locked after a loss limit breach until ${new Date(state.lockedUntil).toISOString()}` };
  }
  if (loss.lossTodayUsd >= settings.dailyLossLimitUsd) {
    const lockedUntil = now + settings.coolOffMinutes * 60_000;
    return { ...base, allowed: false, breached: true, lockedUntil, reason: `Daily loss $${loss.lossTodayUsd.toFixed(2)} reached the $${settings.dailyLossLimitUsd} limit` };
  }
  if (trade) {
    if (trade.maxLossUsd === null) {
      return { ...base, allowed: false, breached: false, lockedUntil: null, reason: "A stop is required: this trade has no defined max loss" };
    }
    if (trade.maxLossUsd > settings.maxLossPerTradeUsd) {
      return { ...base, allowed: false, breached: false, lockedUntil: null, reason: `Max loss $${trade.maxLossUsd.toFixed(2)} is above the $${settings.maxLossPerTradeUsd} per-trade limit` };
    }
    if (trade.maxLossUsd > remainingTodayUsd) {
      return { ...base, allowed: false, breached: false, lockedUntil: null, reason: `Max loss $${trade.maxLossUsd.toFixed(2)} is above the $${remainingTodayUsd.toFixed(2)} left today` };
    }
  }
  return { ...base, allowed: true, breached: false, lockedUntil: null, reason: "Within limits" };
}
