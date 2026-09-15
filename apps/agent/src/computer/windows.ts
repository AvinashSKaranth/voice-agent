import { McpManager } from "../mcp/manager.js";

/** Platform-neutral computer-use interface (NFR-10); Windows adapter for v1 (FR 13.6). */
export interface ComputerAdapter {
  screenshot(): Promise<{ path?: string; note: string }>;
  click(x: number, y: number): Promise<unknown>;
  type(text: string): Promise<unknown>;
  key(key: string): Promise<unknown>;
  openApplication(name: string): Promise<unknown>;
  listWindows(): Promise<unknown>;
  focusWindow(title: string): Promise<unknown>;
}

export class WindowsComputerAdapter implements ComputerAdapter {
  async screenshot() { return { note: "screenshot via PowerShell/UIA adapter (v1 stub — real capture in Phase 4 native work)" }; }
  async click(x: number, y: number) { return { clicked: { x, y }, note: "stub" }; }
  async type(text: string) { return { typed: text.length, note: "stub" }; }
  async key(key: string) { return { key, note: "stub" }; }
  async openApplication(name: string) {
    // Block shell metacharacters — app names/paths only (no command chaining).
    if (!name || /[&|;$`!(){}<>*?~#]/.test(name) || name.length > 260) {
      return { app: name, error: "Rejected: application name contains blocked characters" };
    }
    const { spawn } = await import("node:child_process");
    return await new Promise((resolve) => {
      const c = spawn("cmd", ["/c", "start", "", name], { shell: false });
      c.on("error", (e) => resolve({ app: name, error: String(e) }));
      c.on("close", () => resolve({ app: name, opened: true }));
    });
  }
  async listWindows() { return { windows: [], note: "UIA enumeration stub" }; }
  async focusWindow(title: string) { return { title, note: "stub" }; }
}

export function registerComputerTools(mcp: McpManager, adapter: ComputerAdapter): void {
  mcp.registerTool("computer", "screenshot", "Capture screen", { type: "object" }, async () => adapter.screenshot());
  mcp.registerTool("computer", "click", "Click at coordinates", { type: "object" }, async (i) => {
    const { x, y } = (i ?? {}) as { x: number; y: number }; return adapter.click(x, y);
  });
  mcp.registerTool("computer", "type", "Type text", { type: "object" }, async (i) => adapter.type(String((i as { text?: string })?.text ?? "")));
  mcp.registerTool("computer", "key", "Press a key", { type: "object" }, async (i) => adapter.key(String((i as { key?: string })?.key ?? "")));
  mcp.registerTool("computer", "open_application", "Open an application", { type: "object" }, async (i) => adapter.openApplication(String((i as { name?: string })?.name ?? "")));
  mcp.registerTool("computer", "list_windows", "List windows", { type: "object" }, async () => adapter.listWindows());
  mcp.registerTool("computer", "focus_window", "Focus a window", { type: "object" }, async (i) => adapter.focusWindow(String((i as { title?: string })?.title ?? "")));
}
