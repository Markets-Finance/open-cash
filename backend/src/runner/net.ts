import type { HlNetwork } from "shared";

export function parseNet(value: unknown): HlNetwork | null {
  if (value === "testnet") return "testnet";
  if (value === "mainnet" && process.env.BOT_RUNNER_ALLOW_MAINNET === "true") return "mainnet";
  return null;
}
