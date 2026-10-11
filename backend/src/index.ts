import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerAgentRoute } from "./agent/route.js";
import { registerAccountRoute } from "./account/route.js";
import { registerAnalyticsRoute } from "./analytics/route.js";
import { registerBoardsRoute } from "./boards/route.js";
import { registerDepositRoute } from "./deposit/route.js";
import { registerFloorRoute } from "./floors/route.js";
import { registerGuardrailsRoute } from "./guardrails/route.js";
import { registerIdentityRoute } from "./identity/route.js";
import { killed } from "./kill.js";
import { registerLeaderboardRoute } from "./leaderboard/route.js";
import { registerLiveRoute } from "./live/route.js";
import { registerStrategyRoute } from "./strategies/route.js";
import { registerBotRoute } from "./runner/route.js";

const port = Number(process.env.PORT ?? 8787);
const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true });

app.addHook("onRequest", async (request, reply) => {
  if (killed() && request.url.split("?")[0] !== "/health") return reply.status(404).send({ error: "Not found" });
});

app.get("/health", async () => ({ ok: true, killed: killed() }));

registerAgentRoute(app);
registerAccountRoute(app);
registerAnalyticsRoute(app);
registerBoardsRoute(app);
registerDepositRoute(app);
registerFloorRoute(app);
registerGuardrailsRoute(app);
registerIdentityRoute(app);
registerLeaderboardRoute(app);
registerStrategyRoute(app);
registerBotRoute(app);
registerLiveRoute(app);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

