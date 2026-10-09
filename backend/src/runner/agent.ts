import { randomUUID } from "node:crypto";
import { agentKeyMessage, createHlInfo, freshSignature, type HlNetwork } from "shared";
import { verifyMessage, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { saveKey } from "./vault.js";

const ttlMs = 10 * 60_000;
export const agentName = "opencash-bots";

type Pending = { owner: Address; net: HlNetwork; privateKey: `0x${string}`; agentAddress: Address; expiresAt: number };

const pending = new Map<string, Pending>();

function prune(now: number) {
  for (const [id, entry] of pending) if (entry.expiresAt < now) pending.delete(id);
}

export function startAgent(owner: Address, net: HlNetwork) {
  prune(Date.now());
  const privateKey = generatePrivateKey();
  const agentAddress = privateKeyToAccount(privateKey).address;
  const id = randomUUID();
  const expiresAt = Date.now() + ttlMs;
  pending.set(id, { owner, net, privateKey, agentAddress, expiresAt });
  return { id, agentAddress, agentName, expiresAt };
}

export async function finishAgent(id: string, issuedAt: number, signature: string) {
  prune(Date.now());
  const entry = pending.get(id);
  if (!entry) throw new Error("This agent request expired. Start again.");
  if (!freshSignature(issuedAt)) throw new Error("Signature expired");
  const message = agentKeyMessage(entry.owner, entry.net, entry.agentAddress, issuedAt);
  const valid = await verifyMessage({ address: entry.owner, message, signature: signature as `0x${string}` }).catch(() => false);
  if (!valid) throw new Error("The signature is not from that wallet");
  const agents = await createHlInfo(entry.net).extraAgents({ user: entry.owner });
  const approved = agents.some((agent) => agent.address.toLowerCase() === entry.agentAddress.toLowerCase());
  if (!approved) throw new Error("Hyperliquid does not list this agent as approved yet. Approve it, then try again.");
  await saveKey(entry.owner, entry.net, entry.agentAddress, entry.privateKey.slice(2));
  pending.delete(id);
  return { ok: true as const, agentAddress: entry.agentAddress };
}
