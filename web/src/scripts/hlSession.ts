import type { TradingAccount } from "shared";
import { createHlExchange } from "shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hlNetwork, info } from "./hl";

const agentName = "OpenCash";
const keyFor = (owner: string) => `opencash.hl.agent.${hlNetwork}.${owner.toLowerCase()}`;

function storedKey(owner: string): `0x${string}` | null {
  try {
    return localStorage.getItem(keyFor(owner)) as `0x${string}` | null;
  } catch {
    return null;
  }
}

function saveKey(owner: string, key: `0x${string}`) {
  try {
    localStorage.setItem(keyFor(owner), key);
  } catch {
    throw new Error("This browser blocks storage, so trading cannot be set up.");
  }
}

export function mainExchange(trader: TradingAccount) {
  return createHlExchange(hlNetwork, trader.account);
}

export async function agentReady(trader: TradingAccount): Promise<boolean> {
  const key = storedKey(trader.address);
  if (!key) return false;
  const agents = await info.extraAgents({ user: trader.address });
  const now = Date.now();
  return agents.some((a) => a.address.toLowerCase() === privateKeyToAccount(key).address.toLowerCase() && (a.validUntil === null || a.validUntil > now));
}

export async function agentExchange(trader: TradingAccount) {
  let key = storedKey(trader.address);
  if (!key || !(await agentReady(trader))) {
    key = generatePrivateKey();
    await mainExchange(trader).approveAgent({ agentAddress: privateKeyToAccount(key).address, agentName });
    saveKey(trader.address, key);
  }
  return createHlExchange(hlNetwork, privateKeyToAccount(key));
}
