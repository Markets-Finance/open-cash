import { privateKeyToAccount } from "viem/accounts";
import {
  closeBin,
  createHlExchange,
  createHlInfo,
  customBin,
  fetchBinPosition,
  hlBinInputSource,
  listMarkets,
  openBin,
  planBin,
} from "shared";

const network = "testnet";
const maxNotionalUsd = 10.5;
const hex = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
const main = privateKeyToAccount(hex(process.env.MAIN_PRIVATE_KEY ?? ""));
const agent = privateKeyToAccount(hex(process.env.HL_TESTNET_AGENT_KEY ?? ""));
const info = createHlInfo(network);
const agentX = createHlExchange(network, agent);
const options = { maxNotionalUsd, slippage: 0.01, builder: { address: main.address, feeTenthsBps: 10 } };

const markets = new Map([...(await listMarkets(info, "")), ...(await listMarkets(info, "xyz"))].map((m) => [m.name, m]));
const bin = customBin([{ symbol: "ETH", direction: "long" }, { symbol: "xyz:GOLD", direction: "long" }], "fixed", 3, "Test bin");
const plan = await planBin(hlBinInputSource(info), bin, 6.9, markets);
console.log("plan", plan.sized.legs.map((l) => `${l.leg.symbol} size ${l.size} notional $${l.notional.toFixed(2)} at ${l.leverage}x`).join(" | "), "| issues", plan.issues.map((i) => i.detail).join(" ; ") || "none");

const existing = await fetchBinPosition(info, main.address, bin);
if (existing) throw new Error(`Refusing to open: ${existing.legs.map((p) => p.coin).join(", ")} already has a position`);
const opened = await openBin(agentX, plan.sized, markets, options);
console.log("open legs", JSON.stringify(opened));
const position = await fetchBinPosition(info, main.address, bin);
console.log("bin position", position ? `${position.legs.map((p) => `${p.coin} ${p.size} ${p.leverageType} ${p.leverage}x`).join(", ")} margin $${position.margin.toFixed(2)} notional $${position.notional.toFixed(2)} pnl $${position.pnl.toFixed(4)}` : "none");
if (position) {
  const closed = await closeBin(agentX, position.legs, markets, options);
  console.log("close legs", JSON.stringify(closed));
}
console.log("after", JSON.stringify((await fetchBinPosition(info, main.address, bin))?.legs.map((p) => [p.coin, p.size]) ?? "flat"));
