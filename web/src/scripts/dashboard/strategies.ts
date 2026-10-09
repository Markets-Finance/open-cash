import { cardDigestInput, followMessage, publishMessage, unfollowMessage, type StrategyCard } from "shared";
import { hlNetwork } from "../hl";
import { requireTrader } from "./state";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";

export type StrategyRow = {
  id?: string;
  strategyId: string;
  rank: number | null;
  name: string;
  card: StrategyCard;
  author: string;
  authorHandle: string | null;
  followers: number;
  activeFollowers: number;
  qualifyingFollowers: number;
  medianRoiPct: number | null;
  totalFollowerPnlUsd: number;
  winRate: number | null;
  authorRoiPct: number | null;
  ranked: boolean;
};

async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function send<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${backend}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

export async function loadStrategies(): Promise<{ note: string; rows: StrategyRow[] }> {
  const response = await fetch(`${backend}/strategies`);
  if (!response.ok) throw new Error(`Strategies ${response.status}`);
  return (await response.json()) as { note: string; rows: StrategyRow[] };
}

export async function publishStrategy(card: StrategyCard): Promise<{ id: string }> {
  const trader = requireTrader();
  const issuedAt = Date.now();
  const digest = await sha256Hex(cardDigestInput(card));
  const signature = await trader.account.signMessage({ message: publishMessage(digest, issuedAt) });
  return send("/strategies", { address: trader.address, network: hlNetwork, card, issuedAt, signature });
}

export async function followStrategy(strategyId: string, marginUsd: number): Promise<void> {
  const trader = requireTrader();
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: followMessage(strategyId, marginUsd, issuedAt) });
  await send(`/strategies/${strategyId}/follow`, { address: trader.address, network: hlNetwork, marginUsd, issuedAt, signature });
}

export async function unfollowStrategy(strategyId: string): Promise<void> {
  const trader = requireTrader();
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: unfollowMessage(strategyId, issuedAt) });
  await send(`/strategies/${strategyId}/unfollow`, { address: trader.address, issuedAt, signature });
}
