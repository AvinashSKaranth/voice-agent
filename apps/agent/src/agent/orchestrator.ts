import { createLogger } from "@voice-agent/shared";
import type { AgentEvent } from "@voice-agent/protocol";
import { EventBus } from "../agent/eventBus.js";
import { ConversationState } from "../agent/conversationState.js";
import type { LLMProvider } from "../llm/types.js";
import { McpManager } from "../mcp/manager.js";
import { PolicyEngine } from "../permissions/policy.js";
import { ApprovalStore } from "../permissions/approvals.js";
import { Database } from "../storage/db.js";
import { splitSentences } from "../voice/sentenceSplitter.js";
import type { SpeechSynthesizer } from "../voice/synthesizer.js";
import { newId } from "@voice-agent/shared";

export interface OrchestratorDeps {
  events: EventBus;
  llm: LLMProvider;
  mcp: McpManager;
  policy: PolicyEngine;
  approvals: ApprovalStore;
  db: Database;
  tts?: SpeechSynthesizer;
  state: ConversationState;
}

/**
 * Orchestrator: LLM tool-calling loop with permission gates, cancellation,
 * persistence and sentence-level TTS pipelining (FR-LLM-03/04/05, FR-VO-01).
 */
export class Orchestrator {
  private log = createLogger("orchestrator");
  private inFlight = new Map<string, AbortController>();
  paused = false;

  constructor(private d: OrchestratorDeps) {}

  async handleUserText(conversationId: string, text: string): Promise<string> {
    const { events, llm, mcp, policy, approvals, db, tts, state } = this.d;
    const taskId = newId("task");
    const ctl = new AbortController();
    this.inFlight.set(taskId, ctl);
    db.createTask(taskId, conversationId);
    db.addMessage(conversationId, "user", text);
    events.emit({ type: "task.started", taskId });
    events.emit({ type: "llm.started", conversationId });
    state.toThinking();

    const tools = mcp.listTools().map((t) => ({
      server: t.server, name: t.name, description: t.description, inputSchema: t.inputSchema,
    }));
    let fullText = "";
    try {
      const stream = llm.stream({ conversationId, messages: db.getMessages(conversationId), tools }, ctl.signal);
      let sentenceBuf = "";
      for await (const chunk of stream) {
        if (ctl.signal.aborted) break;
        if (chunk.token) {
          fullText += chunk.token;
          sentenceBuf += chunk.token;
          events.emit({ type: "llm.token", text: chunk.token });
          const done = splitSentences(sentenceBuf);
          if (done.length > 1 || (chunk.done && sentenceBuf.trim())) {
            const ready = done.length > 1 ? done.slice(0, -1) : [sentenceBuf];
            sentenceBuf = done.length > 1 ? done[done.length - 1]! : "";
            for (const s of ready) {
              if (!s.trim()) continue;
              events.emit({ type: "tts.started", text: s.trim() });
              state.toSpeaking();
              if (tts) {
                try {
                  for await (const _pcm of tts.synthesize(s.trim(), ctl.signal)) {
                    if (ctl.signal.aborted) break;
                  }
                } catch { /* TTS best-effort */ }
              }
              events.emit({ type: "tts.completed" });
            }
          }
        }
        if (chunk.toolCall) {
          await this.runTool(taskId, conversationId, chunk.toolCall.server, chunk.toolCall.tool, chunk.toolCall.input, ctl.signal);
        }
        if (chunk.done) break;
      }
      if (sentenceBuf.trim() && !ctl.signal.aborted) {
        events.emit({ type: "tts.started", text: sentenceBuf.trim() });
        events.emit({ type: "tts.completed" });
      }
      db.addMessage(conversationId, "assistant", fullText);
      db.completeTask(taskId, "completed");
      events.emit({ type: "task.completed", taskId });
      state.toIdle();
      return fullText;
    } catch (err) {
      const msg = String(err);
      if (ctl.signal.aborted) {
        db.completeTask(taskId, "cancelled");
        events.emit({ type: "task.failed", taskId, error: "cancelled" });
        return fullText;
      }
      this.log.error("orchestrator-failed", { taskId, err: msg });
      db.completeTask(taskId, "failed");
      events.emit({ type: "task.failed", taskId, error: msg });
      throw err;
    } finally {
      this.inFlight.delete(taskId);
    }
  }

  private async runTool(taskId: string, conversationId: string, server: string, tool: string, input: unknown, signal: AbortSignal): Promise<void> {
    const { events, mcp, policy, approvals, db } = this.d;
    const evt: AgentEvent = { type: "tool.requested", tool: `${server}.${tool}`, input };
    events.emit(evt);
    const verdict = policy.evaluate({ server, tool, input });
    if (verdict === "deny") {
      db.recordTool(taskId, server, tool, input, { error: "denied by policy" }, "denied", 0);
      events.emit({ type: "tool.output", tool: `${server}.${tool}`, output: { error: "Denied by permission policy" } });
      return;
    }
    if (verdict === "ask") {
      if (this.paused) {
        db.recordTool(taskId, server, tool, input, { error: "paused" }, "denied", 0);
        return;
      }
      const approvalId = approvals.request(taskId, `${server}.${tool}`, input);
      events.emit({ type: "tool.approval_required", tool: `${server}.${tool}`, approvalId });
      const decision = await approvals.waitFor(approvalId, signal);
      db.recordApproval(approvalId, taskId, decision, "ui");
      if (decision === "deny") {
        db.recordTool(taskId, server, tool, input, { error: "denied by user" }, "denied", 0);
        return;
      }
    }
    if (this.paused) return;
    events.emit({ type: "tool.started", tool: `${server}.${tool}` });
    const t0 = Date.now();
    try {
      const output = await mcp.callTool(server, tool, input, signal);
      const ms = Date.now() - t0;
      db.recordTool(taskId, server, tool, input, output, "completed", ms);
      events.emit({ type: "tool.output", tool: `${server}.${tool}`, output });
      events.emit({ type: "tool.completed", tool: `${server}.${tool}`, durationMs: ms });
    } catch (err) {
      const ms = Date.now() - t0;
      db.recordTool(taskId, server, tool, input, { error: String(err) }, "failed", ms);
      events.emit({ type: "tool.output", tool: `${server}.${tool}`, output: { error: String(err) } });
    }
  }

  cancelTask(taskId: string): void {
    this.inFlight.get(taskId)?.abort();
  }
}
