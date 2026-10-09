import type { HlMarket } from "../hl/markets.js";
import { loadBinInputs, type BinInputSource } from "./inputs.js";
import { sizeBin } from "./sizing.js";
import type { Bin, BinSizingIssue, SizedBin } from "./types.js";
import { allocate, type LegInputs, type WeightMode } from "./weights.js";

export type BinPlan = {
  sized: SizedBin;
  issues: BinSizingIssue[];
  usedMode: WeightMode;
  inputs: Map<string, LegInputs>;
};

export async function planBin(
  source: BinInputSource,
  bin: Bin,
  margin: number,
  markets: Map<string, HlMarket>,
  mode: WeightMode = bin.mode ?? "fixed",
): Promise<BinPlan> {
  const inputs = await loadBinInputs(source, bin.legs.map((leg) => leg.symbol));
  const { legs, usedMode } = allocate(bin.legs, mode, inputs);
  const caps = new Map<string, number>();
  for (const leg of legs) {
    const depth = inputs.get(leg.symbol)?.depthUsd;
    if (depth !== undefined) caps.set(leg.symbol, depth);
  }
  const { sized, issues } = sizeBin({ ...bin, legs }, margin, markets, caps);
  return { sized, issues, usedMode, inputs };
}

export function withoutLegs(bin: Bin, symbols: string[]): Bin {
  const legs = bin.legs.filter((leg) => !symbols.includes(leg.symbol));
  const total = legs.reduce((sum, leg) => sum + leg.weightBps, 0);
  if (legs.length === 0 || total === 0) throw new Error("No legs left in this bin");
  const scaled = legs.map((leg) => ({ ...leg, weightBps: Math.floor((leg.weightBps / total) * 10000) }));
  scaled[0].weightBps += 10000 - scaled.reduce((sum, leg) => sum + leg.weightBps, 0);
  return { ...bin, id: `${bin.id}-without-${symbols.join("-")}`, legs: scaled };
}
