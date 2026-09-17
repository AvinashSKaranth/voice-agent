import type { AgentRequest } from "@voice-agent/protocol";
import type { LLMChunk, LLMProvider } from "./types.js";

/** Provider tool names allow only [a-zA-Z0-9_-]; namespace with double underscore. */
export const toProviderToolName = (server: string, tool: string): string =>
  `${server.replace(/[^a-zA-Z0-9_-]/g, "_")}__${tool.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

export function fromProviderToolName(name: string): { server: string; tool: string } {
  const i = name.indexOf("__");
  if (i > 0) return { server: name.slice(0, i), tool: name.slice(i + 2) };
  const dot = name.indexOf(".");
  if (dot > 0) return { server: name.slice(0, dot), tool: name.slice(dot + 1) };
  return { server: "", tool: name };
}

/**
 * Real OpenAI-compatible streaming provider (FR-LLM-01/02).
 * Serves OpenRouter (default) and NVIDIA NIM — both expose /chat/completions SSE.
 * Key MUST come from env/OS keychain at runtime; only key NAMES are ever logged (BR-04).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  constructor(
    name: string,
    private apiKey: string,
    private model: string,
    private baseUrl: string,
    private keyName: string,
    private extraHeaders: Record<string, string> = {},
  ) {
    this.name = name;
    if (!apiKey) throw new Error(`Missing API key: set ${keyName} env var or OS keychain entry`);
  }

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
        ...this.extraHeaders,
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
                  name: toProviderToolName(t.server, t.name),
                  description: t.description,
                  parameters: t.inputSchema ?? { type: "object" },
                },
              })),
            }
          : {}),
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`${this.name} HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // Key tool-call fragments by stream `index` (stable across deltas);
    // `id`/`name` arrive on the first delta only and must be retained.
    const toolBuffers = new Map<number | string, { id: string; server: string; tool: string; args: string }>();
    let anonCalls = 0;
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
              const key = typeof tc.index === "number" ? tc.index : (tc.id ?? `anon-${anonCalls++}`);
              const prev = toolBuffers.get(key) ?? { id: "", server: "", tool: "", args: "" };
              if (typeof tc.id === "string" && tc.id) prev.id = tc.id;
              const fname: string = tc.function?.name ?? "";
              if (fname) {
                const { server, tool } = fromProviderToolName(fname);
                prev.server = server;
                prev.tool = tool;
              }
              prev.args += String(tc.function?.arguments ?? "");
              toolBuffers.set(key, prev);
            }
          } catch { /* partial SSE line */ }
        }
        if (signal.aborted) return;
      }
      for (const b of toolBuffers.values()) {
        if (!b.server || !b.tool) continue; // incomplete fragment — never surface junk calls
        const id = b.id || `${b.server}-${b.tool}`;
        let input: unknown = {};
        try { input = b.args ? JSON.parse(b.args) : {}; } catch { input = { _raw: b.args }; }
        yield { toolCall: { id, server: b.server, tool: b.tool, input } };
      }
      yield { done: true };
    } finally {
      reader.releaseLock();
    }
  }

  /** Cheap non-streaming call for health checks. Returns status + short text only. */
  async ping(text = "Reply with exactly: ok"): Promise<{ status: number; text: string }> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30_000);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: ctl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://github.com/voice-agent",
          "X-Title": "voice-agent",
          ...this.extraHeaders,
        },
        body: JSON.stringify({ model: this.model, stream: false, max_tokens: 8, messages: [{ role: "user", content: text }] }),
      });
      const body = await res.text().catch(() => "");
      let out = "";
      try {
        const json = JSON.parse(body);
        out = String(json.choices?.[0]?.message?.content ?? json.error?.message ?? "").slice(0, 120);
      } catch { out = body.slice(0, 120); }
      return { status: res.status, text: out };
    } finally { clearTimeout(t); }
  }
}
