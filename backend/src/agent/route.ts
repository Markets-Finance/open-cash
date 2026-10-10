import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import {
  cardShapeIssues,
  createHlInfo,
  createToolbox,
  defaultLimits,
  defaultTranslateTemplate,
  hasBlockingIssue,
  marketKind,
  parseTranslation,
  previewStrategy,
  translatePrompt,
  type HlNetwork,
  type MarketContext,
  type TranslateTemplate,
} from "shared";

const marketCount = 60;
const toolboxes = {
  mainnet: createToolbox(createHlInfo("mainnet"), defaultLimits),
  testnet: createToolbox(createHlInfo("testnet"), defaultLimits),
};

type Provider = { client: OpenAI; model: string; extra: { temperature?: number } };

function provider(): Provider | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ baseURL: "https://api.openai.com/v1", apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      extra: {},
    };
  }
  if (process.env.NVIDIA_API_KEY) {
    return {
      client: new OpenAI({ baseURL: "https://integrate.api.nvidia.com/v1", apiKey: process.env.NVIDIA_API_KEY }),
      model: process.env.NVIDIA_MODEL ?? "openai/gpt-oss-20b",
      extra: { temperature: 0.2 },
    };
  }
  return null;
}

export function registerAgentRoute(app: FastifyInstance): void {
  app.post<{ Body: { headline?: string; marginUsd?: number; network?: string } }>("/agent/translate", async (request, reply) => {
    const headline = (request.body?.headline ?? "").trim();
    const network: HlNetwork = request.body?.network === "mainnet" ? "mainnet" : "testnet";
    const toolbox = toolboxes[network];
    if (headline.length < 8 || headline.length > 500) return reply.status(400).send({ error: "Headline must be 8 to 500 characters" });
    const llm = provider();
    if (!llm) return reply.status(503).send({ error: "Headline translation is not configured: set OPENAI_API_KEY or NVIDIA_API_KEY on the server" });
    const marginUsd = Number(request.body?.marginUsd ?? defaultTranslateTemplate.marginUsd);
    if (!(marginUsd > 0) || marginUsd > defaultLimits.maxMarginUsd) return reply.status(400).send({ error: `marginUsd must be above 0 and at most ${defaultLimits.maxMarginUsd}` });
    const template: TranslateTemplate = { ...defaultTranslateTemplate, marginUsd, leverage: Math.min(defaultTranslateTemplate.leverage, defaultLimits.maxLeverage) };

    const available = new Set((await toolbox.getMarkets()).filter((m) => m.markPx > 0).map((m) => m.name));
    const markets = (await toolboxes.mainnet.getMarkets())
      .filter((m) => available.has(m.name))
      .sort((a, b) => b.dayNtlVlm - a.dayNtlVlm)
      .slice(0, marketCount)
      .map((m) => ({ symbol: m.name, kind: marketKind(m.name), volume24hUsd: m.dayNtlVlm }));
    const prompt = translatePrompt(headline, markets, template);

    let text: string;
    try {
      const completion = await llm.client.chat.completions.create({
        model: llm.model,
        ...llm.extra,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      });
      const message = completion.choices[0]?.message as { content?: string | null; reasoning_content?: string | null } | undefined;
      text = message?.content?.trim() || message?.reasoning_content?.trim() || "";
    } catch (error) {
      const status = (error as { status?: number }).status;
      return reply.status(502).send({ error: `The model request failed${status ? ` (${status})` : ""}` });
    }

    let translation;
    try {
      translation = parseTranslation(text, markets.map((m) => m.symbol), template);
    } catch (error) {
      return reply.status(422).send({ error: error instanceof Error ? error.message : String(error) });
    }
    const shape = cardShapeIssues(translation.card, defaultLimits);
    if (shape.length > 0) return reply.status(422).send({ error: shape.join(" "), card: translation.card });
    const contexts = new Map<string, MarketContext>();
    for (const leg of translation.card.legs) {
      const { market, snapshot } = await toolbox.getSnapshot(leg.symbol);
      contexts.set(leg.symbol, { market, snapshot, book: await toolbox.getBook(leg.symbol) });
    }
    const preview = previewStrategy(translation.card, contexts, defaultLimits);
    return {
      card: translation.card,
      preview,
      approvable: !hasBlockingIssue(preview),
      rationale: translation.rationale,
      caveats: translation.caveats,
      dropped: translation.dropped,
      model: llm.model,
      network,
      note: "AI-drafted from a headline. Nothing is traded until you approve it.",
    };
  });
}
