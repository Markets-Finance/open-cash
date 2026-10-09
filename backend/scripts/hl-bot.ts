import { privateKeyToAccount } from "viem/accounts";
import {
  createBot,
  createHlBotDeps,
  createHlExchange,
  createHlInfo,
  createToolbox,
  defaultLimits,
  getAccount,
  tickBot,
  type StrategyCard,
} from "shared";

const network = "testnet";
const hex = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
const main = privateKeyToAccount(hex(process.env.MAIN_PRIVATE_KEY ?? ""));
const agent = privateKeyToAccount(hex(process.env.HL_TESTNET_AGENT_KEY ?? ""));
const info = createHlInfo(network);
const toolbox = createToolbox(info, defaultLimits, main.address);
const deps = createHlBotDeps({ info, exchange: createHlExchange(network, agent), user: main.address, toolbox, maxNotionalUsd: 10.5, slippage: 0.01, builder: { address: main.address, feeTenthsBps: 10 } });

async function flat(label: string) {
  const positions = (await Promise.all(["", "xyz"].map((d) => getAccount(info, main.address, d)))).flatMap((a) => a.positions);
  console.log(`${label}: ${positions.length ? positions.map((p) => `${p.coin} ${p.size}`).join(", ") : "flat"}`);
  return positions.length === 0;
}

const card = (legs: StrategyCard["legs"], marginUsd: number): StrategyCard => ({ name: "Test bot", thesis: "testnet check", kind: "basket", marginUsd, stopLossPct: 0.01, legs });

if (!(await flat("start"))) throw new Error("Refusing to run: account not flat");
let bot = { ...createBot("Cycle", "auto", card([{ symbol: "ETH", direction: "long", weightBps: 5000, leverage: 3 }, { symbol: "xyz:GOLD", direction: "long", weightBps: 5000, leverage: 3 }], 6.9), Date.now()), enabled: true, status: "watching" as const };
bot = await tickBot(bot, deps);
console.log("tick 1:", bot.status, "|", bot.log[0]?.message, "|", bot.lastCheck?.message);
await flat("after tick 1");
bot = await tickBot(bot, deps);
console.log("tick 2:", bot.status, "|", bot.log[0]?.message, "| realized", bot.realizedPnlUsd.toFixed(4));
if (!(await flat("after tick 2"))) throw new Error("Not flat after cycle");

let rb = { ...createBot("Rollback", "auto", card([{ symbol: "ETH", direction: "long", weightBps: 5000, leverage: 3 }, { symbol: "xyz:NVDA", direction: "long", weightBps: 5000, leverage: 3 }], 6.9), Date.now()), enabled: true, status: "watching" as const };
rb = await tickBot(rb, deps);
console.log("rollback tick:", rb.status, "| errors", rb.errorStreak, "|", rb.log[0]?.message);
await flat("after rollback");
