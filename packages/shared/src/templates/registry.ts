import { donchian } from "./donchian.js";
import { dca } from "./dca.js";
import { grid } from "./grid.js";
import { trail } from "./trail.js";
import type { Params, Template, TemplateId } from "./types.js";

export const library: Template[] = [donchian, dca, grid, trail];

export function templateById(id: TemplateId): Template {
  const found = library.find((template) => template.id === id);
  if (!found) throw new Error(`Unknown template ${id}`);
  return found;
}

export function clampParams(template: Template, params: Params): Params {
  const next: Params = { ...template.defaults };
  for (const spec of template.params) {
    const value = params[spec.key];
    if (value === undefined || !Number.isFinite(value)) continue;
    next[spec.key] = Math.min(spec.max, Math.max(spec.min, value));
  }
  return next;
}
