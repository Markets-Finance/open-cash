import type { Address, Hex } from "viem";
import type { HlNetwork } from "../hl/client.js";
import type { StrategyCard } from "../strategy/types.js";

export type SharedStrategy = {
  id: string;
  card: StrategyCard;
  author: Address;
  createdAt: number;
};

export type CopyRecord = {
  id: string;
  strategyId: string;
  follower: Address;
  network: HlNetwork;
  isAuthor: boolean;
  declaredMarginUsd: number;
  startMs: number;
  stopMs: number | null;
  countedThroughMs: number;
  netPnlUsd: number;
  feesUsd: number;
  fundingUsd: number;
  volumeUsd: number;
  closedTrades: number;
  wins: number;
};

export type StrategyScore = {
  strategyId: string;
  followers: number;
  activeFollowers: number;
  qualifyingFollowers: number;
  medianRoiPct: number | null;
  totalFollowerPnlUsd: number;
  winRate: number | null;
  authorRoiPct: number | null;
  ranked: boolean;
};

export type SignedAction = { address: Address; message: string; signature: Hex };

export const minQualifyingFollowers = 2;
