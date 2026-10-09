import { followMessage, type StrategyCard } from "shared";
import { addBotFromCard, currentTrader } from "./bots";
import { backendUrl } from "./config";


export type RankRow = {
  rank: number;
  accountId: number;
  address: string | null;
  handle: string | null;
  netPnlUsd: number;
  volumeUsd: number;
  closedTrades: number;
  winRate: number;
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

export const loadBoard = () => get<Board>("/leaderboard?limit=50");
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
    body: JSON.stringify({ address: trader.address, marginUsd, issuedAt, signature }),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Follow failed (${response.status})`);
  await addBotFromCard(row.card, "auto");
}
