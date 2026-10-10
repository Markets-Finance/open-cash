import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createBot,
  createBotRuntime,
  createHlBotDeps,
  createToolbox,
  defaultLimits,
  maxOrderNotionalUsd,
  ruleDrafter,
  type Bot,
  type BotMode,
  type BotRuntime,
  type TradingAccount,
} from "shared";
import { guardForBot } from "./guardrails";
import { agentExchange, agentReady, info } from "./hl";

export const toolbox = createToolbox(info, defaultLimits);

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

async function ensureRuntime(): Promise<BotRuntime> {
  if (runtime) return runtime;
  if (!signer) throw new Error("Not signed in.");
  const trader = signer;
  const exchange = await agentExchange(trader);
  const key = `opencash.bots.${trader.address.toLowerCase()}`;
  runtime = createBotRuntime({
    deps: createHlBotDeps({ info, exchange, user: trader.address, toolbox, maxNotionalUsd: maxOrderNotionalUsd, guard: guardForBot }),
    onChange: notify,
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
  return runtime;
}

export async function startBots(trader: TradingAccount): Promise<void> {
  runtime?.stop();
  runtime = null;
  owner = trader.address;
  signer = trader;
  if (await agentReady(trader).catch(() => false)) await ensureRuntime();
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

export async function draftBot(prompt: string, mode: BotMode): Promise<string | null> {
  const names = (await toolbox.getMarkets()).map((m) => m.name);
  const card = await ruleDrafter(prompt, names);
  if (card === null) {
    return `Name a market and a side, like "long ETH short BTC 2x $100 stop 8%". Markets: ${names.slice(0, 12).join(", ")}.`;
  }
  const active = await ensureRuntime();
  await active.add(createBot(card.name, mode, card, Date.now()));
  return null;
}

export async function addBotFromCard(card: Bot["card"], mode: BotMode): Promise<void> {
  const active = await ensureRuntime();
  await active.add(createBot(card.name, mode, card, Date.now()));
}

export const setBotEnabled = async (id: string, enabled: boolean) => (await ensureRuntime()).setEnabled(id, enabled);
export const removeBot = async (id: string) => (await ensureRuntime()).remove(id);
export const updateBotRules = async (id: string, rules: Partial<Bot["rules"]>) =>
  (await ensureRuntime()).update(id, (bot) => ({ ...bot, rules: { ...bot.rules, ...rules } }));
