import type { Bin } from "./types.js";

export const bins: Bin[] = [
  {
    id: "us-large-cap",
    tags: ["weekend"],
    name: "US large cap",
    thesis: "The S&P 500 and the Nasdaq 100 in one position, open on weekends too.",
    legs: [
      { symbol: "xyz:SP500", direction: "long", weightBps: 6000, leverage: 3 },
      { symbol: "xyz:XYZ100", direction: "long", weightBps: 4000, leverage: 3 },
    ],
  },
  {
    id: "ai-compute",
    name: "AI compute",
    thesis: "The GPU maker and the memory it cannot ship without.",
    legs: [
      { symbol: "xyz:NVDA", direction: "long", weightBps: 4000, leverage: 3 },
      { symbol: "xyz:MU", direction: "long", weightBps: 2000, leverage: 3 },
      { symbol: "xyz:SKHX", direction: "long", weightBps: 2000, leverage: 3 },
      { symbol: "xyz:AMD", direction: "long", weightBps: 2000, leverage: 3 },
    ],
  },
  {
    id: "memory-chips",
    name: "Memory chips",
    thesis: "The four names making the memory every AI server needs.",
    legs: [
      { symbol: "xyz:SKHX", direction: "long", weightBps: 2500, leverage: 3 },
      { symbol: "xyz:SNDK", direction: "long", weightBps: 2500, leverage: 3 },
      { symbol: "xyz:MU", direction: "long", weightBps: 2500, leverage: 3 },
      { symbol: "xyz:DRAM", direction: "long", weightBps: 2500, leverage: 3 },
    ],
  },
  {
    id: "metals",
    tags: ["weekend"],
    name: "Gold and silver",
    thesis: "The two metals people buy when they stop trusting paper.",
    legs: [
      { symbol: "xyz:GOLD", direction: "long", weightBps: 6000, leverage: 3 },
      { symbol: "xyz:SILVER", direction: "long", weightBps: 4000, leverage: 3 },
    ],
  },
  {
    id: "oil-shock",
    tags: ["weekend"],
    name: "Oil shock",
    thesis: "Crude up, with gold alongside for when the shock spreads.",
    legs: [
      { symbol: "xyz:CL", direction: "long", weightBps: 6000, leverage: 3 },
      { symbol: "xyz:GOLD", direction: "long", weightBps: 4000, leverage: 3 },
    ],
  },
  {
    id: "global-indices",
    tags: ["weekend"],
    name: "Global indices",
    thesis: "US and Japanese stock indices, priced through the weekend while their futures are shut.",
    legs: [
      { symbol: "xyz:SP500", direction: "long", weightBps: 4500, leverage: 3 },
      { symbol: "xyz:XYZ100", direction: "long", weightBps: 3500, leverage: 3 },
      { symbol: "xyz:JP225", direction: "long", weightBps: 2000, leverage: 3 },
    ],
  },
  {
    id: "crypto-majors",
    name: "Crypto majors",
    thesis: "The three deepest crypto books on Hyperliquid.",
    legs: [
      { symbol: "BTC", direction: "long", weightBps: 5000, leverage: 3 },
      { symbol: "ETH", direction: "long", weightBps: 3000, leverage: 3 },
      { symbol: "SOL", direction: "long", weightBps: 2000, leverage: 3 },
    ],
  },
];

export function binById(id: string): Bin | undefined {
  return bins.find((bin) => bin.id === id);
}

export function weekendBins(): Bin[] {
  return bins.filter((bin) => bin.tags?.includes("weekend"));
}
