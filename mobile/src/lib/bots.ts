import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createBot,
  createBotRuntime,
  createToolbox,
  defaultLimits,
  perpl,
  ruleDrafter,
  type Bot,
  type BotMode,
  type BotRuntime,
  type TradingAccount,
} from "shared";
import { pulseList } from "./nansen";
import { terminal } from "./perpl";

export const toolbox = createToolbox(perpl.createPerplApi(perpl.perplTestnet.apiUrl), defaultLimits);
toolbox.setSmartMoney(pulseList);

let runtime: BotRuntime | null = null;
let owner: string | null = null;
let signer: TradingAccount | null = null;
let current: Bot[] = [];
const listeners = new Set<(bots: Bot[]) => void>();

function notify(bots: Bot[]) {
  current = bots;
  listeners.forEach((listener) => listener(bots));
}

export function subscribeBots(listener: (bots: Bot[]) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export async function startBots(trader: TradingAccount): Promise<void> {
  runtime?.stop();
  owner = trader.address;
  signer = trader;
  const key = `opencash.bots.${trader.address.toLowerCase()}`;
  runtime = createBotRuntime({
    terminal,
    toolbox,
    trader,
    onChange: notify,
    smartPulses: pulseList,
    storage: {
      load: async () => {
        try {
          return JSON.parse((await AsyncStorage.getItem(key)) ?? "[]") as Bot[];
        } catch {
          return [];
        }
      },
      save: (bots) => AsyncStorage.setItem(key, JSON.stringify(bots)),
    },
  });
  await runtime.init();
  runtime.start();
}

export const currentOwner = () => owner;
export const currentTrader = () => signer;

export function stopBots(): void {
  runtime?.stop();
  owner = null;
  signer = null;
  runtime = null;
  notify([]);
}

export async function draftBot(prompt: string, mode: BotMode, signal: "nansen" | null = null): Promise<string | null> {
  const symbols = (await toolbox.getMarkets()).map((m) => m.symbol);
  const card = await ruleDrafter(prompt, symbols);
  if (card === null || runtime === null) {
    return `Name a market and a side, like "long MON short BTC 2x $100 stop 8%". Markets: ${symbols.join(", ")}.`;
  }
  await runtime.add(createBot(card.name, mode, signal ? { ...card, signal } : card, Date.now()));
  return null;
}

export async function addBotFromCard(card: Bot["card"], mode: BotMode): Promise<void> {
  if (runtime === null) throw new Error("Bots are not running yet");
  await runtime.add(createBot(card.name, mode, card, Date.now()));
}

export const setBotEnabled = (id: string, enabled: boolean) => runtime?.setEnabled(id, enabled);
export const removeBot = (id: string) => runtime?.remove(id);
export const updateBotRules = (id: string, rules: Partial<Bot["rules"]>) =>
  runtime?.update(id, (bot) => ({ ...bot, rules: { ...bot.rules, ...rules } }));
