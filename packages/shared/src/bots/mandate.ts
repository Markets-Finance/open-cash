import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { utf8 } from "@scure/base";
import type { StrategyCard } from "../strategy/types.js";
import type { BotMode } from "./types.js";

export type BotAction = "enable" | "disable" | "remove";

export const signatureWindowMs = 10 * 60_000;

function iso(issuedAt: number): string {
  return new Date(issuedAt).toISOString();
}

export function cardDigestInput(card: StrategyCard): string {
  return JSON.stringify({
    name: card.name,
    kind: card.kind,
    marginUsd: card.marginUsd,
    stopLossPct: card.stopLossPct,
    takeProfitPct: card.takeProfitPct ?? null,
    legs: card.legs.map((leg) => [leg.symbol, leg.direction, leg.weightBps, leg.leverage]),
  });
}

export function botDigest(card: StrategyCard, mode: BotMode): string {
  return bytesToHex(sha256(utf8.decode(JSON.stringify({ card: cardDigestInput(card), signal: card.signal ?? null, mode }))));
}

export function botMandateMessage(owner: string, network: string, digest: string, issuedAt: number): string {
  return `Run this bot for me on OpenCash.\nOwner: ${owner.toLowerCase()}\nNetwork: ${network}\nDigest: ${digest}\nIssued: ${iso(issuedAt)}`;
}

export function botActionMessage(botId: string, action: BotAction, issuedAt: number): string {
  return `${action[0].toUpperCase()}${action.slice(1)} bot ${botId} on OpenCash.\nIssued: ${iso(issuedAt)}`;
}

export function agentKeyMessage(owner: string, network: string, agentAddress: string, issuedAt: number): string {
  return `Let OpenCash trade for me with this Hyperliquid agent key. It can trade but cannot withdraw.\nOwner: ${owner.toLowerCase()}\nNetwork: ${network}\nAgent: ${agentAddress.toLowerCase()}\nIssued: ${iso(issuedAt)}`;
}

export function issuedAtOf(message: string): number | null {
  const match = message.match(/Issued: (\S+)$/);
  const time = match ? Date.parse(match[1]) : NaN;
  return Number.isFinite(time) ? time : null;
}

export function freshSignature(issuedAt: number, now: number = Date.now()): boolean {
  return Number.isFinite(issuedAt) && Math.abs(now - issuedAt) <= signatureWindowMs;
}
