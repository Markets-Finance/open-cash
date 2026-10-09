import type { InfoClient } from "@nktkas/hyperliquid";
import { getAccount, type HlPosition } from "../hl/positions.js";
import type { Bin } from "./types.js";

export type BinPosition = {
  bin: Bin;
  legs: HlPosition[];
  margin: number;
  notional: number;
  pnl: number;
};

export async function fetchBinPosition(
  info: InfoClient,
  user: `0x${string}`,
  bin: Bin,
): Promise<BinPosition | null> {
  const dexes = [...new Set(bin.legs.map((leg) => (leg.symbol.includes(":") ? leg.symbol.split(":")[0] : "")))];
  const accounts = await Promise.all(dexes.map((dex) => getAccount(info, user, dex)));
  const symbols = new Set(bin.legs.map((leg) => leg.symbol));
  const legs = accounts.flatMap((account) => account.positions.filter((p) => symbols.has(p.coin)));
  if (legs.length === 0) return null;
  return {
    bin,
    legs,
    margin: legs.reduce((sum, p) => sum + p.marginUsed, 0),
    notional: legs.reduce((sum, p) => sum + Math.abs(p.positionValue), 0),
    pnl: legs.reduce((sum, p) => sum + p.unrealizedPnl, 0),
  };
}
