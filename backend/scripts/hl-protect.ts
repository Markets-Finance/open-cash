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
const deps = createHlBotDeps({ info, exchange: createHlExchange(network, agent), user: main.address, toolbox, maxNotionalUsd: 30, slippage: 0.01 });

async function state(label: string) {
  const [account, orders] = await Promise.all([getAccount(info, main.address, ""), info.frontendOpenOrders({ user: main.address })]);
  const eth = account.positions.find((p) => p.coin === "ETH");
  const triggers = orders.filter((o) => o.coin === "ETH" && o.isTrigger).map((o) => `${o.orderType} @ ${o.triggerPx} sz ${o.sz}`);
  console.log(`${label}: ETH ${eth ? `${eth.size} @ ${eth.entryPx}, ${eth.leverage}x` : "flat"} | triggers: ${triggers.join(", ") || "none"}`);
  return { eth, triggers };
}

if ((await state("start")).eth) throw new Error("Refusing to run: ETH position already open");
const card = { name: "Protect test", thesis: "testnet check", kind: "basket", marginUsd: 10, stopLossPct: 8, takeProfitPct: 12, legs: [{ symbol: "ETH", direction: "long", weightBps: 10000, leverage: 2 }] } as StrategyCard;
let bot = { ...createBot("Protect", "auto", card, Date.now()), enabled: true, status: "watching" as const };

bot = await tickBot(bot, deps);
console.log("tick 1:", bot.status, "|", bot.log[0]?.message);
const opened = await state("after open");

bot = await tickBot(bot, deps);
console.log("tick 2:", bot.status, "|", bot.log[0]?.message, "|", bot.lastCheck?.message);
const again = await state("after tick 2");
if (again.triggers.length !== opened.triggers.length) throw new Error("Second tick changed the triggers");

await deps.close(card);
await new Promise((r) => setTimeout(r, 2000));
const end = await state("after close");
for (const o of (await info.frontendOpenOrders({ user: main.address })).filter((o) => o.coin === "ETH" && o.isTrigger)) {
  console.log("left over:", o.orderType, o.oid);
}
if (end.eth) throw new Error("Not flat after close");
