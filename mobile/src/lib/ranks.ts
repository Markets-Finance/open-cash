import { cardDigestInput, followMessage, publishMessage, type StrategyCard } from "shared";
import { sha256, toBytes } from "viem";
import { addBotFromCard, currentTrader } from "./bots";
import { backendUrl } from "./config";
import { hlNetwork } from "./hl";

export type RankRow = {
  rank: number;
  address: string | null;
  handle: string | null;
  netPnlUsd: number;
  volumeUsd: number;
  equityUsd: number;
  roiPct: number;
};

export type Board = { network: string; windowHours: number; syncedAt: number; rows: RankRow[] };

export type StrategyRow = {
  strategyId: string;
  rank: number | null;
  name: string;
  card: StrategyCard;
  author: string;
  authorHandle: string | null;
  followers: number;
  qualifyingFollowers: number;
  medianRoiPct: number | null;
  totalFollowerPnlUsd: number;
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`);
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return (await response.json()) as T;
}

export const loadBoard = () => get<Board>(`/leaderboard?limit=50&network=${hlNetwork}`);
export const loadStrategies = () => get<{ note: string; rows: StrategyRow[] }>("/strategies");

export async function followStrategy(row: StrategyRow): Promise<void> {
  const trader = currentTrader();
  if (trader === null) throw new Error("Not signed in.");
  const issuedAt = Date.now();
  const marginUsd = row.card.marginUsd;
  const signature = await trader.account.signMessage({ message: followMessage(row.strategyId, marginUsd, issuedAt) });
  const response = await fetch(`${backendUrl}/strategies/${row.strategyId}/follow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: trader.address, network: hlNetwork, marginUsd, issuedAt, signature }),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Follow failed (${response.status})`);
  await addBotFromCard(row.card, "auto");
}

export async function publishStrategy(card: StrategyCard): Promise<{ id: string }> {
  const trader = currentTrader();
  if (trader === null) throw new Error("Not signed in.");
  const issuedAt = Date.now();
  const digest = sha256(toBytes(cardDigestInput(card))).slice(2);
  const signature = await trader.account.signMessage({ message: publishMessage(digest, issuedAt) });
  const response = await fetch(`${backendUrl}/strategies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: trader.address, network: hlNetwork, card, issuedAt, signature }),
  });
  const data = (await response.json()) as { id?: string; error?: string };
  if (!response.ok || !data.id) throw new Error(data.error ?? `Share failed (${response.status})`);
  return { id: data.id };
}
