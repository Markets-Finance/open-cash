import { hasBlockingIssue, previewStrategy, type MarketContext } from "../analysis/risk.js";
import type { Toolbox } from "../agent/toolbox.js";
import type { StrategyCard } from "../strategy/types.js";
import type { EntryCheck } from "./engine.js";

export function carryAprPct(card: StrategyCard, aprBySymbol: Map<string, number>): number {
  let total = 0;
  for (const leg of card.legs) {
    const apr = aprBySymbol.get(leg.symbol) ?? 0;
    total += (leg.weightBps / 10000) * (leg.direction === "short" ? apr : -apr);
  }
  return total;
}

export async function checkEntry(
  card: StrategyCard,
  minCarryAprPct: number,
  toolbox: Toolbox,
): Promise<EntryCheck> {
  const contexts = new Map<string, MarketContext>();
  const apr = new Map<string, number>();
  for (const leg of card.legs) {
    if (contexts.has(leg.symbol)) continue;
    const { market, snapshot } = await toolbox.getSnapshot(leg.symbol);
    contexts.set(leg.symbol, { market, snapshot, book: await toolbox.getBook(leg.symbol) });
    apr.set(leg.symbol, snapshot.funding.meanAprPct);
  }
  const preview = previewStrategy(card, contexts, toolbox.limits);
  if (hasBlockingIssue(preview)) {
    return { ok: false, reason: preview.issues.find((i) => i.severity === "error")?.message ?? "Blocked", carryAprPct: null };
  }
  const carry = carryAprPct(card, apr);
  if (carry < minCarryAprPct) {
    return { ok: false, reason: `Carry ${carry.toFixed(1)}% is below ${minCarryAprPct}%`, carryAprPct: carry };
  }
  return { ok: true, reason: `Carry ${carry.toFixed(1)}% APR, risk checks pass`, carryAprPct: carry };
}
