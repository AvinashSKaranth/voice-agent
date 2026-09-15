import type { AgentRequest } from "@voice-agent/protocol";
import type { LLMChunk, LLMProvider } from "./types.js";

/**
 * OpenRouter provider (default). Uses OpenAI-compatible /chat/completions SSE.
 * API key comes from OS keychain / OPENROUTER_API_KEY env (never config file — BR-04).
 */
export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  constructor(
    private apiKey: string,
    private model: string = "openai/gpt-4o-mini",
    private baseUrl = "https://openrouter.ai/api/v1",
  ) {}

  async *stream(request: AgentRequest, signal: AbortSignal): AsyncIterable<LLMChunk> {
    const model = request.model ?? this.model;
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/voice-agent",
        "X-Title": "voice-agent",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                type: "function",
                function: {
                  name: `${t.server}.${t.name}`,
                  description: t.description,
                  parameters: t.inputSchema ?? { type: "object" },
                },
              })),
            }
          : {}),
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 500));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const toolBuffers = new Map<string, { server: string; tool: string; args: string }>();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") { yield { done: true }; return; }
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;
            if (typeof delta?.content === "string" && delta.content) yield { token: delta.content };
            for (const tc of delta?.tool_calls ?? []) {
              const name: string = tc.function?.name ?? "";
              const [server, ...rest] = name.split(".");
              const key = String(tc.id ?? `${server}-${rest.join(".")}`);
              const prev = toolBuffers.get(key) ?? { server: server ?? "", tool: rest.join("."), args: "" };
              prev.args += String(tc.function?.arguments ?? "");
              toolBuffers.set(key, prev);
            }
          } catch { /* partial SSE line */ }
        }
        if (signal.aborted) return;
      }
      for (const [id, b] of toolBuffers) {
        let input: unknown = {};
        try { input = b.args ? JSON.parse(b.args) : {}; } catch { input = { _raw: b.args }; }
        yield { toolCall: { id, server: b.server, tool: b.tool, input } };
      }
      yield { done: true };
    } finally {
      reader.releaseLock();
    }
  }
}
