import * as templates from "shared";
import { createHlInfo } from "shared";

export type Series = templates.Series;

export const loadSeries = templates.createSeriesLoader(createHlInfo("mainnet"));

export const runTemplate = templates.runTemplate;
export const simOptions = templates.simOptions;
