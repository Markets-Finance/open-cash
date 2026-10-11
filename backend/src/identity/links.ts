import type { VerifiedLink } from "shared";
import { JsonFileStore } from "../store/jsonFile.js";

export const identityLinks = new JsonFileStore<VerifiedLink>("data/identity-links.json");
