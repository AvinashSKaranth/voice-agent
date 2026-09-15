/**
 * Secrets: OS keychain only, never config/DB (BR-04, FR-DATA-03).
 * Windows Credential Manager via `keytar` when installed; else env fallback (dev).
 */
interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
}

async function loadKeytar(): Promise<KeytarLike | null> {
  try {
    const spec = "keytar";
    const m = (await Function("s", "return import(s)")(spec).catch(() => null)) as unknown as { default?: KeytarLike } & KeytarLike | null;
    if (!m) return null;
    const k = (m as { default?: KeytarLike }).default ?? (m as KeytarLike);
    if (k && typeof k.getPassword === "function") return k;
    return null;
  } catch {
    return null;
  }
}

export async function getSecret(key: string): Promise<string | undefined> {
  // Keychain first (BR-04); env is dev/CI fallback only.
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      const v = await keytar.getPassword("voice-agent", key);
      if (v) return v;
    } catch { /* fallthrough to env */ }
  }
  return process.env[key];
}

export async function setSecret(key: string, value: string): Promise<"keychain" | "env-note"> {
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.setPassword("voice-agent", key, value);
      return "keychain";
    } catch { /* fallthrough */ }
  }
  process.env[key] = value;
  return "env-note";
}
