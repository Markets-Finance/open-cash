import type { Candle } from "../analysis/types.js";

export type Side = 1 | -1;

export type ParamSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  options?: { value: number; label: string }[];
};

export type Params = Record<string, number>;

export type Position = { qty: number; avgPrice: number };

export type Fill = {
  time: number;
  qtyDelta: number;
  price: number;
  feeUsd: number;
  realizedUsd: number;
  reason: "market" | "limit" | "stop";
};

export type LimitOrder = { price: number; usd: number };

export type StepInput = {
  history: Candle[];
  position: Position;
  fills: Fill[];
  allocationUsd: number;
};

export type StepOutput = {
  market?: number;
  flat?: boolean;
  limits?: LimitOrder[];
  stopPrice?: number | null;
};

export type Strategy = { step: (input: StepInput) => StepOutput };

export type TemplateId = "donchian" | "dca" | "grid" | "trail";

export type Template = {
  id: TemplateId;
  name: string;
  blurb: string;
  params: ParamSpec[];
  defaults: Params;
  create: (params: Params) => Strategy;
};

export type SimOptions = {
  allocationUsd: number;
  maxLeverage: number;
  makerFeeBps: number;
  takerFeeBps: number;
  slippageBps: number;
  funding?: { timeMs: number; hourlyRate: number }[];
};

export const defaultSimOptions: SimOptions = {
  allocationUsd: 500,
  maxLeverage: 3,
  makerFeeBps: 0,
  takerFeeBps: 4,
  slippageBps: 3,
};

export type EquityPoint = { time: number; equity: number };

export type Marker = { time: number; price: number; kind: "buy" | "sell" | "stop" };

export type SimMetrics = {
  netPnlUsd: number;
  returnPct: number;
  holdReturnPct: number;
  maxDrawdownPct: number;
  closingFills: number;
  winRatePct: number | null;
  feesUsd: number;
  fundingUsd: number;
  exposurePct: number;
  liquidated: boolean;
};

export type SimResult = {
  candles: number;
  equity: EquityPoint[];
  fills: Fill[];
  markers: Marker[];
  metrics: SimMetrics;
};
