import type { TradingAccount } from "shared";

export const session: { trader: TradingAccount | null } = { trader: null };

export function requireTrader(): TradingAccount {
  if (session.trader === null) throw new Error("Not signed in.");
  return session.trader;
}
