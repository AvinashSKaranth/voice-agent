import { WebSocketServer, type WebSocket } from "ws";
import { createLogger } from "@voice-agent/shared";
import type { AgentEvent, ClientMessage } from "@voice-agent/protocol";
import { EventBus } from "./agent/eventBus.js";
import { ConversationState } from "./agent/conversationState.js";
import { Orchestrator } from "./agent/orchestrator.js";
import { createProvider } from "./llm/factory.js";
import { McpManager } from "./mcp/manager.js";
import { PolicyEngine } from "./permissions/policy.js";
import { ApprovalStore } from "./permissions/approvals.js";
import { Database } from "./storage/db.js";
import { loadConfig } from "./storage/config.js";
import { getSecret } from "./storage/secrets.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerProcessTools } from "./tools/process.js";
import { registerBrowserTools } from "./browser/playwrightClient.js";
import { registerComputerTools, WindowsComputerAdapter } from "./computer/windows.js";
import { OpenCodeController } from "./opencode/controller.js";
import { StubSynthesizer } from "./voice/synthesizer.js";
import { StubRecognizer } from "./voice/recognizer.js";

/** Localhost-only runtime server w/ auth token (NFR-06). Tauri UI + CLI connect here. */
export async function startServer(port = 3790, authToken = "dev-token-change-me"): Promise<{ close(): void; events: EventBus }> {
  const log = createLogger("server");
  if (!authToken || authToken === "dev-token-change-me") {
    const { randomBytes } = await import("node:crypto");
    authToken = `dev-${randomBytes(16).toString("hex")}`;
    log.warn("generated-ephemeral-auth-token", { hint: "Set agent.authToken in config or VOICE_AGENT_TOKEN env to use a stable token" });
  }
  const config = loadConfig();
  const events = new EventBus();
  const state = new ConversationState({ bargeInPersistenceMs: config.voice.bargeInPersistenceMs });
  const db = new Database(process.env.VOICE_AGENT_DB ?? ":memory:");
  const mcp = new McpManager();
  const policy = new PolicyEngine();
  policy.configure({ workspaceRoots: config.agent.workspaceRoots, writeInsideWorkspace: config.permissions.writeInsideWorkspace });
  const approvals = new ApprovalStore();

  registerFilesystemTools(mcp);
  registerProcessTools(mcp);
  registerBrowserTools(mcp);
  registerComputerTools(mcp, new WindowsComputerAdapter());
  const opencode = new OpenCodeController(config.opencode.baseUrl);
  opencode.registerTools(mcp);
  for (const s of config.mcpServers) mcp.addServer({ name: s.name, transport: s.transport, command: s.command, args: s.args, url: s.url, enabled: s.enabled });

  const apiKey = (await getSecret("OPENROUTER_API_KEY")) ?? process.env.OPENROUTER_API_KEY ?? "";
  const llm = createProvider("openrouter", { apiKey: apiKey || "missing-key-dev", model: config.agent.defaultModel });
  const orchestrator = new Orchestrator({ events, llm, mcp, policy, approvals, db, tts: new StubSynthesizer(), state });
  void StubRecognizer;

  const wss = new WebSocketServer({ port, host: "127.0.0.1" });
  const sockets = new Set<WebSocket>();
  const broadcast = (e: AgentEvent) => {
    const msg = JSON.stringify({ kind: "event", payload: e });
    for (const s of sockets) { try { if (s.readyState === 1) s.send(msg); } catch { /* noop */ } }
  };
  events.subscribe(broadcast);

  wss.on("connection", (ws, req) => {
    // Browsers cannot set WS headers, so token may arrive via query on localhost.
    // Never log the URL (it contains the token). Prefer x-auth-token header for non-browser clients.
    const headerToken = req.headers["x-auth-token"];
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const ok = headerToken === authToken || url.searchParams.get("token") === authToken;
    if (!ok) {
      ws.close(4401, "unauthorized");
      return;
    }
    sockets.add(ws);
    ws.on("close", () => sockets.delete(ws));
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as ClientMessage;
        if (msg.kind === "chat") {
          const conversationId = msg.conversationId || db.createConversation("Voice chat");
          const text = msg.text;
          // Voice approval shortcut: "yes/no" answers pending approval first
          if (approvals.pendingIds().length > 0) {
            const handled = approvals.decideByVoice(text);
            if (handled) { ws.send(JSON.stringify({ kind: "response", payload: { approval: handled } })); return; }
          }
          const reply = await orchestrator.handleUserText(conversationId, text);
          ws.send(JSON.stringify({ kind: "response", payload: { conversationId, reply } }));
        } else if (msg.kind === "approve") {
          approvals.decide(msg.approvalId, msg.decision);
        } else if (msg.kind === "cancel-task") {
          orchestrator.cancelTask(msg.taskId);
        } else if (msg.kind === "pause") {
          orchestrator.paused = msg.paused;
        }
      } catch (err) {
        ws.send(JSON.stringify({ kind: "error", payload: String(err) }));
      }
    });
  });

  log.info("listening", { port });
  return { close: () => { wss.close(); db.close(); opencode.shutdown(); }, events };
}
