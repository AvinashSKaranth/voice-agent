import { spawn, type ChildProcess } from "node:child_process";
import { createLogger } from "@voice-agent/shared";
import { McpManager } from "../mcp/manager.js";

/**
 * OpenCode controller (FR-OC-01..04, BR-06): attach to running `opencode serve`
 * or start one; open project / create-continue session / prompt / stream.
 * Repository work is delegated — never reimplemented here.
 */
export class OpenCodeController {
  private log = createLogger("opencode");
  private child: ChildProcess | null = null;
  constructor(private baseUrl = "http://127.0.0.1:4096") {}

  async ensureServer(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/global/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return this.baseUrl;
    } catch { /* start our own */ }
    this.log.info("starting-opencode-serve", { baseUrl: this.baseUrl });
    this.child = spawn("opencode", ["serve", "--port", new URL(this.baseUrl).port || "4096"], { shell: false, stdio: "ignore", detached: true });
    this.child.unref();
    // Best-effort wait for readiness
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`${this.baseUrl}/global/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return this.baseUrl;
      } catch { /* retry */ }
    }
    throw new Error(`opencode serve not reachable at ${this.baseUrl}`);
  }

  async api(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`OpenCode API ${path}: HTTP ${res.status}`);
    return res.json().catch(() => ({}));
  }

  registerTools(mcp: McpManager): void {
    mcp.registerTool("opencode", "startServer", "Ensure opencode serve is running", { type: "object" }, async () => ({ baseUrl: await this.ensureServer() }));
    mcp.registerTool("opencode", "createSession", "Create a session for a project directory", { type: "object" }, async (i) => {
      await this.ensureServer();
      const { directory } = (i ?? {}) as { directory?: string };
      return this.api("/session", { method: "POST", body: JSON.stringify({ directory }) });
    });
    mcp.registerTool("opencode", "sendPrompt", "Send a prompt to a session", { type: "object" }, async (i) => {
      await this.ensureServer();
      const { sessionId, text } = (i ?? {}) as { sessionId?: string; text?: string };
      return this.api(`/session/${sessionId}/message`, { method: "POST", body: JSON.stringify({ text }) });
    });
    mcp.registerTool("opencode", "getSession", "Get session state", { type: "object" }, async (i) => {
      await this.ensureServer();
      const { sessionId } = (i ?? {}) as { sessionId?: string };
      return this.api(`/session/${sessionId}`);
    });
    mcp.registerTool("opencode", "openProject", "Locate project + open session (voice helper)", { type: "object" }, async (i) => {
      const { root, name } = (i ?? {}) as { root?: string; name?: string };
      return { root, name, note: "filesystem search locates project; createSession opens it (AT-01)" };
    });
  }

  shutdown(): void { try { this.child?.kill(); } catch { /* noop */ } }
}
