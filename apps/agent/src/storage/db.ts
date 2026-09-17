import { createRequire } from "node:module";
import { newId, nowIso } from "@voice-agent/shared";

interface Row { [k: string]: unknown }

/**
 * SQLite persistence (FR-DATA-01). Uses Node built-in node:sqlite when available,
 * with a pure-JS in-memory fallback (same API) for test/CI environments where the
 * bundler cannot resolve node:sqlite.
 * Tables: conversation, message, task, tool_execution, approval, setting, workflow_run.
 */
export class Database {
  private sqlite: { prepare(s: string): { run(...a: unknown[]): unknown; all(...a: unknown[]): Row[] } ; exec(s: string): void; close(): void } | null = null;
  private mem = {
    conversation: [] as Row[], message: [] as Row[], task: [] as Row[],
    tool_execution: [] as Row[], approval: [] as Row[], workflow_run: [] as Row[],
  };
  private useMem = false;

  constructor(path = ":memory:") {
    try {
      const req = createRequire(import.meta.url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = req("node:sqlite");
      this.sqlite = new mod.DatabaseSync(path) as never;
      this.migrateSqlite();
    } catch {
      this.useMem = true;
    }
  }

  private migrateSqlite(): void {
    this.sqlite!.exec(`
      CREATE TABLE IF NOT EXISTS conversation(id TEXT PRIMARY KEY, created_at TEXT, title TEXT, model TEXT);
      CREATE TABLE IF NOT EXISTS message(id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT, created_at TEXT, interrupted_at TEXT);
      CREATE TABLE IF NOT EXISTS task(id TEXT PRIMARY KEY, conversation_id TEXT, workflow_id TEXT, status TEXT, created_at TEXT, completed_at TEXT);
      CREATE TABLE IF NOT EXISTS tool_execution(id TEXT PRIMARY KEY, task_id TEXT, step_id TEXT, server TEXT, tool TEXT, input TEXT, output TEXT, status TEXT, duration_ms INTEGER, approval_id TEXT);
      CREATE TABLE IF NOT EXISTS approval(id TEXT PRIMARY KEY, tool_execution_id TEXT, decision TEXT, scope TEXT, decided_by TEXT, decided_at TEXT);
      CREATE TABLE IF NOT EXISTS setting(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS workflow_run(id TEXT PRIMARY KEY, workflow_id TEXT, task_id TEXT, status TEXT, steps_json TEXT);
    `);
  }

  createConversation(title = "New conversation", model = ""): string {
    const id = newId("conv");
    if (this.useMem) this.mem.conversation.push({ id, created_at: nowIso(), title, model });
    else this.sqlite!.prepare("INSERT INTO conversation(id,created_at,title,model) VALUES(?,?,?,?)").run(id, nowIso(), title, model);
    return id;
  }

  addMessage(conversationId: string, role: string, content: string): string {
    const id = newId("msg");
    if (this.useMem) this.mem.message.push({ id, conversation_id: conversationId, role, content, created_at: nowIso() });
    else this.sqlite!.prepare("INSERT INTO message(id,conversation_id,role,content,created_at,interrupted_at) VALUES(?,?,?,?,?,NULL)").run(id, conversationId, role, content, nowIso());
    return id;
  }

  getMessages(conversationId: string): Array<{ role: "user" | "assistant" | "system" | "tool"; content: string }> {
    const rows = this.useMem
      ? (this.mem.message.filter((m) => m.conversation_id === conversationId) as Array<{ role: string; content: string }>)
      : (this.sqlite!.prepare("SELECT role,content FROM message WHERE conversation_id=? ORDER BY created_at").all(conversationId) as Array<{ role: string; content: string }>);
    return rows.map((r) => ({ role: ((r.role as "user" | "assistant" | "system" | "tool") ?? "user"), content: String(r.content) }));
  }

  createTask(taskId: string, conversationId: string, workflowId?: string): void {
    if (this.useMem) this.mem.task.push({ id: taskId, conversation_id: conversationId, workflow_id: workflowId ?? null, status: "running", created_at: nowIso() });
    else this.sqlite!.prepare("INSERT INTO task(id,conversation_id,workflow_id,status,created_at,completed_at) VALUES(?,?,?,?,?,NULL)").run(taskId, conversationId, workflowId ?? null, "running", nowIso());
  }

  completeTask(taskId: string, status: string): void {
    if (this.useMem) {
      const t = this.mem.task.find((t) => t.id === taskId);
      if (t) { t.status = status; t.completed_at = nowIso(); }
    } else this.sqlite!.prepare("UPDATE task SET status=?,completed_at=? WHERE id=?").run(status, nowIso(), taskId);
  }

  recordTool(taskId: string, server: string, tool: string, input: unknown, output: unknown, status: string, durationMs: number, approvalId?: string): string {
    const id = newId("tool");
    const io = JSON.stringify(input ?? null) ?? "null";
    const oo = JSON.stringify(output ?? null) ?? "null";
    if (this.useMem) this.mem.tool_execution.push({ id, task_id: taskId, server, tool, input, output, status, duration_ms: durationMs, approval_id: approvalId ?? null });
    else this.sqlite!.prepare("INSERT INTO tool_execution(id,task_id,step_id,server,tool,input,output,status,duration_ms,approval_id) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(id, taskId, null, server, tool, io.slice(0, 8000), oo.slice(0, 8000), status, durationMs, approvalId ?? null);
    return id;
  }

  recordApproval(id: string, taskId: string, decision: string, decidedBy: string): void {
    const scope = decision === "allow-once" ? "once" : decision === "allow-task" ? "task" : decision === "allow-workspace" ? "workspace" : "deny";
    if (this.useMem) this.mem.approval.push({ id, tool_execution_id: taskId, decision, scope, decided_by: decidedBy, decided_at: nowIso() });
    else this.sqlite!.prepare("INSERT INTO approval(id,tool_execution_id,decision,scope,decided_by,decided_at) VALUES(?,?,?,?,?,?)")
      .run(id, taskId, decision, scope, decidedBy, nowIso());
  }

  recordWorkflowRun(id: string, workflowId: string, taskId: string, status: string, steps: unknown): void {
    if (this.useMem) this.mem.workflow_run.push({ id, workflow_id: workflowId, task_id: taskId, status, steps_json: JSON.stringify(steps) });
    else this.sqlite!.prepare("INSERT INTO workflow_run(id,workflow_id,task_id,status,steps_json) VALUES(?,?,?,?,?)")
      .run(id, workflowId, taskId, status, JSON.stringify(steps));
  }

  close(): void { try { this.sqlite?.close(); } catch { /* noop */ } }
}
