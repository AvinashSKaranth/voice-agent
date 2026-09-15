import { spawn, execSync } from "node:child_process";
import { McpManager } from "../mcp/manager.js";
import { ShellExecSchema, ProcessStartSchema, ProcessStopSchema, ServiceControlSchema } from "@voice-agent/schemas";

/** Allow-listed shell + process/service management (FR-MCP-06, FR 13.6). */
const DEFAULT_ALLOW = new Set(["git", "npm", "pnpm", "node", "cargo", "dotnet", "ping", "curl", "opencode"]);

export function registerProcessTools(mcp: McpManager, allowList = DEFAULT_ALLOW): void {
  mcp.registerTool("shell", "exec", "Run an allow-listed command with timeout", ShellExecSchema, async (input) => {
    const { command, args, cwd, timeoutMs } = ShellExecSchema.parse(input);
    if (!allowList.has(command)) throw new Error(`Shell command not on allow-list: ${command} (denied)`);
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, shell: false, timeout: timeoutMs });
      let stdout = "", stderr = "";
      child.stdout?.on("data", (d) => { stdout += String(d); });
      child.stderr?.on("data", (d) => { stderr += String(d); });
      child.on("error", reject);
      child.on("close", (code) => resolve({ command, args, code, stdout: stdout.slice(-8000), stderr: stderr.slice(-8000) }));
      setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, timeoutMs);
    });
  });

  const procs = new Map<number, ReturnType<typeof spawn>>();
  mcp.registerTool("process", "list", "List processes (lightweight)", { type: "object" }, async () => {
    try {
      const out = execSync("tasklist /FO CSV /NH", { encoding: "utf8", timeout: 8000 });
      return { processes: out.split("\n").slice(0, 50) };
    } catch {
      return { processes: [] };
    }
  });
  mcp.registerTool("process", "start", "Start an allow-listed process", ProcessStartSchema, async (input) => {
    const { command, args, cwd } = ProcessStartSchema.parse(input);
    if (!allowList.has(command)) throw new Error(`Process not on allow-list: ${command}`);
    const child = spawn(command, args ?? [], { cwd, detached: true, stdio: "ignore", shell: false });
    child.unref();
    if (child.pid) procs.set(child.pid, child);
    return { pid: child.pid };
  });
  mcp.registerTool("process", "stop", "Stop a process previously started by the agent", ProcessStopSchema, async (input) => {
    const { pid } = ProcessStopSchema.parse(input);
    if (!procs.has(pid)) return { pid, stopped: false, error: "Refusing to kill arbitrary PID — only agent-started processes can be stopped" };
    try { process.kill(pid); procs.delete(pid); return { pid, stopped: true }; }
    catch (e) { return { pid, stopped: false, error: String(e) }; }
  });

  for (const op of ["list", "start", "stop", "restart", "status"] as const) {
    mcp.registerTool("service", op, `Windows service ${op}`, op === "list" ? { type: "object" } : ServiceControlSchema, async (input) => {
      if (op === "list") {
        try {
          const out = execSync("sc query type= service state= all", { encoding: "utf8", timeout: 8000 });
          return { services: out.split("\n").filter((l) => l.startsWith("SERVICE_NAME")).slice(0, 100) };
        } catch (e) { return { services: [], error: String(e) }; }
      }
      const { name } = ServiceControlSchema.parse(input ?? { name: "" });
      const cmd = op === "status" ? `sc query "${name}"` : `sc ${op} "${name}"`;
      try {
        const out = execSync(cmd, { encoding: "utf8", timeout: 15000 });
        return { name, op, output: out.slice(0, 4000) };
      } catch (e) { return { name, op, error: String(e).slice(0, 2000) }; }
    });
  }

  mcp.registerTool("http", "health_check", "GET a URL and report status", { type: "object" }, async (input) => {
    const url = (input as { url?: string })?.url;
    if (!url) throw new Error("http.health_check requires { url }");
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error(`Blocked protocol: ${u.protocol}`);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      return { url, status: res.status, ok: res.ok };
    } finally { clearTimeout(t); }
  });
  mcp.registerTool("http", "request", "Simple HTTP request for verification steps", { type: "object" }, async (input) => {
    const { url, method } = (input ?? {}) as { url?: string; method?: string };
    if (!url) throw new Error("http.request requires { url }");
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error(`Blocked protocol: ${u.protocol}`);
    const m = (method ?? "GET").toUpperCase();
    if (!["GET", "HEAD", "POST"].includes(m)) throw new Error(`Blocked method: ${m}`);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetch(url, { method: m, signal: ctl.signal });
      const text = await res.text().catch(() => "");
      return { url, status: res.status, body: text.slice(0, 8000) };
    } finally { clearTimeout(t); }
  });
}
