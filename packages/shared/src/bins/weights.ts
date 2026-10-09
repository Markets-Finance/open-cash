import type { BinLeg } from "./types.js";
import { totalWeightBps } from "./sizing.js";

export type WeightMode = "fixed" | "liquidity" | "risk" | "equal";

export type LegInputs = { depthUsd?: number; volPct?: number };

export const weightModes: { key: WeightMode; label: string; hint: string }[] = [
  { key: "fixed", label: "Fixed", hint: "The weights the bin was written with." },
  { key: "liquidity", label: "Liquidity", hint: "More margin where the book is deeper." },
  { key: "risk", label: "Risk", hint: "Less margin where the price swings more." },
  { key: "equal", label: "Equal", hint: "The same margin on every leg." },
];

function normalise(raw: number[]): number[] {
  const sum = raw.reduce((total, value) => total + value, 0);
  if (!(sum > 0)) return raw.map(() => 0);
  const exact = raw.map((value) => (value / sum) * totalWeightBps);
  const floors = exact.map(Math.floor);
  let left = totalWeightBps - floors.reduce((total, value) => total + value, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return floors;
}

export function allocate(
  legs: BinLeg[],
  mode: WeightMode,
  inputs: Map<string, LegInputs>,
): { legs: BinLeg[]; usedMode: WeightMode } {
  if (mode === "fixed" || legs.length === 0) return { legs, usedMode: "fixed" };
  let raw: number[] | null = legs.map(() => 1);
  if (mode === "liquidity") {
    const depths = legs.map((leg) => inputs.get(leg.symbol)?.depthUsd);
    raw = depths.every((value) => value !== undefined && value > 0) ? (depths as number[]) : null;
  } else if (mode === "risk") {
    const vols = legs.map((leg) => inputs.get(leg.symbol)?.volPct);
    raw = vols.every((value) => value !== undefined && value > 0) ? (vols as number[]).map((value) => 1 / value) : null;
  }
  if (raw === null) return { legs, usedMode: "fixed" };
  const weights = normalise(raw);
  return { legs: legs.map((leg, index) => ({ ...leg, weightBps: weights[index] })), usedMode: mode };
}
