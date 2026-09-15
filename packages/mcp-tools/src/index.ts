/** First-party MCP servers live in the agent runtime (apps/agent/src/{tools,browser,computer,opencode}). This package holds shared tool metadata. */
export const FIRST_PARTY_SERVERS = ["filesystem", "process", "service", "shell", "http", "browser", "computer", "opencode"] as const;
