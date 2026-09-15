import type { AgentRequest } from "@voice-agent/protocol";

export interface LLMChunk {
  token?: string;
  toolCall?: { id: string; server: string; tool: string; input: unknown };
  done?: boolean;
}

export interface LLMProvider {
  readonly name: string;
  stream(request: AgentRequest, signal: AbortSignal): AsyncIterable<LLMChunk>;
}
