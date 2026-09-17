import type { LLMProvider } from "./types.js";
import { OpenRouterProvider } from "./openrouter.js";
import { OpenAICompatibleProvider } from "./openaiCompatible.js";

export interface ProviderSelection {
  kind: string;
  model: string;
  keyName: string;
  baseUrl: string;
}

/**
 * Provider-agnostic factory (BR-05, FR-LLM-02). Core never depends on a
 * specific vendor; OpenAI/Anthropic/Ollama remain addable without core changes.
 * Resolution order: explicit args > PROVIDER/LLM_MODEL env > config defaults.
 * Only key NAMES are logged — never values (BR-04).
 */
export function resolveSelection(opts: {
  provider?: string;
  model?: string;
}): ProviderSelection {
  const kind = (opts.provider ?? process.env.PROVIDER ?? "openrouter").toLowerCase();
  if (kind === "nvidia" || kind === "nvidia-nim") {
    return {
      kind: "nvidia",
      model: opts.model ?? process.env.LLM_MODEL ?? "meta/llama-3.1-8b-instruct",
      keyName: "NVIDIA_NIM_API_KEY",
      baseUrl: "https://integrate.api.nvidia.com/v1",
    };
  }
  return {
    kind: "openrouter",
    model: opts.model ?? process.env.LLM_MODEL ?? "openai/gpt-4o-mini",
    keyName: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
  };
}

export function createProvider(
  kind: string,
  opts: { apiKey?: string; model?: string; baseUrl?: string; keyName?: string },
): LLMProvider {
  switch (kind) {
    case "openrouter":
      if (opts.baseUrl || opts.keyName) {
        return new OpenAICompatibleProvider(
          "openrouter",
          opts.apiKey ?? "",
          opts.model ?? "openai/gpt-4o-mini",
          opts.baseUrl ?? "https://openrouter.ai/api/v1",
          opts.keyName ?? "OPENROUTER_API_KEY",
        );
      }
      if (!opts.apiKey) throw new Error("Missing API key for openrouter (set OPENROUTER_API_KEY or OS keychain)");
      return new OpenRouterProvider(opts.apiKey, opts.model);
    case "nvidia":
      return new OpenAICompatibleProvider(
        "nvidia",
        opts.apiKey ?? "",
        opts.model ?? "meta/llama-3.1-8b-instruct",
        opts.baseUrl ?? "https://integrate.api.nvidia.com/v1",
        opts.keyName ?? "NVIDIA_NIM_API_KEY",
      );
    default:
      throw new Error(`Unknown LLM provider: ${kind}. Supported: openrouter, nvidia`);
  }
}
