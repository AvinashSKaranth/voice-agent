# Voice Agent (local-first voice desktop agent)

Implements BRD v0.3 (`.document/voice-agent-brd.md`).

## Layout

- `apps/agent/` — Node.js/TypeScript runtime: voice pipeline → orchestrator → MCP tools, localhost WebSocket (`ws://127.0.0.1:3790`), SQLite, OpenRouter LLM layer
- `apps/desktop/` — Tauri 2 + Svelte 5 UI (conversation, transcript, tool activity, approvals, settings)
- `packages/protocol/` — `AgentEvent`, IPC contracts
- `packages/schemas/` — Zod tool/config schemas
- `packages/audio/` — ring buffer, resampling
- `packages/mcp-tools/` — first-party server registry
- `workflows/deploy-service.yaml` — reference workflow (FR-WF-05)
- `native/` — whisper/TTS/platform adapter notes
- `models/` — downloaded on first run (not committed)

## Quick start

```sh
pnpm install
pnpm --filter @voice-agent/agent test
pnpm --filter @voice-agent/agent dev  # runtime on 127.0.0.1:3790
# In another shell:
pnpm --filter @voice-agent/desktop dev  # UI on :1420
```

Set `OPENROUTER_API_KEY` (or OS keychain entry) for live LLM calls. Without a key the runtime starts with a dev placeholder and tests use an echo LLM.

## Safety

- Audio never leaves the machine (BR-01); only text prompts go to the LLM provider.
- Every tool passes risk → policy → auto/ask/deny in the runtime (NFR-07). Destructive actions require approval.
- Secrets only in OS keychain / env, never config or DB (BR-04).
