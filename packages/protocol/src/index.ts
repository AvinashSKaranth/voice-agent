/** AgentEvent stream (BRD §16, FR-OBS-01). Single typed stream UI/logger/telemetry subscribe to. */

export type AgentEvent =
  | { type: "speech.started" }
  | { type: "speech.partial"; text: string }
  | { type: "speech.final"; text: string }
  | { type: "speech.interrupted" }
  | { type: "llm.started"; conversationId: string }
  | { type: "llm.token"; text: string }
  | { type: "tool.requested"; tool: string; input: unknown }
  | { type: "tool.approval_required"; tool: string; approvalId: string }
  | { type: "tool.started"; tool: string }
  | { type: "tool.output"; tool: string; output: unknown }
  | { type: "tool.completed"; tool: string; durationMs: number }
  | { type: "tts.started"; text: string }
  | { type: "tts.completed" }
  | { type: "task.started"; taskId: string }
  | { type: "task.completed"; taskId: string }
  | { type: "task.failed"; taskId: string; error: string };

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "interrupted";

export interface AgentRequest {
  conversationId: string;
  messages: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string; toolName?: string }>;
  tools?: Array<{ server: string; name: string; description: string; inputSchema: unknown }>;
  model?: string;
  maxTokens?: number;
}

export interface IpcEnvelope<T = unknown> {
  id: string;
  kind: "event" | "request" | "response";
  payload: T;
}

/** WebSocket message from desktop client -> runtime */
export type ClientMessage =
  | { kind: "chat"; conversationId: string; text: string }
  | { kind: "approve"; approvalId: string; decision: "allow-once" | "allow-task" | "allow-workspace" | "deny" }
  | { kind: "cancel-task"; taskId: string }
  | { kind: "pause"; paused: boolean }
  | { kind: "voice-state"; state: VoiceState };
