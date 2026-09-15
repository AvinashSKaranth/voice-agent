import { startServer } from "./server.js";
import { loadConfig } from "./storage/config.js";

const config = loadConfig(process.env.VOICE_AGENT_CONFIG);
const port = Number(process.env.PORT ?? config.agent.localhostPort ?? 3790);
const token = process.env.VOICE_AGENT_TOKEN ?? config.agent.authToken ?? "dev-token-change-me";

await startServer(port, token);
console.log(JSON.stringify({ level: "info", msg: "voice-agent-runtime-started", port }));
