/** List candidate free models on OpenRouter (logs IDs only — never the key). Usage: tsx scripts/list-models.ts */
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
if (!key) { console.log("NO-KEY"); process.exit(2); }
const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${key}` } });
const json = (await res.json()) as { data?: Array<{ id?: string }> };
const ids = (json.data ?? []).map((m) => m.id ?? "").filter((id) => /:free$/i.test(id));
console.log(`FREE-MODELS count=${ids.length}`);
for (const id of ids.slice(0, 40)) console.log(` - ${id}`);
