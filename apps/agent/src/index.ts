import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.js";
import { loadConfig } from "./storage/config.js";

// Load repo-root .env (key names: PROVIDER, OPENROUTER_API_KEY, NVIDIA_NIM_API_KEY,
// LLM_MODEL, VOICE_AGENT_TOKEN, PORT). Values are never logged (BR-04).
try {
  const dotenv = (await import("dotenv").catch(() => null)) as unknown as {
    default?: { config(o: unknown): void };
  } | null;
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  for (const p of [join(root, ".env"), ".env"]) {
    if (existsSync(p)) {
      (dotenv?.default ?? dotenv as unknown as { config(o: unknown): void })?.config({ path: p });
      break;
    }
  }
} catch { /* env fallback: process env as-is */ }

const config = loadConfig(process.env.VOICE_AGENT_CONFIG);
const port = Number(process.env.PORT ?? config.agent.localhostPort ?? 3790);
const token = process.env.VOICE_AGENT_TOKEN ?? config.agent.authToken ?? "dev-token-change-me";

await startServer(port, token);
console.log(JSON.stringify({ level: "info", msg: "voice-agent-runtime-started", port }));
