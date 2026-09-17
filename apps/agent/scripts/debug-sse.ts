/** Debug: dump raw SSE for a tool-call request (logs tool args + deltas only — never the key). */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
for (const p of [join(root, ".env"), ".env"]) {
  if (existsSync(p)) {
    const dotenv = (await import("dotenv").catch(() => null)) as unknown as {
      default?: { config(o: unknown): void };
    } | null;
    (dotenv?.default ?? dotenv as unknown as { config(o: unknown): void })?.config({ path: p });
    break;
  }
}
const { getSecret } = await import("../src/storage/secrets.js");
const key = (await getSecret("OPENROUTER_API_KEY")) ?? "";
const model = process.env.LLM_MODEL ?? "nex-agi/nex-n2.5-pro:free";
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://github.com/voice-agent",
    "X-Title": "voice-agent",
  },
  body: JSON.stringify({
    model,
    stream: true,
    messages: [{ role: "user", content: `Call filesystem__list with dir set to exactly ${root} and summarize the filenames.` }],
    tools: [{
      type: "function",
      function: {
        name: "filesystem__list",
        description: "List a directory",
        parameters: { type: "object", properties: { dir: { type: "string" } }, required: ["dir"] },
      },
    }],
  }),
});
console.log(`HTTP=${res.status}`);
if (!res.ok || !res.body) { console.log(`BODY=${(await res.text()).slice(0, 300)}`); process.exit(1); }
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let lines = 0;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const parts = buf.split("\n");
  buf = parts.pop() ?? "";
  for (const line of parts) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    console.log(`SSE: ${data.slice(0, 400)}`);
    if (++lines >= 25) { reader.cancel(); process.exit(0); }
  }
}
