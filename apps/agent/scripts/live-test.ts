/**
 * Live end-to-end test with REAL credentials and REAL interfaces.
 * Security discipline (BR-04):
 * - Reads .env / process env IN-PROCESS ONLY to call the provider API.
 * - NEVER logs, prints, or transmits secret VALUES. Output contains only:
 *   key NAMES, present/absent booleans, HTTP statuses, counts, and short
 *   model-output excerpts (assistant text, never credentials).
 * - Secrets are sent only to the configured LLM provider's API (the test's purpose).
 *
 * Run: pnpm --filter @voice-agent/agent test:live
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
for (const p of [join(root, ".env"), ".env"]) {
  if (existsSync(p)) {
    const dotenv = (await import("dotenv").catch(() => null)) as unknown as {
      default?: { config(o: unknown): { error?: unknown } };
    } | null;
    (dotenv?.default ?? dotenv as unknown as { config(o: unknown): void })?.config({ path: p });
    break;
  }
}

const { resolveSelection, createProvider } = await import("../src/llm/factory.js");
const { OpenAICompatibleProvider } = await import("../src/llm/openaiCompatible.js");
const { getSecret } = await import("../src/storage/secrets.js");
const { EventBus } = await import("../src/agent/eventBus.js");
const { ConversationState } = await import("../src/agent/conversationState.js");
const { Orchestrator } = await import("../src/agent/orchestrator.js");
const { McpManager } = await import("../src/mcp/manager.js");
const { PolicyEngine } = await import("../src/permissions/policy.js");
const { ApprovalStore } = await import("../src/permissions/approvals.js");
const { Database } = await import("../src/storage/db.js");
const { registerFilesystemTools } = await import("../src/tools/filesystem.js");
const { registerProcessTools } = await import("../src/tools/process.js");
const { SapiSynthesizer } = await import("../src/voice/sapiTts.js");
const { WhisperCppRecognizer } = await import("../src/voice/whisperCpp.js");
const { PlaywrightExecutor } = await import("../src/browser/playwrightExecutor.js");
const { OpenCodeController } = await import("../src/opencode/controller.js");

const out = (check: string, ok: boolean, detail = "") =>
  console.log(`${ok ? "PASS" : "FAIL"}  ${check}${detail ? ` — ${detail}` : ""}`);

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  out(name, ok, detail);
};

// 1. Provider resolution — key NAMES only, never values.
const sel = resolveSelection({});
const keyPresent = ((await getSecret(sel.keyName)) ?? "").length > 0;
console.log(`INFO  provider=${sel.kind} model=${sel.model} keyName=${sel.keyName} keyPresent=${keyPresent}`);
check("provider key present", keyPresent, `keyName=${sel.keyName}`);
if (!keyPresent) {
  console.log("ABORT  no provider key — set it in .env or OS keychain, then rerun");
  process.exit(2);
}

// 2. Real API ping (1 tiny call).
const provider = createProvider(sel.kind, {
  apiKey: (await getSecret(sel.keyName)) ?? "",
  model: sel.model,
  baseUrl: sel.baseUrl,
  keyName: sel.keyName,
});
if (provider instanceof OpenAICompatibleProvider) {
  const pong = await provider.ping().catch((e) => ({ status: -1, text: String(e).slice(0, 120) }));
  check("llm ping", pong.status === 200, `http=${pong.status} reply=${JSON.stringify(pong.text)}`);
} else {
  check("llm ping", false, "unexpected provider class");
}

// 3. Real tool-calling turn: ask the model to list the repo dir via filesystem.list.
{
  const events = new EventBus();
  const seenTools: string[] = [];
  events.subscribe((e) => {
    if (e.type === "tool.completed") seenTools.push(e.tool);
  });
  const db = new Database(":memory:");
  const conv = db.createConversation("live-test");
  const mcp = new McpManager();
  registerFilesystemTools(mcp);
  registerProcessTools(mcp);
  const policy = new PolicyEngine();
  policy.configure({ workspaceRoots: [root] });
  const orch = new Orchestrator({
    events,
    llm: provider,
    mcp,
    policy,
    approvals: new ApprovalStore(),
    db,
    state: new ConversationState(),
  });
  const reply = await orch
    .handleUserText(conv, `Call filesystem.list with dir set to exactly ${root} and summarize the filenames.`)
    .catch((e) => `ORCH-ERROR: ${String(e).slice(0, 200)}`);
  if (!seenTools.includes("filesystem.list") && /overload|overloaded|try again|rate limit|temporar/i.test(reply)) {
    console.log("INFO  upstream overloaded — retrying once in 20s");
    await new Promise((r) => setTimeout(r, 20_000));
    const retry = await orch
      .handleUserText(conv, `Call filesystem.list with dir set to exactly ${root} and summarize the filenames.`)
      .catch((e) => `ORCH-ERROR: ${String(e).slice(0, 200)}`);
    console.log(`INFO  retry reply excerpt=${JSON.stringify(retry.slice(0, 200))}`);
  }
  check("tool-calling turn executed filesystem.list", seenTools.includes("filesystem.list"), `tools=[${seenTools.join(",")}]`);
  console.log(`INFO  assistant reply excerpt=${JSON.stringify(reply.slice(0, 200))}`);
  db.close();
}

// 4. Real local TTS (Windows SAPI) — verify actual PCM bytes flow.
{
  const tts = new SapiSynthesizer();
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 45_000);
  try {
    let chunks = 0;
    let samples = 0;
    for await (const pcm of tts.synthesize("Live test one two three.", ctl.signal)) {
      chunks++;
      samples += pcm.samples.length;
    }
    check("sapi tts produced audio", chunks > 0 && samples > 1000, `chunks=${chunks} samples=${samples}`);
  } catch (e) {
    check("sapi tts produced audio", false, String(e).slice(0, 160));
  }
}

// 5. Whisper recognizer — honest availability report (binary + model).
{
  const rec = new WhisperCppRecognizer({});
  const st = rec.status();
  console.log(`INFO  whisper binary=${st.binary} modelPresent=${st.modelPresent}`);
  check("whisper recognizer reports status", true, st.modelPresent ? "model present" : "model not downloaded yet (expected pre-Phase-1-hardware)");
}

// 6. Real browser: open example.com + extract.
{
  const browser = new PlaywrightExecutor();
  const ctl = AbortSignal.timeout(60_000);
  try {
    const nav = (await browser.exec("navigate", { url: "https://example.com" }, ctl)) as { title?: string };
    const ext = (await browser.exec("extract", {}, ctl)) as { text?: string };
    check("playwright navigate+extract", !!nav.title && !!ext.text?.includes("Example"), `title=${JSON.stringify(nav.title)}`);
  } catch (e) {
    check("playwright navigate+extract", false, String(e).slice(0, 160));
  } finally {
    await browser.close();
  }
}

// 7. OpenCode server reachability (real HTTP, no fake success).
// Port is env-overridable: 4096 is taken by the Kilo VSCode extension here.
{
  const port = process.env.OPENCODE_TEST_PORT ?? "4098";
  const oc = new OpenCodeController(`http://127.0.0.1:${port}`);
  try {
    await oc.ensureServer();
    check("opencode server reachable", true, "");
  } catch (e) {
    check("opencode server reachable", false, `${String(e).slice(0, 120)} (start it with: opencode serve)`);
  } finally {
    oc.shutdown();
  }
}

console.log(failures === 0 ? "LIVE-ALL-PASS" : `LIVE-FAILURES=${failures}`);
process.exit(failures === 0 ? 0 : 1);
