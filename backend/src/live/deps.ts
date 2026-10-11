import { botMandateMessage, createHlExchange, createHlInfo, createHlLiveDeps, listMarkets, liveDigest, type HlBuilder, type HlNetwork, type LiveDeps, type LivePosition } from "shared";
import { verifyMessage, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { guardrailStatus } from "../guardrails/store.js";
import { loadKey } from "../runner/vault.js";
import type { ServerLiveBot } from "./store.js";

export function builderFee(): HlBuilder | undefined {
  return process.env.BUILDER_ADDRESS ? { address: process.env.BUILDER_ADDRESS as `0x${string}`, feeTenthsBps: Number(process.env.BUILDER_FEE_TENTHS_BPS ?? 10) } : undefined;
}

function guardFor(owner: string, net: HlNetwork) {
  return async (maxLossUsd: number | null) => {
    const { verdict } = await guardrailStatus(owner, net, maxLossUsd);
    return { allowed: verdict.allowed, reason: verdict.reason };
  };
}

export async function liveDepsFor(owner: string, net: HlNetwork): Promise<LiveDeps> {
  const stored = await loadKey(owner, net);
  if (!stored) throw new Error("No agent key saved for this wallet");
  return createHlLiveDeps({
    info: createHlInfo(net),
    exchange: createHlExchange(net, privateKeyToAccount(`0x${stored.secretHex}`)),
    user: owner as `0x${string}`,
    builder: builderFee(),
    guard: guardFor(owner, net),
  });
}

export function dryRunDeps(owner: string, net: HlNetwork, intents: string[]): LiveDeps {
  const info = createHlInfo(net);
  const reads = createHlLiveDeps({ info, exchange: null as never, user: owner as `0x${string}`, guard: guardFor(owner, net) });
  const px = (value: number) => Number(value.toPrecision(6));
  let virtual: LivePosition | null = null;
  let nextOid = 1;
  return {
    ...reads,
    position: async (symbol) => virtual ?? reads.position(symbol),
    enter: async (symbol, usd, { reduceOnly }) => {
      const dex = symbol.includes(":") ? symbol.split(":")[0]! : "";
      const mark = (await listMarkets(info, dex)).find((m) => m.name === symbol)?.markPx ?? 0;
      const held = virtual ?? (await reads.position(symbol));
      if (mark > 0) virtual = { qty: held.qty + usd / mark, avgPx: mark };
      intents.push(`${usd > 0 ? "Buy" : "Sell"} $${Math.abs(usd).toFixed(2)} at market${reduceOnly ? " (reduce only)" : ""}`);
    },
    exit: async () => {
      virtual = { qty: 0, avgPx: 0 };
      intents.push("Close the whole position at market");
    },
    placeStop: async (_symbol, triggerPx) => {
      intents.push(`Place a stop at ${px(triggerPx)}`);
      return nextOid++;
    },
    cancel: async (_symbol, oids) => void (oids.length > 0 && intents.push(`Cancel ${oids.length} order${oids.length === 1 ? "" : "s"}`)),
    placeLimits: async (_symbol, orders) => {
      for (const o of orders) intents.push(`Rest a ${o.usd > 0 ? "buy" : "sell"} of $${Math.abs(o.usd).toFixed(2)} at ${px(o.px)}`);
      return orders.map(() => nextOid++);
    },
  };
}

export async function liveMandateIssue(bot: ServerLiveBot): Promise<string | null> {
  if (liveDigest(bot) !== bot.mandate.digest) return "Bot settings no longer match the signed mandate";
  const message = botMandateMessage(bot.owner, bot.net, bot.mandate.digest, bot.mandate.issuedAt);
  const valid = await verifyMessage({ address: bot.owner as Address, message, signature: bot.mandate.signature as `0x${string}` }).catch(() => false);
  return valid ? null : "Stored mandate signature is not from the owner";
}
