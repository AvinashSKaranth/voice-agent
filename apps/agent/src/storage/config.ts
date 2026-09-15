import { readFileSync, existsSync } from "node:fs";
import { AgentConfigSchema, type AgentConfig } from "@voice-agent/schemas";
import { parse as parseYaml } from "yaml";

export function loadConfig(path?: string): AgentConfig {
  const candidates = [path, "voice-agent.config.yaml", "voice-agent.config.yml", "voice-agent.config.json"].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (!existsSync(c)) continue;
      const raw = readFileSync(c, "utf8");
      const obj = c.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
      return AgentConfigSchema.parse(obj ?? {});
    } catch { /* try next */ }
  }
  return AgentConfigSchema.parse({});
}

export const DEFAULT_CONFIG_YAML = `# voice-agent config (non-secret only — secrets live in OS keychain, BR-04)
agent:
  defaultModel: openai/gpt-4o-mini
  workspaceRoots: []
  localhostPort: 3790
  authToken: dev-token-change-me
voice:
  asrModel: distil-small.en
  minSpeechMs: 200
  minSilenceMs: 600
  speechPaddingMs: 150
  bargeInPersistenceMs: 150
permissions:
  writeInsideWorkspace: auto
mcpServers: []
opencode:
  baseUrl: http://127.0.0.1:4096
`;
