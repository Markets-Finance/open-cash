import { totalWeightBps } from "../bins/sizing.js";
import type { StrategyCard, StrategyLeg } from "../strategy/types.js";

export type TranslateTemplate = {
  marginUsd: number;
  leverage: number;
  stopLossPct: number;
  maxLegs: number;
};

export const defaultTranslateTemplate: TranslateTemplate = {
  marginUsd: 50,
  leverage: 2,
  stopLossPct: 8,
  maxLegs: 4,
};

export type TranslateMarket = { symbol: string; kind: string; volume24hUsd: number };

export type Translation = {
  card: StrategyCard;
  rationale: string;
  caveats: string[];
  dropped: string[];
};

export function translatePrompt(headline: string, markets: TranslateMarket[], template: TranslateTemplate) {
  const list = markets.map((m) => `${m.symbol} (${m.kind})`).join(", ");
  const system = [
    "You turn a news headline into a small, defined-risk trade idea on Hyperliquid perpetuals.",
    `Use ONLY these markets, written exactly as listed: ${list}.`,
    `Pick 1 to ${template.maxLegs} legs. Each leg is long or short with a weight in basis points; weights sum to ${totalWeightBps}.`,
    "Do not choose leverage, size or stops; the app sets them.",
    "If the headline does not support a clear trade, return an empty legs array and explain why in rationale.",
    'Reply with JSON only: {"name": string (max 40 chars), "thesis": string (one sentence), "legs": [{"symbol": string, "direction": "long"|"short", "weightBps": number}], "rationale": string, "caveats": string[]}',
  ].join("\n");
  return { system, user: `Headline: ${headline.trim()}` };
}

function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("The model did not return JSON");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("The model returned incomplete JSON");
}

function normaliseWeights(legs: StrategyLeg[]): StrategyLeg[] {
  const raw = legs.map((leg) => Math.max(0, Number(leg.weightBps) || 0));
  const total = raw.reduce((sum, w) => sum + w, 0);
  const weights = total > 0 ? raw.map((w) => Math.floor((w / total) * totalWeightBps)) : raw.map(() => Math.floor(totalWeightBps / legs.length));
  weights[0] += totalWeightBps - weights.reduce((sum, w) => sum + w, 0);
  return legs.map((leg, i) => ({ ...leg, weightBps: weights[i] }));
}

export function parseTranslation(text: string, knownSymbols: string[], template: TranslateTemplate): Translation {
  const raw = firstJsonObject(text) as {
    name?: unknown;
    thesis?: unknown;
    legs?: unknown;
    rationale?: unknown;
    caveats?: unknown;
  };
  const known = new Map<string, string>();
  for (const s of knownSymbols) {
    known.set(s.toUpperCase(), s);
    if (s.includes(":") && !known.has(s.split(":")[1].toUpperCase())) known.set(s.split(":")[1].toUpperCase(), s);
  }
  const dropped: string[] = [];
  const legs: StrategyLeg[] = [];
  for (const item of Array.isArray(raw.legs) ? raw.legs : []) {
    const leg = item as { symbol?: unknown; direction?: unknown; weightBps?: unknown };
    const symbol = typeof leg.symbol === "string" ? known.get(leg.symbol.toUpperCase()) : undefined;
    const direction = leg.direction === "long" || leg.direction === "short" ? leg.direction : null;
    if (!symbol || !direction || legs.some((l) => l.symbol === symbol)) {
      dropped.push(String(leg.symbol ?? "?"));
      continue;
    }
    legs.push({ symbol, direction, weightBps: Number(leg.weightBps) || 0, leverage: template.leverage });
    if (legs.length === template.maxLegs) break;
  }
  const rationale = typeof raw.rationale === "string" ? raw.rationale : "";
  const caveats = Array.isArray(raw.caveats) ? raw.caveats.filter((c): c is string => typeof c === "string").slice(0, 5) : [];
  if (legs.length === 0 && dropped.length > 0) {
    throw new Error(`None of the suggested markets are available here: ${dropped.join(", ")}`);
  }
  if (legs.length === 0) throw new Error(rationale || "The headline did not map to a tradable market");
  const directions = new Set(legs.map((l) => l.direction));
  const card: StrategyCard = {
    name: (typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Headline trade").slice(0, 40),
    thesis: (typeof raw.thesis === "string" ? raw.thesis : rationale).slice(0, 280),
    kind: legs.length === 1 ? "directional" : directions.size > 1 ? "pair" : "basket",
    marginUsd: template.marginUsd,
    stopLossPct: template.stopLossPct,
    legs: normaliseWeights(legs),
  };
  return { card, rationale, caveats, dropped };
}
