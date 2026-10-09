import type { CopyRecord, SharedStrategy } from "shared";
import { JsonFileStore } from "../store/jsonFile.js";

export const strategies = new JsonFileStore<SharedStrategy>("data/strategies.json");
export const copies = new JsonFileStore<CopyRecord>("data/copies.json");
