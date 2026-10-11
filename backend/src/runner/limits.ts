import { createHlInfo, getAccount, getSpotBalances, hlDexes, type HlNetwork } from "shared";

export const maxBotsPerOwner = 3;
export const minMainnetBalanceUsd = 10;

export async function balanceUsd(owner: string, net: HlNetwork): Promise<number> {
  const info = createHlInfo(net);
  const user = owner as `0x${string}`;
  const [accounts, spot] = await Promise.all([
    Promise.all(hlDexes.map((dex) => getAccount(info, user, dex))),
    getSpotBalances(info, user),
  ]);
  return accounts.reduce((sum, account) => sum + account.equity, 0) + (spot.find((b) => b.coin === "USDC")?.total ?? 0);
}

export async function botLimitIssue(owner: string, net: HlNetwork, existing: number): Promise<string | null> {
  if (existing >= maxBotsPerOwner) return `At most ${maxBotsPerOwner} bots per wallet`;
  if (net !== "mainnet") return null;
  try {
    const balance = await balanceUsd(owner, net);
    if (balance < minMainnetBalanceUsd) return `Mainnet bots need at least $${minMainnetBalanceUsd} in your account. Yours is $${balance.toFixed(2)}`;
    return null;
  } catch {
    return "Could not read your mainnet balance. Try again";
  }
}
