import cors from "@fastify/cors";
import Fastify from "fastify";
import { hoodMainnet } from "shared";
import { registerAnalyticsRoute } from "./analytics/route.js";
import { registerBoardsRoute } from "./boards/route.js";
import { registerDepositRoute } from "./deposit/route.js";
import { registerIdentityRoute } from "./identity/route.js";
import { registerLeaderboardRoute } from "./leaderboard/route.js";
import { registerStrategyRoute } from "./strategies/route.js";
import { registerBotRoute } from "./runner/route.js";
import { registerMarketRoute } from "./market/route.js";
import { warmTradableCache } from "./market/tradable.js";
import { registerPortfolioRoute } from "./portfolio/route.js";

const port = Number(process.env.PORT ?? 8787);
const app = Fastify({ logger: true });

// Dev-only: the web app and backend run on different ports (4321 vs 8787),
// so browser fetches need CORS or they're silently blocked. No deployed
// origin exists yet, so this stays wide open rather than guessing one.
await app.register(cors, { origin: true });

app.get("/health", async () => ({
  ok: true,
  chainId: hoodMainnet.chainId,
}));

registerAnalyticsRoute(app);
registerBoardsRoute(app);
registerDepositRoute(app);
registerIdentityRoute(app);
registerLeaderboardRoute(app);
registerStrategyRoute(app);
registerBotRoute(app);
registerMarketRoute(app);
registerPortfolioRoute(app);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

warmTradableCache();
