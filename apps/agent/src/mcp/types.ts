export interface McpToolDef {
  server: string;
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpServerRecord {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  lastHealth?: string;
}

/** Minimal in-process tool handler (first-party servers register here; external MCP via child/HTTP in manager). */
export type ToolHandler = (input: unknown, signal: AbortSignal) => Promise<unknown>;
