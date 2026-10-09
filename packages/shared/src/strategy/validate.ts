import type { RiskLimits, StrategyCard } from "./types.js";

export function cardShapeIssues(card: StrategyCard, limits: RiskLimits): string[] {
  const issues: string[] = [];
  if (!card.name || card.name.length > 60) issues.push("Name must be 1 to 60 characters.");
  if (card.legs.length === 0 || card.legs.length > limits.maxLegs) issues.push(`Between 1 and ${limits.maxLegs} legs.`);
  const weight = card.legs.reduce((sum, leg) => sum + leg.weightBps, 0);
  if (weight !== 10000) issues.push(`Leg weights sum to ${weight}, expected 10000.`);
  if (!(card.marginUsd > 0) || card.marginUsd > limits.maxMarginUsd) issues.push(`Margin must be above 0 and at most ${limits.maxMarginUsd}.`);
  if (!(card.stopLossPct > 0) || card.stopLossPct > limits.maxStopLossPct) issues.push(`Stop must be above 0 and at most ${limits.maxStopLossPct}%.`);
  for (const leg of card.legs) {
    if (!/^(?:[a-z]+:)?[A-Z0-9]{2,12}$/.test(leg.symbol)) issues.push(`Bad market symbol ${leg.symbol}.`);
    if (leg.direction !== "long" && leg.direction !== "short") issues.push(`Bad direction on ${leg.symbol}.`);
    if (!(leg.leverage >= 1) || leg.leverage > limits.maxLeverage) issues.push(`${leg.symbol} leverage must be 1 to ${limits.maxLeverage}.`);
  }
  return issues;
}
