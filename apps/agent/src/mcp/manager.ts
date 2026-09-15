import { createLogger } from "@voice-agent/shared";
import type { McpServerRecord, McpToolDef, ToolHandler } from "./types.js";

/**
 * MCP manager: registry + health + namespaced discovery (FR-MCP-01/02/03).
 * External stdio/HTTP servers attach via registerExternal; first-party
 * servers register handlers directly (no separate processes in v1 skeleton).
 */
export class McpManager {
  private log = createLogger("mcp");
  private servers = new Map<string, McpServerRecord>();
  private tools = new Map<string, McpToolDef & { handler: ToolHandler }>();

  addServer(rec: McpServerRecord): void {
    this.servers.set(rec.name, { ...rec, lastHealth: "unknown" });
  }

  registerTool(server: string, name: string, description: string, inputSchema: unknown, handler: ToolHandler): void {
    this.tools.set(`${server}.${name}`, { server, name, description, inputSchema, handler });
  }

  listTools(): McpToolDef[] {
    return [...this.tools.values()].map(({ server, name, description, inputSchema }) => ({ server, name, description, inputSchema }));
  }

  healthCheck(name: string, ok: boolean): void {
    const s = this.servers.get(name);
    if (s) s.lastHealth = ok ? "ok" : "error";
  }

  serversStatus(): McpServerRecord[] { return [...this.servers.values()]; }

  async callTool(server: string, tool: string, input: unknown, signal: AbortSignal): Promise<unknown> {
    const key = `${server}.${tool}`;
    const t = this.tools.get(key);
    if (!t) throw new Error(`Unknown tool: ${key}`);
    if (signal.aborted) throw new Error("cancelled");
    this.log.info("tool-call", { tool: key });
    return t.handler(input, signal);
  }
}
