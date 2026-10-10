export type Guardrails = {
  dailyLossLimitUsd: number;
  maxLossPerTradeUsd: number;
  coolOffMinutes: number;
};

export type GuardrailState = {
  lockedUntil: number | null;
  lastBreachAt: number | null;
};

export type GuardrailLoss = {
  realisedUsd: number;
  feesUsd: number;
  fundingUsd: number;
  unrealisedLossUsd: number;
  lossTodayUsd: number;
};

export type GuardrailVerdict = {
  allowed: boolean;
  reason: string;
  lockedUntil: number | null;
  lossTodayUsd: number;
  remainingTodayUsd: number;
  breached: boolean;
};

export type TradeRisk = { maxLossUsd: number | null };

export const defaultGuardrails: Guardrails = {
  dailyLossLimitUsd: 50,
  maxLossPerTradeUsd: 20,
  coolOffMinutes: 60,
};

export const guardrailBounds = {
  dailyLossLimitUsd: { min: 1, max: 100_000 },
  maxLossPerTradeUsd: { min: 1, max: 100_000 },
  coolOffMinutes: { min: 5, max: 7 * 24 * 60 },
};

export const looseningDelayMs = 24 * 60 * 60_000;
