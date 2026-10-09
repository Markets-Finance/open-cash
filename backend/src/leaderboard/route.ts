import type { FastifyInstance } from "fastify";
import type { HlNetwork, VerifiedLink } from "shared";
import { leaderboardView } from "../analytics/leaderboard.js";
import { JsonFileStore } from "../store/jsonFile.js";

const links = new JsonFileStore<VerifiedLink>("data/identity-links.json");
const minEquityUsd = Number(process.env.LEADERBOARD_MIN_EQUITY_USD ?? 10_000);

export function registerLeaderboardRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { limit?: string; network?: string } }>("/leaderboard", async (request, reply) => {
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25));
    const network: HlNetwork = request.query.network === "testnet" ? "testnet" : "mainnet";
    try {
      const view = await leaderboardView(network, "pnl", "month", limit, minEquityUsd);
      const handles = new Map((await links.all()).map((link) => [link.address.toLowerCase(), link.handle]));
      return {
        network,
        windowHours: 30 * 24,
        syncedAt: view.at,
        rows: view.rows.map((row) => ({
          rank: row.rank,
          accountId: null,
          address: row.address,
          handle: handles.get(row.address.toLowerCase()) ?? null,
          netPnlUsd: row.pnlUsd,
          grossPnlUsd: null,
          feesUsd: null,
          volumeUsd: row.volumeUsd,
          closedTrades: null,
          winRate: null,
          profitFactor: null,
          maxDrawdownUsd: null,
          liquidations: null,
          equityUsd: row.equityUsd,
          roiPct: row.roiPct,
        })),
      };
    } catch (error) {
      return reply.status(502).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
