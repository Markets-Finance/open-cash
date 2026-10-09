import type { FastifyInstance } from "fastify";
import { isAddress, verifyMessage, type Address } from "viem";
import {
  botActionMessage,
  botDigest,
  botMandateMessage,
  cardShapeIssues,
  createBot,
  defaultLimits,
  freshSignature,
  type BotAction,
  type BotMode,
  type StrategyCard,
} from "shared";
import { agentName, finishAgent, startAgent } from "./agent.js";
import { startRunner } from "./loop.js";
import { parseNet } from "./net.js";
import { deleteBot, getBot, listBots, saveBot, type ServerBot } from "./store.js";
import { hasKey } from "./vault.js";

const windowMs = 60_000;
const perWindow = 30;
const hits = new Map<string, { start: number; count: number }>();
const maxBotsPerOwner = 10;

function limited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > windowMs) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > perWindow;
}

async function signedBy(owner: string, message: string, signature: string): Promise<boolean> {
  try {
    return await verifyMessage({ address: owner as Address, message, signature: signature as `0x${string}` });
  } catch {
    return false;
  }
}

function publicBot(bot: ServerBot) {
  const { mandate, ...rest } = bot;
  return { ...rest, mandate: { digest: mandate.digest, issuedAt: mandate.issuedAt } };
}

export function registerBotRoute(app: FastifyInstance): void {
  let running = false;
  if (process.env.BOT_RUNNER === "1") void startRunner().then((started) => (running = started));

  app.get("/bots/status", async () => ({ runner: running, enabledByEnv: process.env.BOT_RUNNER === "1", agentName }));

  app.get<{ Querystring: { owner?: string; network?: string } }>("/bots", async (request, reply) => {
    const owner = request.query.owner ?? "";
    if (!isAddress(owner)) return reply.status(400).send({ error: "owner must be an address" });
    const net = parseNet(request.query.network);
    if (!net) return reply.status(400).send({ error: "network not enabled for bots" });
    return { bots: (await listBots({ owner, net })).map(publicBot), hasKey: await hasKey(owner, net), runner: running };
  });

  app.post<{ Body: { owner?: string; network?: string } }>("/bots/agent/start", async (request, reply) => {
    if (limited(request.ip)) return reply.status(429).send({ error: "too many requests" });
    const owner = request.body?.owner ?? "";
    const net = parseNet(request.body?.network);
    if (!isAddress(owner)) return reply.status(400).send({ error: "owner must be an address" });
    if (!net) return reply.status(400).send({ error: "network not enabled for bots" });
    return startAgent(owner, net);
  });

  app.post<{ Body: { id?: string; issuedAt?: number; signature?: string } }>("/bots/agent/finish", async (request, reply) => {
    if (limited(request.ip)) return reply.status(429).send({ error: "too many requests" });
    const { id = "", issuedAt = 0, signature = "" } = request.body ?? {};
    if (!id || !/^0x[0-9a-fA-F]+$/.test(signature)) return reply.status(400).send({ error: "invalid request" });
    try {
      return await finishAgent(id, issuedAt, signature);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post<{ Body: { owner?: string; network?: string; mode?: BotMode; card?: StrategyCard; issuedAt?: number; signature?: string } }>("/bots", async (request, reply) => {
    if (limited(request.ip)) return reply.status(429).send({ error: "too many requests" });
    const { owner = "", card, mode, issuedAt = 0, signature = "" } = request.body ?? {};
    const net = parseNet(request.body?.network);
    if (!net) return reply.status(400).send({ error: "network not enabled for bots" });
    if (!isAddress(owner) || !card || (mode !== "guard" && mode !== "auto")) return reply.status(400).send({ error: "invalid request" });
    if (!freshSignature(issuedAt)) return reply.status(400).send({ error: "signature expired" });
    const issues = cardShapeIssues(card, defaultLimits);
    if (issues.length > 0) return reply.status(400).send({ error: issues.join(" ") });
    const digest = botDigest(card, mode);
    if (!(await signedBy(owner, botMandateMessage(owner, net, digest, issuedAt), signature))) return reply.status(401).send({ error: "signature does not match the owner" });
    if ((await listBots({ owner, net })).length >= maxBotsPerOwner) return reply.status(400).send({ error: `At most ${maxBotsPerOwner} bots per wallet` });
    const bot: ServerBot = { ...createBot(card.name, mode, card, Date.now()), owner, net, mandate: { digest, signature, issuedAt } };
    await saveBot(bot);
    return publicBot(bot);
  });

  app.post<{ Params: { id: string; action: string }; Body: { issuedAt?: number; signature?: string } }>("/bots/:id/:action", async (request, reply) => {
    if (limited(request.ip)) return reply.status(429).send({ error: "too many requests" });
    const { id, action } = request.params;
    if (action !== "enable" && action !== "disable" && action !== "remove") return reply.status(400).send({ error: "unknown action" });
    const bot = await getBot(id);
    if (!bot) return reply.status(404).send({ error: "bot not found" });
    const { issuedAt = 0, signature = "" } = request.body ?? {};
    if (!freshSignature(issuedAt)) return reply.status(400).send({ error: "signature expired" });
    if (!(await signedBy(bot.owner, botActionMessage(id, action as BotAction, issuedAt), signature))) return reply.status(401).send({ error: "signature does not match the owner" });
    if (action === "remove") {
      await deleteBot(id);
      return { ok: true };
    }
    if (action === "enable" && !(await hasKey(bot.owner, bot.net))) return reply.status(400).send({ error: "Approve an agent key for this wallet first" });
    const next: ServerBot = { ...bot, enabled: action === "enable", status: action === "enable" ? "watching" : "idle", errorStreak: 0 };
    await saveBot(next);
    return publicBot(next);
  });
}

