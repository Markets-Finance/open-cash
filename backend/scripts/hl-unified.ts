import { privateKeyToAccount } from "viem/accounts";
import { closeBin, createHlExchange, createHlInfo, getAccount, listMarkets, openBin, planBin, hlBinInputSource } from "shared";

const network = "testnet";
const hex = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
const main = privateKeyToAccount(hex(process.env.MAIN_PRIVATE_KEY ?? ""));
const agent = privateKeyToAccount(hex(process.env.HL_TESTNET_AGENT_KEY ?? ""));
const info = createHlInfo(network);
const mainExchange = createHlExchange(network, main);
const agentExchange = createHlExchange(network, agent);
const user = main.address;

async function state(label: string) {
  const [mode, perp, xyz, spot, lend] = await Promise.all([
    info.userAbstraction({ user }),
    getAccount(info, user, ""),
    getAccount(info, user, "xyz"),
    info.spotClearinghouseState({ user }),
    info.borrowLendUserState({ user }),
  ]);
  const usdc = spot.balances.find((b) => b.coin === "USDC");
  const supplied = lend.tokenToState.find(([token]) => token === 0)?.[1].supply.value ?? "0";
  console.log(`${label}: mode ${mode} | perp equity ${perp.equity.toFixed(2)} withdrawable ${perp.withdrawable.toFixed(2)} | xyz equity ${xyz.equity.toFixed(2)} withdrawable ${xyz.withdrawable.toFixed(2)} | spot USDC total ${usdc?.total ?? 0} hold ${usdc?.hold ?? 0} | lent ${supplied} | positions ${[...perp.positions, ...xyz.positions].map((p) => `${p.coin} ${p.size}`).join(", ") || "none"}`);
  return { mode, xyz };
}

const start = await state("start");
if (start.xyz.positions.some((p) => p.coin === "xyz:GOLD")) throw new Error("Refusing: xyz:GOLD already open");

if (start.mode !== "unifiedAccount") {
  console.log("switch:", JSON.stringify(await mainExchange.userSetAbstraction({ user, abstraction: "unifiedAccount" })));
  await state("after switch");
}

const markets = new Map((await Promise.all(["", "xyz"].map((dex) => listMarkets(info, dex)))).flat().filter((m) => m.markPx > 0).map((m) => [m.name, m]));
const plan = await planBin(hlBinInputSource(info), { id: "t", name: "t", thesis: "", legs: [{ symbol: "xyz:GOLD", direction: "long", weightBps: 10000, leverage: 2 }] }, 10, markets, "fixed");
const leg = plan.sized.legs[0];
if (!leg || leg.notional > 30) throw new Error(`Refusing: leg ${leg?.notional}`);
console.log("open:", JSON.stringify(await openBin(agentExchange, plan.sized, markets, { maxNotionalUsd: 30, slippage: 0.01 })));
const opened = await state("after gold open");
const gold = (await getAccount(info, user, "xyz")).positions.filter((p) => p.coin === "xyz:GOLD");
console.log("close:", JSON.stringify(await closeBin(agentExchange, gold, markets, { maxNotionalUsd: 30, slippage: 0.01 })));
await state("after gold close");

try {
  await agentExchange.borrowLend({ operation: "supply", token: 0, amount: "5" });
  await state("after lend 5");
  await agentExchange.borrowLend({ operation: "withdraw", token: 0, amount: null });
  await state("after withdraw");
} catch (error) {
  console.log("lend error:", error instanceof Error ? error.message : String(error));
}
void opened;
