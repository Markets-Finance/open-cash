import type { StrategyCard, StrategyLeg } from "./types.js";

export type Drafter = (prompt: string, knownSymbols: string[]) => Promise<StrategyCard | null>;

const defaults = { leverage: 2, marginUsd: 100, stopLossPct: 8 };

function pick(prompt: string, pattern: RegExp): number | null {
  const match = prompt.match(pattern);
  return match ? Number(match[1]) : null;
}

export const ruleDrafter: Drafter = async (prompt, knownSymbols) => {
  const known = new Map<string, string>();
  for (const s of knownSymbols) {
    known.set(s.toUpperCase(), s);
    const bare = s.includes(":") ? s.split(":")[1].toUpperCase() : s.toUpperCase();
    if (!known.has(bare)) known.set(bare, s);
  }
  const legs: StrategyLeg[] = [];
  const leverage = pick(prompt, /(\d+(?:\.\d+)?)\s*x\b/i) ?? defaults.leverage;
  for (const match of prompt.matchAll(/\b(long|short)\s+((?:[a-z]+:)?[A-Za-z0-9]{2,12})\b/gi)) {
    const symbol = known.get(match[2].toUpperCase());
    if (!symbol || legs.some((leg) => leg.symbol === symbol)) continue;
    legs.push({ symbol, direction: match[1].toLowerCase() as "long" | "short", weightBps: 0, leverage });
  }
  if (legs.length === 0) return null;
  const share = Math.floor(10000 / legs.length);
  legs.forEach((leg, index) => {
    leg.weightBps = index === legs.length - 1 ? 10000 - share * (legs.length - 1) : share;
  });
  const directions = new Set(legs.map((leg) => leg.direction));
  return {
    name: legs.map((leg) => `${leg.direction === "long" ? "L" : "S"} ${leg.symbol.replace(/^[a-z]+:/, "")}`).join(" / "),
    thesis: prompt.trim(),
    kind: legs.length === 1 ? "directional" : directions.size > 1 ? "pair" : "basket",
    marginUsd: pick(prompt, /\$\s*(\d+(?:\.\d+)?)/) ?? defaults.marginUsd,
    stopLossPct: pick(prompt, /stop(?:\s*loss)?\s*(?:at\s*)?(\d+(?:\.\d+)?)\s*%/i) ?? defaults.stopLossPct,
    takeProfitPct: pick(prompt, /(?:tp|take\s*profit|target)\s*(?:at\s*)?(\d+(?:\.\d+)?)\s*%/i) ?? undefined,
    legs,
  };
};
