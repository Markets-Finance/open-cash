import type { Guardrails } from "./types.js";

export function guardrailsMessage(owner: string, network: string, settings: Guardrails, issuedAt: number): string {
  return [
    "Set my OpenCash loss limits.",
    `Owner: ${owner.toLowerCase()}`,
    `Network: ${network}`,
    `Daily loss limit: ${settings.dailyLossLimitUsd} USD`,
    `Max loss per trade: ${settings.maxLossPerTradeUsd} USD`,
    `Cool-off: ${settings.coolOffMinutes} minutes`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
  ].join("\n");
}
