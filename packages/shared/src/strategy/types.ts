export type LegDirection = "long" | "short";

export type StrategyLeg = {
  symbol: string;
  direction: LegDirection;
  weightBps: number;
  leverage: number;
};

export type StrategyKind = "directional" | "pair" | "basket";

export type StrategyCard = {
  name: string;
  thesis: string;
  kind: StrategyKind;
  marginUsd: number;
  legs: StrategyLeg[];
  stopLossPct: number;
  takeProfitPct?: number;
  signal?: "nansen";
};

export type RiskLimits = {
  maxLeverage: number;
  maxMarginUsd: number;
  maxLegs: number;
  maxStopLossPct: number;
  maxSpreadBps: number;
  maxSlippageBps: number;
};

export type Severity = "error" | "warning";

export type StrategyIssue = { severity: Severity; code: string; message: string };

export const defaultLimits: RiskLimits = {
  maxLeverage: 5,
  maxMarginUsd: 500,
  maxLegs: 6,
  maxStopLossPct: 25,
  maxSpreadBps: 30,
  maxSlippageBps: 25,
};
