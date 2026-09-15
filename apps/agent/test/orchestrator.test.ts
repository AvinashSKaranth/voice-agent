import { describe, it, expect } from "vitest";
import { EventBus } from "../src/agent/eventBus.js";
import { ConversationState } from "../src/agent/conversationState.js";
import { Orchestrator } from "../src/agent/orchestrator.js";
import { McpManager } from "../src/mcp/manager.js";
import { PolicyEngine } from "../src/permissions/policy.js";
import { ApprovalStore } from "../src/permissions/approvals.js";
import { Database } from "../src/storage/db.js";
import type { LLMProvider } from "../src/llm/types.js";

class EchoLLM implements LLMProvider {
  readonly name = "echo";
  async *stream(req: { messages: Array<{ content: string }> } & object) {
    const last = [...req.messages].reverse().find((m) => m.content)?.content ?? "";
    const reply = `Heard: ${last}`;
    for (const word of reply.split(" ")) yield { token: word + " " };
    yield { done: true as const };
  }
}

describe("orchestrator text round-trip (Phase 0 exit)", () => {
  it("persists conversation + streams reply", async () => {
    const events = new EventBus();
    const tokens: string[] = [];
    events.subscribe((e) => { if (e.type === "llm.token") tokens.push(e.text); });
    const db = new Database(":memory:");
    const conv = db.createConversation("t");
    const mcp = new McpManager();
    mcp.registerTool("filesystem", "search", "s", {}, async () => ({ matches: [] }));
    const orch = new Orchestrator({
      events, llm: new EchoLLM(), mcp,
      policy: new PolicyEngine(), approvals: new ApprovalStore(),
      db, state: new ConversationState(),
    });
    const reply = await orch.handleUserText(conv, "hello agent");
    expect(reply).toContain("hello agent");
    expect(tokens.join("")).toContain("hello agent");
    expect(db.getMessages(conv).length).toBe(2);
    db.close();
  });
});
