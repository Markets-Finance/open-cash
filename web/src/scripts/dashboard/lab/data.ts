import * as templates from "shared";
import { info } from "../../hl";

export type Series = templates.Series;

export const loadSeries = templates.createSeriesLoader(info);

export const runTemplate = templates.runTemplate;
export const simOptions = templates.simOptions;
