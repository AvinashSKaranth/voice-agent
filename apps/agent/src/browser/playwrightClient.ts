import { McpManager } from "../mcp/manager.js";

/**
 * Playwright MCP bridge (FR-MCP-05). Delegates to a Playwright MCP server when
 * configured; registers no-op descriptive tools otherwise so the tool surface
 * stays stable and orchestration/tests don't branch.
 */
export function registerBrowserTools(mcp: McpManager, executor?: (tool: string, input: unknown, signal: AbortSignal) => Promise<unknown>): void {
  const tools: Array<[string, string]> = [
    ["open", "Open a URL in the managed browser"],
    ["navigate", "Navigate to a URL"],
    ["click", "Click a selector"],
    ["type", "Type text into a selector"],
    ["select", "Select an option"],
    ["extract", "Extract readable content"],
    ["screenshot", "Capture a screenshot path"],
  ];
  for (const [name, description] of tools) {
    mcp.registerTool("browser", name, description, { type: "object" }, async (input, signal) => {
      if (executor) return executor(name, input, signal);
      return { queued: true, tool: `browser.${name}`, input, note: "Playwright MCP not configured — set PLAYWRIGHT_MCP_URL or mcpServers entry" };
    });
  }
}
