# Local-First Voice Desktop Agent

## Business Requirements Document & System Requirements Specification

|                      |                        |
| -------------------- | ---------------------- |
| **Document version** | 0.3 (draft for review) |
| **Date**             | 16 September 2026      |
| **Status**           | Draft                  |
| **Working title**    | Voice Agent            |

---

## Part A — Business Requirements Document

### 1. Executive summary

This project delivers a **local-first desktop agent** that a user operates primarily by voice. Unlike a voice chatbot, the agent can act on the user's machine: read and write files, start and stop services, drive a browser, operate desktop applications, and delegate coding work to a specialist coding agent (OpenCode). Speech recognition and speech synthesis run locally; the reasoning model is accessed through a provider-agnostic LLM layer (OpenRouter by default).

The single most important architectural decision is that the product is **agent-first, voice-second**. The agent runtime is an independent process with a stable event and tool protocol; voice, the desktop UI, and any future interfaces (CLI, hotkey, web, mobile) are clients of that runtime.

### 2. Problem statement

Today, getting real work done with an AI assistant on a developer's machine requires constant context switching: copy code into a chat, paste results back, open a terminal, run a deploy, check a browser. Existing voice assistants are conversational only and cannot act on the local system, and existing coding agents are text-only and scoped to a repository. There is no single assistant that can be spoken to naturally, interrupted mid-sentence, and trusted to carry out multi-step tasks across the filesystem, OS, browser and codebase under user-controlled permissions.

### 3. Vision

> "Open my album-builder project, check what I was working on, fix the bug where new images don't appear, start the backend, then go to the deployment page and deploy 1.8."

The user says this once. The agent finds the project, reads OpenCode session context, delegates the fix, verifies with tests, starts the service, checks its health, drives the browser through the deployment flow, pauses for approval at the risky step, and reports back — by voice, while the user is free to interrupt at any point.

### 4. Goals and objectives

| ID   | Goal                                   | Measure of success                                                                                                                      |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 | Natural, low-latency voice interaction | Median time from end of user speech to first audible response ≤ 1.5 s on the reference machine                                          |
| G-02 | Reliable barge-in                      | User can interrupt the assistant mid-sentence; false interruptions from the assistant's own audio < 1 per 30 minutes of speaking        |
| G-03 | Real system agency                     | Filesystem, process/service, browser, computer-use and coding-agent tools all usable from a single conversation                         |
| G-04 | Safety and control                     | Every side-effecting action passes through a permission layer; no destructive action executes without policy approval; full audit trail |
| G-05 | Privacy by default                     | Audio never leaves the machine; only text prompts are sent to the LLM provider; secrets stored in the OS keychain                       |
| G-06 | Extensibility                          | New tools added via MCP without changing the agent core; new interfaces added without changing the agent core                           |
| G-07 | Cross-platform foundation              | Windows is the primary v1 target; all tool interfaces are platform-neutral so macOS/Linux can follow                                    |

### 5. Scope

#### 5.1 In scope (v1)

- Windows desktop application (Tauri 2) with a Svelte 5 UI showing conversation, live transcript, tool activity, approvals, task progress and settings
- Standalone agent runtime (Node.js/TypeScript) reachable over local IPC/WebSocket
- Local streaming English ASR (whisper.cpp running distil-small.en, tiny.en fallback) with VAD (Silero) and turn detection
- Local streaming TTS with sentence-level pipelining
- Barge-in state machine with echo suppression
- Provider-agnostic LLM layer with OpenRouter as the default provider
- MCP host supporting stdio and Streamable HTTP servers
- First-party tool servers: filesystem, process/service, shell (scoped), computer-use (Windows), OpenCode controller
- Playwright MCP integration for browser automation
- Capability-based permission and approval system
- Workflow engine for defined multi-step processes (e.g. deploy)
- SQLite persistence of conversations, tasks, tool executions, approvals and settings
- Structured logging and tracing (OpenTelemetry)

#### 5.2 Out of scope (v1)

- macOS and Linux computer-use implementations (interfaces defined; implementations deferred)
- Wake-word detection (push-to-talk and an explicit listen toggle are v1)
- Multi-user or team features
- Cloud sync of conversations or settings
- Mobile clients
- Training or fine-tuning of any models
- Non-English speech recognition (English-only ASR models are used deliberately for accuracy and speed)
- Automatic installation of third-party MCP servers (manual configuration in v1)

### 6. Stakeholders and personas

| Persona                          | Description                                                                                                              | Primary needs                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Developer-operator (primary)** | Runs several projects locally, uses OpenCode, deploys services, frequently switches between terminal, editor and browser | Hands-free task delegation; trustworthy automation; clear visibility into what the agent did |
| **Power user**                   | Non-developer who wants to automate desktop and browser chores by voice                                                  | Simple approval prompts; safe defaults; minimal configuration                                |
| **Contributor/integrator**       | Adds new MCP servers or interfaces                                                                                       | Stable protocol and event model; clear extension points                                      |

### 7. Business rules and constraints

| ID    | Rule                                                                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BR-01 | Audio data is processed locally and never transmitted to a remote service.                                                                                                                                                           |
| BR-02 | The LLM never receives a raw, unscoped "execute anything" tool. All OS access is mediated by named, scoped tools.                                                                                                                    |
| BR-03 | Any action classified as destructive or externally visible (delete, git push, send, purchase, kill process, modify system settings) requires explicit user approval unless the user has deliberately whitelisted it for a workspace. |
| BR-04 | API keys, tokens and credentials are stored only in the OS credential store, never in config files or the database.                                                                                                                  |
| BR-05 | The agent core must have no compile-time dependency on any specific LLM provider, ASR engine or TTS engine.                                                                                                                          |
| BR-06 | The coding agent (OpenCode) owns repository analysis and code changes; the voice agent orchestrates and does not duplicate that capability.                                                                                          |
| BR-07 | Every tool execution is recorded with inputs, outputs, timing, approval decision and originating task.                                                                                                                               |

### 8. Assumptions

- The reference machine is a Windows laptop with **8 GB RAM**, no discrete GPU, and a CPU capable of running quantized `distil-small.en` in real time for short utterances. Low memory use is a design constraint, not an afterthought.
- The user has an OpenRouter account (or another supported provider) and is responsible for API costs.
- OpenCode is installed and on `PATH`, or the user provides its location.
- The user accepts that the LLM may occasionally misinterpret intent; the permission layer, not model accuracy, is the safety guarantee.

### 9. Risks

| ID   | Risk                                                                                                                                                                       | Impact | Mitigation                                                                                                                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | TinyTTS (~1.6 M params) voice quality may be judged too robotic for extended use                                                                                           | Medium | Keep TTS behind an interface; ship a second, higher-quality local engine (e.g. Piper or Kokoro ONNX) as a selectable option; evaluate in user testing before v1 lock                                                                           |
| R-02 | False barge-in from speaker bleed into the microphone                                                                                                                      | High   | Playback-state gating, VAD sensitivity reduction while speaking, speech persistence threshold, and WebRTC AEC as a stretch goal; test on laptop speakers, not just headsets                                                                    |
| R-03 | Computer-use automation is brittle and OS-specific                                                                                                                         | High   | Prefer UI Automation/accessibility APIs over pixel clicking; fall back to screenshot + coordinates only when necessary; keep implementations behind a platform-neutral interface                                                               |
| R-04 | LLM takes an unexpected or unsafe action                                                                                                                                   | High   | Permission layer, workflow engine constraining step order, dry-run mode for workflows, approval prompts with clear previews                                                                                                                    |
| R-05 | whisper.cpp native binding complexity across Node/Tauri                                                                                                                    | Medium | Run whisper.cpp as a managed child process (or via the Rust side of Tauri) behind the `SpeechRecognizer` interface; avoid tight coupling to a specific binding                                                                                 |
| R-09 | `distil-small.en` accuracy (~12 % short-form WER) may misrecognize project names and technical terms; its shallow decoder may degrade partial transcripts during streaming | Medium | Benchmark partials in Phase 1; custom vocabulary/prompt biasing with known project and tool names; automatic fallback to `tiny.en` on very weak hardware; optional upgrade to `distil-large-v3` on capable machines; user override in settings |
| R-06 | Latency stacks up across ASR → LLM → TTS                                                                                                                                   | High   | Streaming at every stage; sentence-level TTS; partial transcripts; prompt caching where the provider supports it                                                                                                                               |
| R-07 | Provider/API drift (OpenRouter, MCP SDK, OpenCode server API)                                                                                                              | Medium | Provider abstraction; pin SDK versions; contract tests against each external API                                                                                                                                                               |
| R-08 | Always-listening microphone raises privacy concerns                                                                                                                        | Medium | Push-to-talk default; visible listening indicator; local-only audio (BR-01); mic can be hard-disabled in settings                                                                                                                              |

### 10. Success metrics

| Metric                                                                       | Target                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------- |
| End-of-speech → first audio                                                  | ≤ 1.5 s median, ≤ 3 s p95                      |
| Barge-in stop latency                                                        | ≤ 300 ms from detected speech to playback stop |
| ASR word error rate (clean mic, `distil-small.en`)                           | ≤ 12 %                                         |
| Task completion without manual intervention (defined test suite of 25 tasks) | ≥ 80 %                                         |
| Unapproved destructive actions                                               | 0                                              |
| Idle CPU usage with listening off                                            | ≤ 2 %                                          |
| Total RAM (runtime + UI + loaded ASR/VAD/TTS models, idle)                   | ≤ 1 GB                                         |
| Installer size (excluding models)                                            | ≤ 60 MB                                        |

---

## Part B — System Requirements Specification

### 11. System overview

```text
┌──────────────────────────────────────────────────────────┐
│                     Tauri Desktop (client)               │
│  React UI: conversation · transcript · tool activity     │
│            approvals · task progress · settings          │
└──────────────────────────┬───────────────────────────────┘
                           │ Tauri IPC / localhost WebSocket
┌──────────────────────────▼───────────────────────────────┐
│                Agent Runtime (Node.js / TypeScript)      │
│  Voice pipeline  →  Orchestrator  →  Tool layer (MCP)    │
│  ASR · VAD · turn   LLM · planner    filesystem · shell  │
│  detection          permissions      process/service     │
│  Voice output       workflows        browser · computer  │
│  sentence split ·   task state       OpenCode · external │
│  TTS · playback     cancellation     MCP servers         │
└────────────┬──────────────────────────────┬──────────────┘
             ▼                              ▼
      Local models                      OS / applications
      Whisper · Silero VAD · TTS        files · processes · browser
                                        terminal · OpenCode
```

### 12. Technology stack

| Area               | Selection                                                                             | Rationale                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell      | Tauri 2                                                                               | Cross-platform, native permission scopes, small footprint                                                                                         |
| UI                 | Svelte 5 + TypeScript (Vite, no SSR)                                                  | Runes-based fine-grained reactivity suits high-frequency token/transcript updates; small bundle; Tauri ships an official template                 |
| Agent runtime      | Node.js + TypeScript (pnpm monorepo)                                                  | Best fit for MCP, Playwright, OpenRouter, subprocess management                                                                                   |
| LLM access         | OpenRouter behind `LLMProvider` interface                                             | Model flexibility without lock-in                                                                                                                 |
| Tool protocol      | MCP TypeScript SDK v2 (stdio + Streamable HTTP)                                       | Standard, current, supports local and remote servers                                                                                              |
| ASR runtime        | whisper.cpp                                                                           | Native, fast, cross-platform, built-in VAD support, GGML quantization                                                                             |
| ASR model          | distil-small.en (GGML Q5) default; tiny.en fallback; distil-large-v3 optional upgrade | English-only; ~166 M params, ~100–170 MB on disk, sub-500 MB RAM; near-small.en accuracy at near-base.en speed; fewer hallucinations than base.en |
| VAD                | Silero VAD                                                                            | Accurate local speech-boundary detection                                                                                                          |
| TTS                | TinyTTS ONNX (default) + pluggable second engine                                      | Tiny and fast; second engine mitigates quality risk (R-01)                                                                                        |
| Browser automation | Playwright + Playwright MCP                                                           | Robust, already exposed as MCP tools                                                                                                              |
| Computer use       | Native OS automation (Win32 / UI Automation / PowerShell for v1)                      | More reliable than forcing everything through the browser                                                                                         |
| Coding agent       | OpenCode (server API + CLI)                                                           | Strong MCP support; persistent `opencode serve` avoids cold starts                                                                                |
| Persistence        | SQLite                                                                                | Sufficient for a single-user local app                                                                                                            |
| Validation         | Zod                                                                                   | Schema validation for tool inputs/outputs and config                                                                                              |
| Observability      | OpenTelemetry + structured JSON logs                                                  | Trace agent and tool execution                                                                                                                    |
| Secrets            | OS keychain (Windows Credential Manager / Keychain / Secret Service)                  | Never in config or DB                                                                                                                             |

### 13. Functional requirements

Priority uses MoSCoW: **M** must, **S** should, **C** could.

#### 13.1 Voice input

| ID       | Requirement                                                                                                                                                                                                                  | Priority |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-VI-01 | The system shall capture microphone audio into a ring buffer and run VAD continuously while in the LISTENING or SPEAKING state.                                                                                              | M        |
| FR-VI-02 | The system shall produce partial transcripts while the user is speaking and a final transcript at end of turn.                                                                                                               | M        |
| FR-VI-03 | The system shall detect end of turn using VAD silence duration with configurable thresholds (min speech, min silence, speech padding).                                                                                       | M        |
| FR-VI-04 | The ASR engine shall be accessed only through a `SpeechRecognizer` interface (`start`, `stop`, `onPartial`, `onFinal`, `onSpeechStart`, `onSpeechEnd`).                                                                      | M        |
| FR-VI-05 | The system shall ship `distil-small.en` (quantized GGML) as the default ASR model and `tiny.en` as the minimal-resource fallback, selecting automatically from a benchmark on first run with a user override in settings.    | M        |
| FR-VI-06 | The system shall support push-to-talk and a persistent listen toggle.                                                                                                                                                        | M        |
| FR-VI-07 | The system shall support additional whisper.cpp-compatible models (e.g. distil-large-v3, distil-large-v3.5, base.en, small.en) via configuration without code changes, so users with more RAM can trade memory for accuracy. | S        |
| FR-VI-09 | The system shall bias recognition toward known vocabulary (workspace/project names, tool names, configured terms) using whisper.cpp's initial-prompt mechanism.                                                              | S        |
| FR-VI-08 | The system shall support wake-word activation.                                                                                                                                                                               | C        |

#### 13.2 Barge-in and conversation state

| ID       | Requirement                                                                                                                                                                        | Priority |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-BI-01 | The system shall implement the conversation state machine IDLE → LISTENING → THINKING → SPEAKING → INTERRUPTED → LISTENING.                                                        | M        |
| FR-BI-02 | While SPEAKING, detected user speech shall stop TTS playback within 300 ms and transition to INTERRUPTED.                                                                          | M        |
| FR-BI-03 | On interruption, the system shall cancel the in-flight LLM stream and any pending TTS queue, and shall record what was said up to the interruption point.                          | M        |
| FR-BI-04 | The system shall suppress false interruptions by: tracking playback state, lowering VAD sensitivity while speaking, and requiring speech persistence of 100–200 ms (configurable). | M        |
| FR-BI-05 | The system shall support acoustic echo cancellation using a speaker output reference (e.g. WebRTC audio processing).                                                               | S        |
| FR-BI-06 | Interrupting during tool execution shall pause voice output but shall not cancel a tool that is mid-execution unless the user explicitly cancels the task.                         | M        |

#### 13.3 Voice output

| ID       | Requirement                                                                                                                                                             | Priority |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-VO-01 | The system shall split the LLM token stream into sentences and synthesize each sentence as soon as it is complete, playing it while subsequent sentences are generated. | M        |
| FR-VO-02 | Sentence boundaries shall be `.`, `?`, `!`, `:`, `;` with exclusion rules for abbreviations (Dr., Mr., e.g., etc.), decimals (3.14) and version strings (v1.2).         | M        |
| FR-VO-03 | TTS shall run in-process via ONNX Runtime producing a PCM stream; no intermediate WAV files or external Python service.                                                 | M        |
| FR-VO-04 | The TTS engine shall be accessed only through a `SpeechSynthesizer` interface so engines can be swapped.                                                                | M        |
| FR-VO-05 | The system shall offer at least one alternative local TTS engine selectable in settings.                                                                                | S        |
| FR-VO-06 | Code blocks, file paths and long identifiers shall be summarized rather than read verbatim, with the full text shown in the UI.                                         | S        |

#### 13.4 LLM and orchestration

| ID        | Requirement                                                                                                                                              | Priority |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-LLM-01 | All model access shall go through `LLMProvider.stream(request): AsyncIterable<LLMEvent>`.                                                                | M        |
| FR-LLM-02 | An OpenRouter provider shall be implemented; OpenAI, Anthropic and local (Ollama) providers shall be implementable without changes to the agent core.    | M        |
| FR-LLM-03 | The orchestrator shall support tool calling with the set of tools exposed by connected MCP servers and first-party tools, filtered by permission policy. | M        |
| FR-LLM-04 | The orchestrator shall maintain conversation context across turns and shall persist it to SQLite.                                                        | M        |
| FR-LLM-05 | The orchestrator shall support cancellation of an in-flight response and in-flight task at any time.                                                     | M        |
| FR-LLM-06 | The system shall allow the user to change the default model and per-task model in settings.                                                              | S        |

#### 13.5 MCP host and tool layer

| ID        | Requirement                                                                                                                                                       | Priority |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-MCP-01 | The agent shall act as an MCP host using the MCP TypeScript SDK v2, supporting stdio and Streamable HTTP transports.                                              | M        |
| FR-MCP-02 | MCP servers shall be configurable (command/args or URL, environment, enabled flag) and shall be started, stopped and health-checked by an MCP manager.            | M        |
| FR-MCP-03 | Tools, resources and prompts from each server shall be discovered at connect time and namespaced by server.                                                       | M        |
| FR-MCP-04 | The system shall ship first-party MCP servers for filesystem, process/service, scoped shell, computer use and OpenCode.                                           | M        |
| FR-MCP-05 | The system shall integrate Playwright MCP for browser automation.                                                                                                 | M        |
| FR-MCP-06 | The system shall never expose an unscoped `execute(command)` tool to the LLM. Shell access shall be limited to an allow-list of commands and working directories. | M        |
| FR-MCP-07 | Tool inputs and outputs shall be validated against schemas (Zod) before execution and before being returned to the LLM.                                           | M        |

#### 13.6 First-party tools

| Tool family                    | Operations (minimum)                                                                                                             | Priority                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `filesystem`                   | `read`, `write`, `list`, `search`, `move`, `delete` — scoped to allowed workspace paths                                          | M                              |
| `process`                      | `list`, `start`, `stop`, `restart` — scoped to allowed commands                                                                  | M                              |
| `service`                      | `list`, `start`, `stop`, `restart`, `status` (Windows services in v1)                                                            | M                              |
| `shell`                        | `exec` — allow-listed commands, timeout, captured stdout/stderr                                                                  | M                              |
| `http`                         | `health_check`, `request` (for verification steps)                                                                               | S                              |
| `browser` (via Playwright MCP) | `open`, `navigate`, `click`, `type`, `select`, `extract`, `screenshot`                                                           | M                              |
| `computer`                     | `screenshot`, `mouse_move`, `click`, `double_click`, `type`, `key`, `scroll`, `focus_window`, `list_windows`, `open_application` | M (Windows) / S (macOS, Linux) |
| `opencode`                     | `startServer`, `createSession`, `sendPrompt`, `getSession`, `continueSession`, `openProject`, `openTUI`                          | M                              |

#### 13.7 OpenCode integration

| ID       | Requirement                                                                                                                                               | Priority |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-OC-01 | The `OpenCodeController` shall attach to a running `opencode serve` instance if present, otherwise start one, and shall communicate via its HTTP API.     | M        |
| FR-OC-02 | The agent shall be able to open a project, create or continue a session, send a prompt, and stream results back into the conversation.                    | M        |
| FR-OC-03 | The agent shall summarize OpenCode results for voice output and show full diffs/output in the UI.                                                         | M        |
| FR-OC-04 | Repository analysis, code editing, test execution and git operations shall be delegated to OpenCode rather than reimplemented in the voice agent (BR-06). | M        |
| FR-OC-05 | MCP server configuration shall be shareable between the voice agent and OpenCode where the schemas permit.                                                | C        |

#### 13.8 Permissions and approvals

| ID         | Requirement                                                                                                                                                  | Priority |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-PERM-01 | Every tool request shall pass through: risk classification → permission policy → auto-approve / ask user / deny.                                             | M        |
| FR-PERM-02 | Default policy shall follow the table below; all defaults shall be overridable per workspace.                                                                | M        |
| FR-PERM-03 | Approval prompts shall show the tool, arguments, affected paths/resources and the originating task, and shall be answerable by voice ("yes", "no") or click. | M        |
| FR-PERM-04 | Approvals may be granted once, for the current task, or permanently for the workspace; permanent grants shall be listed and revocable in settings.           | M        |
| FR-PERM-05 | Filesystem tools shall be sandboxed to configured workspace roots; paths outside them shall be denied regardless of policy.                                  | M        |
| FR-PERM-06 | The system shall provide a global "pause agent" control that halts all pending tool execution.                                                               | M        |

**Default permission policy**

| Action                                                      | Default                    |
| ----------------------------------------------------------- | -------------------------- |
| Read file, search filesystem, list processes                | Auto                       |
| Open application, focus window                              | Auto                       |
| Browser navigation, browser read/extract                    | Auto                       |
| Write file inside workspace                                 | Auto (configurable to Ask) |
| Run tests, start dev server                                 | Auto                       |
| Write file outside workspace                                | Deny                       |
| Delete file, move outside workspace                         | Ask                        |
| Git push, git force operations                              | Ask                        |
| Send email/message, submit form with side effects, purchase | Ask                        |
| Kill process, stop service                                  | Ask                        |
| Modify system settings, registry, environment variables     | Ask                        |
| Shell command not on allow-list                             | Deny                       |

#### 13.9 Workflows

| ID       | Requirement                                                                                                                                                                                    | Priority |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-WF-01 | The system shall support declarative workflows (YAML) defining an ordered list of steps with allowed tools per step, approval gates, verification and rollback.                                | M        |
| FR-WF-02 | Within a workflow step the LLM may choose how to satisfy the step, but may not reorder, skip or add steps.                                                                                     | M        |
| FR-WF-03 | Workflows shall support a dry-run mode that reports the planned actions without executing side effects.                                                                                        | S        |
| FR-WF-04 | Workflow runs shall be persisted with per-step status, outputs and timings, and shall be resumable after a failure where safe.                                                                 | S        |
| FR-WF-05 | A reference `deploy-service` workflow shall be shipped: validate git clean → run tests → build → create artifact → stop service → deploy → start service → health check → rollback on failure. | M        |

#### 13.10 Desktop UI

| ID       | Requirement                                                                                                                                                             | Priority |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-UI-01 | The UI shall show the conversation with streaming text, the live transcript with partial results, a tool activity panel, pending approvals, task progress and settings. | M        |
| FR-UI-02 | The UI shall clearly indicate the current voice state (idle, listening, thinking, speaking) and whether the microphone is active.                                       | M        |
| FR-UI-03 | The UI shall never execute OS commands directly; all actions route through the agent runtime and permission layer.                                                      | M        |
| FR-UI-04 | The UI shall provide a global hotkey for push-to-talk and for cancelling the current task.                                                                              | S        |
| FR-UI-05 | The UI shall provide a history view of past tasks and tool executions with filtering.                                                                                   | S        |

#### 13.11 Persistence and configuration

| ID         | Requirement                                                                                                                                              | Priority |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-DATA-01 | SQLite shall store: `conversation`, `message`, `task`, `task_step`, `tool_execution`, `approval`, `mcp_server`, `permission`, `workflow_run`, `setting`. | M        |
| FR-DATA-02 | Non-secret configuration shall be stored in a YAML/JSON file covering agent, voice, browser, permissions, MCP servers and OpenCode sections.             | M        |
| FR-DATA-03 | Secrets (OpenRouter key, GitHub tokens, MCP OAuth tokens, browser credentials) shall be stored only in the OS credential store.                          | M        |
| FR-DATA-04 | The user shall be able to export and delete all local data.                                                                                              | S        |

#### 13.12 Observability

| ID        | Requirement                                                                                                                                                           | Priority |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-OBS-01 | All modules shall communicate through a typed `AgentEvent` stream (speech, llm, tool, tts, task events); UI, logger and telemetry shall subscribe to the same stream. | M        |
| FR-OBS-02 | Every task shall produce an OpenTelemetry trace spanning ASR, LLM calls, tool executions and TTS.                                                                     | S        |
| FR-OBS-03 | Logs shall be structured JSON with correlation IDs for conversation, task and tool execution.                                                                         | M        |
| FR-OBS-04 | Telemetry shall be local-only by default; any remote export shall be opt-in.                                                                                          | M        |

### 14. Non-functional requirements

| ID     | Category        | Requirement                                                                                                                                                                                                            |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Performance     | End-of-speech → first audio ≤ 1.5 s median on the reference machine with quantized `distil-small.en` and a fast hosted model.                                                                                          |
| NFR-02 | Performance     | Barge-in stop latency ≤ 300 ms.                                                                                                                                                                                        |
| NFR-03 | Performance     | TTS real-time factor ≤ 0.2 on CPU (synthesis at least 5× faster than playback).                                                                                                                                        |
| NFR-04 | Resource use    | Idle CPU ≤ 2 % with listening off; ≤ 15 % while listening (VAD only). Total resident memory ≤ 1 GB with all models loaded; ASR model ≤ 500 MB RAM. Models shall be loaded lazily and unloadable when listening is off. |
| NFR-05 | Privacy         | No audio leaves the device. Only text prompts and tool results the user has permitted are sent to the LLM provider.                                                                                                    |
| NFR-06 | Security        | Tauri shell plugin scopes shall restrict spawnable commands; the agent runtime shall bind only to localhost with an authentication token.                                                                              |
| NFR-07 | Security        | The permission layer shall be enforced in the runtime, not in the UI or in the LLM prompt.                                                                                                                             |
| NFR-08 | Reliability     | Crash of an MCP server or OpenCode shall not crash the agent; the manager shall report and offer restart.                                                                                                              |
| NFR-09 | Reliability     | The agent runtime shall recover persisted conversation and task state on restart.                                                                                                                                      |
| NFR-10 | Portability     | All tool interfaces shall be platform-neutral; platform-specific code shall live in adapter modules.                                                                                                                   |
| NFR-11 | Maintainability | Agent core shall have unit tests; each external integration (OpenRouter, MCP SDK, OpenCode API, Playwright MCP) shall have contract tests.                                                                             |
| NFR-12 | Accessibility   | All voice-driven functions shall also be operable by keyboard and mouse.                                                                                                                                               |
| NFR-13 | Packaging       | Tauri bundling shall produce a Windows installer; models shall be downloaded on first run with progress and checksum verification (model downloads shall be resumable; distil-small.en Q5 is ~100–170 MB).             |

### 15. Data model (logical)

| Entity           | Key fields                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `conversation`   | id, created_at, title, model                                                                       |
| `message`        | id, conversation_id, role, content, created_at, interrupted_at                                     |
| `task`           | id, conversation_id, workflow_id?, status, created_at, completed_at                                |
| `task_step`      | id, task_id, name, status, started_at, completed_at, output                                        |
| `tool_execution` | id, task_id, step_id?, server, tool, input, output, status, duration_ms, approval_id?              |
| `approval`       | id, tool_execution_id, decision, scope (once/task/workspace), decided_by (voice/click), decided_at |
| `mcp_server`     | id, name, transport, command/url, enabled, last_health                                             |
| `permission`     | id, workspace, tool_pattern, policy (auto/ask/deny)                                                |
| `workflow_run`   | id, workflow_id, task_id, status, steps_json                                                       |
| `setting`        | key, value                                                                                         |

### 16. Interfaces and contracts

```ts
interface SpeechRecognizer {
  start(): Promise<void>;
  stop(): Promise<void>;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string) => void): void;
  onSpeechStart(cb: () => void): void;
  onSpeechEnd(cb: () => void): void;
}

interface SpeechSynthesizer {
  synthesize(text: string, signal: AbortSignal): AsyncIterable<PcmChunk>;
}

interface LLMProvider {
  stream(request: AgentRequest, signal: AbortSignal): AsyncIterable<LLMEvent>;
}

type AgentEvent =
  | { type: "speech.started" }
  | { type: "speech.partial"; text: string }
  | { type: "speech.final"; text: string }
  | { type: "speech.interrupted" }
  | { type: "llm.started" }
  | { type: "llm.token"; text: string }
  | { type: "tool.requested"; tool: string; input: unknown }
  | { type: "tool.approval_required"; tool: string; approvalId: string }
  | { type: "tool.started"; tool: string }
  | { type: "tool.output"; tool: string; output: unknown }
  | { type: "tool.completed"; tool: string }
  | { type: "tts.started"; text: string }
  | { type: "tts.completed" }
  | { type: "task.completed"; taskId: string };
```

### 17. Repository structure

```text
voice-agent/
├── apps/
│   ├── desktop/          # Tauri 2 + Svelte 5 (Vite, adapter-static, ssr=false if SvelteKit)
│   └── agent/            # Node runtime
│       └── src/{agent,llm,mcp,tools,permissions,workflows,voice,browser,computer,opencode,storage}
├── packages/
│   ├── protocol/         # AgentEvent, IPC contracts
│   ├── schemas/          # Zod schemas for tools/config
│   ├── audio/            # ring buffer, resampling, playback
│   ├── mcp-tools/        # first-party MCP servers
│   └── shared/
├── native/               # whisper, tts, platform adapters
├── models/               # downloaded at first run
├── workflows/            # YAML workflow definitions
└── docs/
```

### 18. Delivery phases

| Phase                            | Scope                                                                                                                              | Exit criteria                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **0 — Foundation**               | Monorepo, agent runtime skeleton, event stream, SQLite, Tauri shell with minimal UI, OpenRouter provider                           | Text chat round-trip through the runtime with streaming                                                                            |
| **1 — Voice core**               | whisper.cpp with distil-small.en + tiny.en fallback, Silero VAD, push-to-talk, sentence streaming, TinyTTS, barge-in state machine | G-01 and G-02 targets met on headset audio; partial-transcript quality and RAM budget (NFR-04) validated on an 8 GB machine (R-09) |
| **2 — Tools & permissions**      | MCP host, filesystem/process/service/shell servers, permission layer, approvals in UI and by voice                                 | 0 unapproved destructive actions in test suite                                                                                     |
| **3 — Browser & coding**         | Playwright MCP, OpenCode controller, result summarization                                                                          | "Open project → fix bug → run tests" scenario passes                                                                               |
| **4 — Workflows & computer use** | Workflow engine, `deploy-service` reference workflow, Windows computer-use server                                                  | End-to-end vision scenario (§3) passes with approvals                                                                              |
| **5 — Hardening**                | AEC, alternative TTS, model auto-selection, installer, model download, telemetry                                                   | Success metrics (§10) met on reference machine; beta release                                                                       |

### 19. Acceptance test scenarios

| ID    | Scenario                                                                    | Expected result                                                                                           |
| ----- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| AT-01 | User says "Open my album-builder project."                                  | Project located via filesystem search; OpenCode session opened; spoken confirmation within latency target |
| AT-02 | User interrupts the assistant mid-sentence with "Wait, stop."               | Playback stops ≤ 300 ms; assistant listens; prior partial response is visible in UI                       |
| AT-03 | Assistant plays a long response through laptop speakers with no user speech | No false interruption during a 5-minute playback                                                          |
| AT-04 | User says "Delete the build folder."                                        | Approval prompt shown and spoken; nothing deleted until "yes"; deletion logged with approval record       |
| AT-05 | User says "Fix the issue where new images aren't appearing automatically."  | Delegated to OpenCode; tests run; summary spoken; diff visible in UI                                      |
| AT-06 | User runs `deploy-service` workflow with a failing health check             | Rollback step executes; failure reported; workflow run persisted with step statuses                       |
| AT-07 | LLM attempts to write outside workspace roots                               | Denied by runtime; denial logged; user informed                                                           |
| AT-08 | OpenCode server crashes mid-task                                            | Agent reports failure, offers restart, remains responsive                                                 |

### 20. Open questions

| #   | Question                                                                                                                                         | Owner            | Needed by      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------------- |
| 1   | Is TinyTTS voice quality acceptable for the primary persona, or should a higher-quality engine be the default with TinyTTS as the "fast" option? | Product          | End of Phase 1 |
| 2   | Should whisper.cpp run as a child process managed by Node, or inside the Rust side of Tauri exposed over IPC?                                    | Engineering      | Phase 0        |
| 3   | Which Windows automation approach is primary for computer use: UI Automation API, PowerShell, or a screenshot-and-coordinate model?              | Engineering      | Phase 4        |
| 4   | Default LLM model on OpenRouter for the balance of latency, tool-calling reliability and cost?                                                   | Product/Eng      | Phase 0        |
| 5   | Should voice approvals ("yes") require a confirmation phrase for high-risk actions to guard against ASR errors?                                  | Product/Security | Phase 2        |
| 6   | Is a wake word required for v1 given push-to-talk plus listen toggle?                                                                            | Product          | Phase 1        |
| 7   | Plain Svelte + Vite or SvelteKit (static adapter, SSR off)? Plain Svelte is simpler; SvelteKit only pays off if routing grows.                   | Engineering      | Phase 0        |

### 21. Glossary

| Term                | Meaning                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| **ASR**             | Automatic speech recognition (speech → text)                                               |
| **VAD**             | Voice activity detection — identifies when speech starts and stops                         |
| **Barge-in**        | User speaking over the assistant to interrupt it                                           |
| **AEC**             | Acoustic echo cancellation — removing the speaker signal from the mic input                |
| **TTS**             | Text-to-speech                                                                             |
| **MCP**             | Model Context Protocol — standard for exposing tools, resources and prompts to LLMs        |
| **MCP host**        | The application that connects to MCP servers and offers their tools to a model             |
| **Streamable HTTP** | MCP remote transport over HTTP                                                             |
| **OpenCode**        | External coding agent used for repository analysis and code changes                        |
| **Workflow**        | Declarative, ordered set of steps constraining what the agent may do for a defined process |
| **Workspace**       | A configured root directory within which filesystem tools are permitted to operate         |
