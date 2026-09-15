import type { LLMProvider } from "./types.js";
import { OpenRouterProvider } from "./openrouter.js";

/** Provider-agnostic factory (BR-05, FR-LLM-02). OpenAI/Anthropic/Ollama can be added without core changes. */
export function createProvider(kind: string, opts: { apiKey?: string; model?: string; baseUrl?: string }): LLMProvider {
  switch (kind) {
    case "openrouter":
      if (!opts.apiKey) throw new Error("Missing API key for openrouter (set OPENROUTER_API_KEY or OS keychain)");
      return new OpenRouterProvider(opts.apiKey, opts.model, opts.baseUrl);
    default:
      throw new Error(`Unknown LLM provider: ${kind}. Supported: openrouter`);
  }
}
