import AsyncStorage from "@react-native-async-storage/async-storage";
import { createHlExchange, createHlInfo, type TradingAccount } from "shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export const hlNetwork = "testnet";
export const info = createHlInfo(hlNetwork);

const agentName = "OpenCash";
const keyFor = (owner: string) => `opencash.hl.agent.${hlNetwork}.${owner.toLowerCase()}`;

export type HlExchange = ReturnType<typeof createHlExchange>;

export function mainExchange(trader: TradingAccount): HlExchange {
  return createHlExchange(hlNetwork, trader.account);
}

export async function agentReady(trader: TradingAccount): Promise<boolean> {
  const key = (await AsyncStorage.getItem(keyFor(trader.address))) as `0x${string}` | null;
  if (!key) return false;
  const agents = await info.extraAgents({ user: trader.address });
  const address = privateKeyToAccount(key).address.toLowerCase();
  const now = Date.now();
  return agents.some((a) => a.address.toLowerCase() === address && (a.validUntil === null || a.validUntil > now));
}

export async function agentExchange(trader: TradingAccount): Promise<HlExchange> {
  let key = (await AsyncStorage.getItem(keyFor(trader.address))) as `0x${string}` | null;
  if (!key || !(await agentReady(trader))) {
    key = generatePrivateKey();
    await mainExchange(trader).approveAgent({ agentAddress: privateKeyToAccount(key).address, agentName });
    await AsyncStorage.setItem(keyFor(trader.address), key);
  }
  return createHlExchange(hlNetwork, privateKeyToAccount(key));
}
