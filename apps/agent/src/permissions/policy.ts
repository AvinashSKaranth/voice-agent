export type PolicyVerdict = "auto" | "ask" | "deny";

export interface ToolRequest {
  server: string;
  tool: string;
  input: unknown;
}

/**
 * Capability-based permission layer, enforced in runtime not UI/prompt (NFR-07).
 * Defaults from BRD §13.8; overridable per workspace via grants.
 */
export class PolicyEngine {
  private workspaceRoots: string[] = [];
  private workspaceGrants = new Map<string, Set<string>>(); // workspace -> tool patterns allowed
  private writeInside: "auto" | "ask" = "auto";
  paused = false;

  configure(opts: { workspaceRoots?: string[]; writeInsideWorkspace?: "auto" | "ask" }): void {
    if (opts.workspaceRoots) this.workspaceRoots = opts.workspaceRoots.map((r) => r.toLowerCase());
    if (opts.writeInsideWorkspace) this.writeInside = opts.writeInsideWorkspace;
  }

  grantWorkspace(workspace: string, toolPattern: string): void {
    const k = workspace.toLowerCase();
    if (!this.workspaceGrants.has(k)) this.workspaceGrants.set(k, new Set());
    this.workspaceGrants.get(k)!.add(toolPattern);
  }

  private pathInWorkspace(p: unknown): boolean | null {
    if (typeof p !== "string" || !p) return null;
    if (this.workspaceRoots.length === 0) return null;
    const lp = p.toLowerCase().replace(/\//g, "\\");
    return this.workspaceRoots.some((r) => lp.startsWith(r.toLowerCase()));
  }

  private pathsOf(input: unknown): unknown[] {
    if (!input || typeof input !== "object") return [];
    const o = input as Record<string, unknown>;
    return [o.path, o.dir, o.root, o.from, o.to, o.cwd].filter((v) => typeof v === "string");
  }

  evaluate(req: ToolRequest): PolicyVerdict {
    const id = `${req.server}.${req.tool}`;
    // Shell: only allow-listed (deny otherwise) — FR-MCP-06. Allow-list enforced by shell server too; deny unknown here.
    if (req.server === "shell") return "ask"; // shell server checks allow-list and denies; policy requires explicit approval
    // Filesystem sandbox (FR-PERM-05)
    if (req.server === "filesystem") {
      for (const p of this.pathsOf(req.input)) {
        const verdict = this.pathInWorkspace(p);
        if (verdict === false) return "deny"; // outside workspace → deny regardless of policy
      }
      if (req.tool === "read" || req.tool === "list" || req.tool === "search") return "auto";
      if (req.tool === "write") return this.writeInside;
      if (req.tool === "delete" || req.tool === "move") return "ask";
    }
    if (req.server === "process" && req.tool === "list") return "auto";
    if (req.server === "service" && (req.tool === "list" || req.tool === "status")) return "auto";
    if (req.server === "computer" && (req.tool === "open_application" || req.tool === "focus_window" || req.tool === "screenshot" || req.tool === "list_windows")) return "auto";
    if (req.server === "browser" && ["open", "navigate", "extract", "screenshot"].includes(req.tool)) return "auto";
    if (req.server === "http") return "auto";
    if (req.server === "opencode") return "auto";
    // Destructive / externally visible → ask (BR-03)
    if (/(delete|kill|push|send|purchase|email|submit|registry|env)/i.test(id)) return "ask";
    if (req.server === "process" || req.server === "service") return "ask";
    if (req.server === "browser" || req.server === "computer") return "ask";
    return "ask";
  }
}
