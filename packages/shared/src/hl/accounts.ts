import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import { getAccount } from "./positions.js";
import { getSpotBalances } from "./spot.js";
import { moveUsd } from "./transfers.js";

export type Venue = "perp" | "xyz" | "spot";

export const venues: { key: Venue; label: string; hint: string }[] = [
  { key: "perp", label: "Crypto trading", hint: "Margin for BTC, ETH and other crypto markets, and where deposits land." },
  { key: "xyz", label: "Stocks and commodities", hint: "Margin for the xyz markets: stocks, gold, oil and indices." },
  { key: "spot", label: "Spot and floors", hint: "Where floors are lent from, and where closed floors return." },
];

export type Balances = Record<Venue, number>;

export async function loadBalances(info: InfoClient, user: `0x${string}`): Promise<Balances> {
  const [perp, xyz, spot] = await Promise.all([getAccount(info, user, ""), getAccount(info, user, "xyz"), getSpotBalances(info, user)]);
  return { perp: perp.withdrawable, xyz: xyz.withdrawable, spot: spot.find((b) => b.coin === "USDC")?.available ?? 0 };
}

export async function moveFunds(exchange: ExchangeClient, user: `0x${string}`, amountUsd: number, from: Venue, to: Venue) {
  if (from === to) throw new Error("Pick two different balances.");
  if (!(amountUsd > 0)) throw new Error("Enter an amount.");
  const amount = String(Math.floor(amountUsd * 1e6) / 1e6);
  if (from === "spot" && to === "perp") return moveUsd(exchange, Number(amount), true);
  if (from === "perp" && to === "spot") return moveUsd(exchange, Number(amount), false);
  if (from === "perp" && to === "xyz") return exchange.sendAsset({ destination: user, sourceDex: "", destinationDex: "xyz", token: "USDC", amount });
  if (from === "xyz" && to === "perp") return exchange.sendAsset({ destination: user, sourceDex: "xyz", destinationDex: "", token: "USDC", amount });
  if (from === "spot" && to === "xyz") {
    await moveUsd(exchange, Number(amount), true);
    return exchange.sendAsset({ destination: user, sourceDex: "", destinationDex: "xyz", token: "USDC", amount });
  }
  await exchange.sendAsset({ destination: user, sourceDex: "xyz", destinationDex: "", token: "USDC", amount });
  return moveUsd(exchange, Number(amount), false);
}

export type TradingKey = { address: `0x${string}`; name: string; validUntil: number | null };

export async function listTradingKeys(info: InfoClient, user: `0x${string}`): Promise<TradingKey[]> {
  const agents = await info.extraAgents({ user });
  return agents.map((a) => ({ address: a.address, name: a.name, validUntil: a.validUntil }));
}

export function revokeTradingKey(exchange: ExchangeClient, name: string) {
  return exchange.approveAgent({ agentAddress: "0x0000000000000000000000000000000000000000", agentName: name });
}
