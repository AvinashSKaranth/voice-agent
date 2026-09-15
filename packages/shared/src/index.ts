import { randomUUID } from "node:crypto";

export const newId = (prefix = "id"): string => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
export const nowIso = (): string => new Date().toISOString();

export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

/** Structured JSON logs with correlation IDs (FR-OBS-03). */
export function createLogger(scope: string, correlation?: Record<string, string>): Logger {
  const base = { scope, ...correlation };
  const line = (level: string, msg: string, fields?: Record<string, unknown>) =>
    console.log(JSON.stringify({ ts: nowIso(), level, msg, ...base, ...fields }));
  return {
    info: (msg, fields) => line("info", msg, fields),
    warn: (msg, fields) => line("warn", msg, fields),
    error: (msg, fields) => line("error", msg, fields),
  };
}
