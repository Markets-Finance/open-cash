import type * as templates from "shared";
import type { Series } from "./data";

export type Stage = "simulate" | "paper" | "live";

export const labState = {
  symbols: [] as string[],
  symbol: "",
  resolution: 3600,
  selected: null as templates.TemplateId | null,
  series: null as Series | null,
  stage: "simulate" as Stage,
  allocationUsd: 100,
  params: new Map<templates.TemplateId, templates.Params>(),
};

export function paramsFor(template: templates.Template): templates.Params {
  const stored = labState.params.get(template.id);
  if (stored) return stored;
  const fresh = { ...template.defaults };
  labState.params.set(template.id, fresh);
  return fresh;
}
