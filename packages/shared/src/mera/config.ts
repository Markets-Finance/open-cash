export const relyingPartyId = "hl.opencash.in";
export const relyingPartyName = "OpenCash";

const requested = typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_AUTH_MODE : undefined;

export const authMode: "dev" | "prod" = requested === "dev" ? "dev" : "prod";

export const isDevAuth = authMode === "dev";
