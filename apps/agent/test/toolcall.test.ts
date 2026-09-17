import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventBus } from "../src/agent/eventBus.js";
import { ConversationState } from "../src/agent/conversationState.js";
import { Orchestrator } from "../src/agent/orchestrator.js";
import { McpManager } from "../src/mcp/manager.js";
import { PolicyEngine } from "../src/permissions/policy.js";
import { ApprovalStore } from "../src/permissions/approvals.js";
import { Database } from "../src/storage/db.js";
import { registerFilesystemTools } from "../src/tools/filesystem.js";
import type { LLMProvider } from "../src/llm/types.js";

/** Scripted LLM: emits one filesystem.list tool call (like a real SSE-parsed chunk), then text. */
class ScriptedToolLLM implements LLMProvider {
  readonly name = "scripted";
  constructor(private dir: string) {}
  async *stream() {
    yield { token: "Listing. " };
    yield { toolCall: { id: "call_1", server: "filesystem", tool: "list", input: { dir: this.dir } } };
    yield { token: "Done." };
    yield { done: true as const };
  }
}

describe("orchestrator tool-call path (deterministic, no network)", () => {
  it("executes filesystem.list via policy auto-approve and records it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "va-tool-"));
    writeFileSync(join(dir, "probe.txt"), "hello");
    const events = new EventBus();
    const completed: string[] = [];
    const outputs: unknown[] = [];
    events.subscribe((e) => {
      if (e.type === "tool.completed") completed.push(e.tool);
      if (e.type === "tool.output") outputs.push(e.output);
    });
    const db = new Database(":memory:");
    const conv = db.createConversation("tool-test");
    const mcp = new McpManager();
    registerFilesystemTools(mcp);
    const policy = new PolicyEngine();
    policy.configure({ workspaceRoots: [dir] });
    const orch = new Orchestrator({
      events, llm: new ScriptedToolLLM(dir), mcp,
      policy, approvals: new ApprovalStore(), db, state: new ConversationState(),
    });
    const reply = await orch.handleUserText(conv, "list the dir");
    expect(completed).toContain("filesystem.list");
    expect(JSON.stringify(outputs)).toContain("probe.txt");
    expect(reply).toContain("Done.");
    db.close();
  });
});
