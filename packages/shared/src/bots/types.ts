import type { StrategyCard } from "../strategy/types.js";

export type BotMode = "guard" | "auto";

export type BotStatus = "idle" | "watching" | "open" | "stopped" | "halted";

export type BotLogLevel = "info" | "action" | "error";

export type BotLogEntry = {
  at: number;
  level: BotLogLevel;
  message: string;
  txHash?: string;
};

export type BotRules = {
  minCarryAprPct: number;
  cooldownMin: number;
  maxOpensPerDay: number;
  maxErrors: number;
};

export type Bot = {
  id: string;
  name: string;
  mode: BotMode;
  card: StrategyCard;
  rules: BotRules;
  enabled: boolean;
  status: BotStatus;
  createdAt: number;
  lastOpenAt: number | null;
  opensToday: { day: string; count: number };
  errorStreak: number;
  realizedPnlUsd: number;
  lastCheck: { at: number; message: string } | null;
  log: BotLogEntry[];
};

export const defaultRules: BotRules = {
  minCarryAprPct: 0,
  cooldownMin: 60,
  maxOpensPerDay: 1,
  maxErrors: 3,
};

export const maxLogEntries = 60;

export function createBot(name: string, mode: BotMode, card: StrategyCard, now: number): Bot {
  return {
    id: `bot-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    mode,
    card,
    rules: { ...defaultRules },
    enabled: false,
    status: "idle",
    createdAt: now,
    lastOpenAt: null,
    opensToday: { day: "", count: 0 },
    errorStreak: 0,
    realizedPnlUsd: 0,
    lastCheck: null,
    log: [],
  };
}
