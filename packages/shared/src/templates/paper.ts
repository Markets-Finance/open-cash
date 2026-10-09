import type { Candle } from "../analysis/types.js";
import { clampParams, templateById } from "./registry.js";
import { simulate } from "./simulate.js";
import type { Params, SimOptions, SimResult, TemplateId } from "./types.js";

export type PaperBot = {
  id: string;
  name: string;
  templateId: TemplateId;
  symbol: string;
  resolution: number;
  params: Params;
  allocationUsd: number;
  startedAt: number;
  createdAt: number;
};

export function paperFromBot(
  name: string,
  templateId: TemplateId,
  symbol: string,
  resolution: number,
  params: Params,
  allocationUsd: number,
  now: number,
): PaperBot {
  return {
    id: `paper-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    templateId,
    symbol,
    resolution,
    params,
    allocationUsd,
    startedAt: now,
    createdAt: now,
  };
}

export function runPaper(bot: PaperBot, candles: Candle[], options: SimOptions): SimResult {
  const template = templateById(bot.templateId);
  const startIndex = candles.findIndex((c) => c.time >= bot.startedAt);
  if (startIndex < 0) return simulate(template.create(template.defaults), [], { ...options, allocationUsd: bot.allocationUsd });
  return simulate(
    template.create(clampParams(template, bot.params)),
    candles,
    { ...options, allocationUsd: bot.allocationUsd },
    startIndex,
  );
}
