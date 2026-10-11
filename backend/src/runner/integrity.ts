import { botDigest, botMandateMessage, createHlInfo, type HlNetwork } from "shared";
import { verifyMessage, type Address } from "viem";
import type { ServerBot } from "./store.js";

export async function mandateIssue(bot: ServerBot): Promise<string | null> {
  if (botDigest(bot.card, bot.mode) !== bot.mandate.digest) return "Bot card no longer matches its signed mandate";
  const message = botMandateMessage(bot.owner, bot.net, bot.mandate.digest, bot.mandate.issuedAt);
  const valid = await verifyMessage({ address: bot.owner as Address, message, signature: bot.mandate.signature as `0x${string}` }).catch(() => false);
  return valid ? null : "Stored mandate signature is not from the owner";
}

export async function agentIssue(owner: string, net: HlNetwork, agentAddress: string): Promise<string | null> {
  const agents = await createHlInfo(net).extraAgents({ user: owner as `0x${string}` });
  const listed = agents.some((agent) => agent.address.toLowerCase() === agentAddress.toLowerCase());
  return listed ? null : "Hyperliquid no longer lists this agent key as approved";
}
