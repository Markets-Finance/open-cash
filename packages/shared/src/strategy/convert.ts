import type { Bin } from "../bins/types.js";
import type { StrategyCard } from "./types.js";

export function binFromCard(card: StrategyCard): Bin {
  return {
    id: `agent-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: card.name,
    thesis: card.thesis,
    legs: card.legs.map((leg) => ({
      symbol: leg.symbol,
      direction: leg.direction,
      weightBps: leg.weightBps,
      leverage: leg.leverage,
    })),
  };
}

export function cardFromBin(bin: Bin, marginUsd: number, stopLossPct: number): StrategyCard {
  const directions = new Set(bin.legs.map((leg) => leg.direction));
  return {
    name: bin.name,
    thesis: bin.thesis,
    kind: bin.legs.length === 1 ? "directional" : directions.size > 1 ? "pair" : "basket",
    marginUsd,
    stopLossPct,
    legs: bin.legs.map((leg) => ({ ...leg })),
  };
}
