import { privateKeyToAccount } from "viem/accounts";
import { clampParams, closeLive, createHlExchange, createHlInfo, createHlLiveDeps, createLiveBot, pauseLive, templateById, tickLive, type LiveBot, type LiveDeps, type LiveSpec } from "shared";

const network = "testnet";
const symbol = "ETH";
const resolution = 300;
const maxTestOrderUsd = 20;
const hex = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
const main = privateKeyToAccount(hex(process.env.MAIN_PRIVATE_KEY ?? ""));
const agent = privateKeyToAccount(hex(process.env.HL_TESTNET_AGENT_KEY ?? ""));
const info = createHlInfo(network);
const real = createHlLiveDeps({ info, exchange: createHlExchange(network, agent), user: main.address });

const deps: LiveDeps = {
  ...real,
  enter: async (s, usd, options) => {
    if (Math.abs(usd) > maxTestOrderUsd) throw new Error(`Test cap: refusing $${Math.abs(usd).toFixed(2)}`);
    return real.enter(s, usd, options);
  },
  placeLimits: async (s, orders, leverage) => {
    if (orders.some((o) => Math.abs(o.usd) > maxTestOrderUsd)) throw new Error("Test cap: refusing a resting order");
    return real.placeLimits(s, orders, leverage);
  },
};

async function state(label: string) {
  const position = await real.position(symbol);
  const orders = (await info.frontendOpenOrders({ user: main.address })).filter((o) => o.coin === symbol);
  const described = orders.map((o) => `${o.orderType} ${o.side === "B" ? "buy" : "sell"} ${o.sz}@${o.isTrigger ? o.triggerPx : o.limitPx}`);
  console.log(`${label}: position ${position.qty} @ ${position.avgPx} | open orders: ${described.length ? described.join(", ") : "none"}`);
  return { position, orders };
}

function primed(spec: LiveSpec): LiveBot {
  const now = Date.now();
  const span = resolution * 1000;
  return { ...createLiveBot(spec, now), enabled: true, status: "watching", startedAt: now - span, lastCandleTime: Math.floor(now / span) * span - 2 * span };
}

function show(bot: LiveBot) {
  for (const entry of [...bot.log].reverse()) console.log(`   [${entry.level}] ${entry.message}`);
  console.log(`   status ${bot.status}, orders sent ${bot.orders}, stop ${bot.stop ? bot.stop.px : "none"}, resting ${bot.resting.length}`);
}

const agents = await info.extraAgents({ user: main.address });
if (!agents.some((a) => a.address.toLowerCase() === agent.address.toLowerCase())) throw new Error("Refusing to run: the testnet agent key is not approved for the main account");
const start = await state("start");
if (start.position.qty !== 0 || start.orders.length > 0) throw new Error(`Refusing to run: ${symbol} is not flat or has open orders`);

console.log("1. Trailing stop: market entry and exchange stop");
let trail = primed({ templateId: "trail", symbol, resolution, params: clampParams(templateById("trail"), { side: 1, trailPct: 5, targetPct: 0, leverage: 1 }), allocationUsd: 10.5, leverage: 1 });
trail = await tickLive(trail, deps);
show(trail);
await state("after entry");

console.log("2. Stop and close");
trail = await closeLive(trail, deps, Date.now());
show(trail);
const afterClose = await state("after close");

console.log("3. Grid: resting limit orders, then pause cancels them");
let grid = primed({ templateId: "grid", symbol, resolution, params: clampParams(templateById("grid"), { rangePct: 10, levels: 3, usdPerLevel: 11 }), allocationUsd: 40, leverage: 1 });
grid = await tickLive(grid, deps);
show(grid);
await state("after grid");
grid = await pauseLive(grid, deps, Date.now());
show(grid);
const end = await state("end");

const clean = end.position.qty === 0 && end.orders.length === 0 && afterClose.position.qty === 0;
console.log(clean ? "TESTNET TRIAL PASSED: flat, nothing left open" : "TESTNET TRIAL LEFT SOMETHING OPEN — check above");
