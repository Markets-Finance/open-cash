import type { Bin, BinDirection } from "./types.js";
import type { WeightMode } from "./weights.js";
import { allocate } from "./weights.js";

export function customBin(
  picks: { symbol: string; direction: BinDirection }[],
  mode: WeightMode,
  leverage: number,
  name = "Custom bin",
): Bin {
  const legs = picks.map((pick) => ({ ...pick, weightBps: 0, leverage }));
  const even = allocate(legs, "equal", new Map()).legs;
  return { id: "custom", name, thesis: "A bin you built from your own picks.", legs: even, mode };
}
