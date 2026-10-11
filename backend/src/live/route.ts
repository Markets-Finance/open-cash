import type { FastifyInstance } from "fastify";
import {
  botMandateMessage,
  clampParams,
  closeLive,
  createHlInfo,
  createLiveBot,
  createToolbox,
  defaultLimits,
  freshSignature,
  liveActionMessage,
  liveDigest,
  liveIssues,
  liveStopAllMessage,
  pauseLive,
  templateById,
  tickLive,
  type HlNetwork,
  type LiveAction,
  type LiveSpec,
  type Params,
} from "shared";
import { isAddress, verifyMessage, type Address } from "viem";
import { guardrailStatus } from "../guardrails/store.js";
import { agentIssue } from "../runner/integrity.js";
import { botLimitIssue } from "../runner/limits.js";
import { cardBotDeps, runnerActive } from "../runner/loop.js";
import { parseNet } from "../runner/net.js";
import { limited } from "../runner/route.js";
import { listBots, saveBot } from "../runner/store.js";
import { hasKey, loadKey } from "../runner/vault.js";
import { dryRunDeps, liveDepsFor, liveMandateIssue } from "./deps.js";
import { metricsFor } from "./metrics.js";
import { deleteLive, getLive, listLive, saveLive, withLiveLock, type ServerLiveBot } from "./store.js";

const actions: LiveAction[] = ["enable", "pause", "close", "remove"];
const toolboxes = new Map<HlNetwork, ReturnType<typeof createToolbox>>();

function toolboxFor(net: HlNetwork) {
  let toolbox = toolboxes.get(net);
  if (!toolbox) {
    toolbox = createToolbox(createHlInfo(net), defaultLimits);
    toolboxes.set(net, toolbox);
  }
  return toolbox;
}

async function signedBy(owner: string, message: string, signature: string): Promise<boolean> {
  try {
    return await verifyMessage({ address: owner as Address, message, signature: signature as `0x${string}` });
  } catch {
    return false;
  }
}

function publicLive(bot: ServerLiveBot) {
  const { mandate, journal, ...rest } = bot;
  return { ...rest, candlesSeen: journal.length, mandate: { digest: mandate.digest, issuedAt: mandate.issuedAt } };
}

function exactParams(spec: LiveSpec): boolean {
  const clamped = clampParams(templateById(spec.templateId), spec.params);
  const keys = Object.keys(spec.params);
  return keys.length === Object.keys(clamped).length && keys.every((key) => clamped[key] === spec.params[key]);
}

function readSpec(body: Record<string, unknown>): LiveSpec | null {
  const params = body.params;
  if (typeof params !== "object" || params === null || Array.isArray(params)) return null;
  if (!Object.values(params).every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return {
    templateId: body.templateId as LiveSpec["templateId"],
    symbol: String(body.symbol ?? ""),
    resolution: Number(body.resolution),
    params: params as Params,
    allocationUsd: Number(body.allocationUsd),
    leverage: Number(body.leverage),
  };
}

async function symbolClash(bot: ServerLiveBot): Promise<string | null> {
  const live = (await listLive({ owner: bot.owner, net: bot.net, enabled: true })).find((other) => other.id !== bot.id && other.symbol === bot.symbol);
  if (live) return `${bot.symbol} is already traded by the live bot "${live.name}"`;
  const card = (await listBots({ owner: bot.owner, net: bot.net, enabled: true })).find((other) => other.card.legs.some((leg) => leg.symbol === bot.symbol));
  return card ? `${bot.symbol} is already traded by the bot "${card.name}"` : null;
}

export function registerLiveRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { owner?: string; network?: string } }>("/live", async (request, reply) => {
    const owner = request.query.owner ?? "";
    if (!isAddress(owner)) return reply.status(400).send({ error: "owner must be an address" });
    const net = parseNet(request.query.network);
    if (!net) return reply.status(400).send({ error: "network not enabled for bots" });
    const bots = await listLive({ owner, net });
    const metrics = await metricsFor(owner, net, bots).catch(() => new Map());
    return {
      bots: bots.sort((a, b) => b.createdAt - a.createdAt).map((bot) => ({ ...publicLive(bot), metrics: metrics.get(bot.id) ?? null })),
      hasKey: await hasKey(owner, net),
      runner: runnerActive(),
    };
  });

  app.post<{ Body: Record<string, unknown> }>("/live", async (request, reply) => {
    if (limited(request.ip)) return reply.status(429).send({ error: "too many requests" });
    const body = request.body ?? {};
    const owner = String(body.owner ?? "");
    const net = parseNet(body.network);
    const issuedAt = Number(body.issuedAt ?? 0);
    const signature = String(body.signature ?? "");
    if (!net) return reply.status(400).send({ error: "network not enabled for bots" });
    if (!isAddress(owner)) return reply.status(400).send({ error: "owner must be an address" });
    const spec = readSpec(body);
    if (!spec) return reply.status(400).send({ error: "invalid strategy settings" });
    let maxLeverage: number;
    try {
      const market = await toolboxFor(net).getMarket(spec.symbol);
      if (market.name !== spec.symbol) return reply.status(400).send({ error: `Use the exact market name ${market.name}` });
      maxLeverage = market.maxLeverage;
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
    const issues = liveIssues(spec, maxLeverage);
    if (issues.length > 0) return reply.status(400).send({ error: issues.join(" ") });
    if (!exactParams(spec)) return reply.status(400).send({ error: "A strategy setting is out of range" });
    if (!freshSignature(issuedAt)) return reply.status(400).send({ error: "signature expired" });
    const digest = liveDigest(spec);
    if (!(await signedBy(owner, botMandateMessage(owner, net, digest, issuedAt), signature))) return reply.status(401).send({ error: "signature does not match the owner" });
    const existing = (await listBots({ owner })).length + (await listLive({ owner })).length;
    const limitIssue = await botLimitIssue(owner, net, existing);
    if (limitIssue) return reply.status(400).send({ error: limitIssue });
    const bot: ServerLiveBot = { ...createLiveBot(spec, Date.now()), owner, net, mandate: { digest, signature, issuedAt } };
    await saveLive(bot);
    return publicLive(bot);
  });

  app.post<{ Body: { owner?: string; network?: string; close?: boolean; issuedAt?: number; signature?: string } }>("/live/stop-all", async (request, reply) => {
    if (limited(request.ip)) return reply.status(429).send({ error: "too many requests" });
    const { owner = "", close = false, issuedAt = 0, signature = "" } = request.body ?? {};
    const net = parseNet(request.body?.network);
    if (!net) return reply.status(400).send({ error: "network not enabled for bots" });
    if (!isAddress(owner)) return reply.status(400).send({ error: "owner must be an address" });
    if (!freshSignature(issuedAt)) return reply.status(400).send({ error: "signature expired" });
    if (!(await signedBy(owner, liveStopAllMessage(owner, net, close, issuedAt), signature))) return reply.status(401).send({ error: "signature does not match the owner" });
    const failures: string[] = [];
    let stopped = 0;
    const deps = (await hasKey(owner, net)) ? await liveDepsFor(owner, net) : null;
    for (const live of await listLive({ owner, net })) {
      await withLiveLock(live.id, async () => {
        const bot = await getLive(live.id);
        if (!bot) return;
        try {
          const next = deps && (close || bot.resting.length > 0) ? await (close ? closeLive(bot, deps, Date.now()) : pauseLive(bot, deps, Date.now())) : { ...bot, enabled: false, status: bot.status === "halted" ? ("halted" as const) : ("idle" as const) };
          await saveLive({ ...bot, ...next });
          stopped += 1;
        } catch (error) {
          await saveLive({ ...bot, enabled: false, status: "halted" });
          failures.push(`${bot.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
    let cards = 0;
    const key = close ? await loadKey(owner, net) : null;
    const cardDeps = key ? cardBotDeps(owner, net, key.secretHex) : null;
    for (const card of await listBots({ owner, net })) {
      if (!card.enabled && !close) continue;
      let next = { ...card, enabled: false, status: "idle" as const };
      if (close && cardDeps && (await cardDeps.heldLegs(card.card)).length > 0) {
        try {
          await cardDeps.close(card.card);
          next = { ...next, status: "idle", log: [{ at: Date.now(), level: "action" as const, message: "Stopped and closed by stop-all" }, ...card.log].slice(0, 60) };
        } catch (error) {
          failures.push(`${card.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      await saveBot(next);
      cards += 1;
    }
    return { ok: failures.length === 0, liveStopped: stopped, cardBotsStopped: cards, failures, note: close ? "Every bot was stopped and its positions closed at market." : "Positions and exchange stops were left in place." };
  });

  app.get<{ Params: { id: string } }>("/live/:id/preflight", async (request, reply) => {
    if (limited(request.ip)) return reply.status(429).send({ error: "too many requests" });
    const bot = await getLive(request.params.id);
    if (!bot) return reply.status(404).send({ error: "bot not found" });
    const checks: { name: string; ok: boolean; detail: string }[] = [];
    const add = (name: string, issue: string | null, detail = "ok") => checks.push({ name, ok: issue === null, detail: issue ?? detail });
    add("mandate", await liveMandateIssue(bot));
    const stored = await loadKey(bot.owner, bot.net).catch(() => null);
    add("agent key", stored ? await agentIssue(bot.owner, bot.net, stored.agentAddress).catch((e) => String(e)) : "No agent key saved for this wallet");
    add("market", await symbolClash(bot));
    const guard = await guardrailStatus(bot.owner, bot.net).catch(() => null);
    add("guardrails", guard && !guard.verdict.allowed ? guard.verdict.reason : null, guard?.configured ? guard.verdict.reason : "No limits set");
    const intents: string[] = [];
    const span = bot.resolution * 1000;
    const now = Date.now();
    const probe = bot.lastCandleTime === null ? { ...bot, startedAt: now - span, lastCandleTime: Math.floor(now / span) * span - 2 * span } : bot;
    const deps = dryRunDeps(bot.owner, bot.net, intents);
    if (bot.lastCandleTime === null) {
      const held = await deps.position(bot.symbol).catch(() => ({ qty: 0, avgPx: 0 }));
      add("open position", held.qty !== 0 ? `You already hold a ${bot.symbol} position` : null);
    }
    const result = await tickLive({ ...probe, enabled: true, status: probe.status === "halted" ? "watching" : probe.status }, deps);
    const error = result.log.find((l) => l.level === "error" && l.at >= now);
    add("dry run", error ? error.message : null, result.lastCheck?.message ?? "ok");
    return { botId: bot.id, network: bot.net, ready: checks.every((c) => c.ok), checks, intents, sent: false as const };
  });

  app.post<{ Params: { id: string; action: string }; Body: { issuedAt?: number; signature?: string } }>("/live/:id/:action", async (request, reply) => {
    if (limited(request.ip)) return reply.status(429).send({ error: "too many requests" });
    const action = request.params.action as LiveAction;
    if (!actions.includes(action)) return reply.status(400).send({ error: "unknown action" });
    const found = await getLive(request.params.id);
    if (!found) return reply.status(404).send({ error: "bot not found" });
    const { issuedAt = 0, signature = "" } = request.body ?? {};
    if (!freshSignature(issuedAt)) return reply.status(400).send({ error: "signature expired" });
    if (!(await signedBy(found.owner, liveActionMessage(found.id, action, issuedAt), signature))) return reply.status(401).send({ error: "signature does not match the owner" });
    try {
      return await withLiveLock(found.id, async () => {
        const bot = (await getLive(found.id))!;
        const now = Date.now();
        if (action === "enable") {
          if (!(await hasKey(bot.owner, bot.net))) throw new Error("Approve an agent key for this wallet first");
          if (!runnerActive()) throw new Error("The server runner is switched off");
          const clash = await symbolClash(bot);
          if (clash) throw new Error(clash);
          const issue = await liveMandateIssue(bot);
          if (issue) throw new Error(issue);
          if (bot.lastCandleTime === null) {
            const held = await dryRunDeps(bot.owner, bot.net, []).position(bot.symbol);
            if (held.qty !== 0) throw new Error(`You already hold a ${bot.symbol} position. Close it or pick another market.`);
          }
          const next: ServerLiveBot = { ...bot, enabled: true, status: "watching", errorStreak: 0 };
          await saveLive(next);
          return publicLive(next);
        }
        const open = bot.resting.length > 0 || bot.stop !== null || (await dryRunDeps(bot.owner, bot.net, []).position(bot.symbol)).qty !== 0;
        const deps = open && (action !== "pause" || bot.resting.length > 0) ? await liveDepsFor(bot.owner, bot.net) : null;
        if (action === "pause") {
          const next = deps ? await pauseLive(bot, deps, now) : { ...bot, enabled: false, status: bot.status === "halted" ? ("halted" as const) : ("idle" as const) };
          await saveLive({ ...bot, ...next });
          return publicLive({ ...bot, ...next });
        }
        const closed = deps ? await closeLive(bot, deps, now) : { ...bot, enabled: false, status: "idle" as const };
        if (action === "remove") {
          await deleteLive(bot.id);
          return { ok: true, removed: bot.id };
        }
        await saveLive({ ...bot, ...closed });
        return publicLive({ ...bot, ...closed });
      });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
