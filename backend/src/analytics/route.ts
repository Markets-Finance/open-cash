import type { FastifyInstance } from "fastify";
import type { HlNetwork } from "shared";
import { leaderboardView, parseSort, parseWindow } from "./leaderboard.js";
import { protocolView } from "./protocol.js";
import { walletView } from "./wallet.js";

function parseNet(value: unknown): HlNetwork {
  return value === "testnet" ? "testnet" : "mainnet";
}

export function registerAnalyticsRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { network?: string } }>("/analytics/protocol", async (request, reply) => {
    try {
      return await protocolView(parseNet(request.query.network));
    } catch (error) {
      return reply.status(502).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get<{ Querystring: { network?: string; sort?: string; window?: string; limit?: string; minEquity?: string } }>(
    "/analytics/leaderboard",
    async (request, reply) => {
      try {
        const { network, sort, window, limit, minEquity } = request.query;
        return await leaderboardView(
          parseNet(network),
          parseSort(sort),
          parseWindow(window),
          Math.min(Math.max(Number(limit) || 10, 1), 50),
          Math.max(Number(minEquity) || 0, 0),
        );
      } catch (error) {
        return reply.status(502).send({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  app.get<{ Querystring: { network?: string; address?: string } }>("/analytics/wallet", async (request, reply) => {
    try {
      const result = await walletView(parseNet(request.query.network), (request.query.address ?? "").trim());
      if ("error" in result) return reply.status(400).send(result);
      return result;
    } catch (error) {
      return reply.status(502).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
