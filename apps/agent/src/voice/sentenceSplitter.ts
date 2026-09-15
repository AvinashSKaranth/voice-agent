/**
 * Sentence splitter for streaming TTS (FR-VO-02).
 * Boundaries: . ? ! : ; with exclusions for abbreviations (Dr., Mr., e.g., etc.),
 * decimals (3.14) and version strings (v1.2).
 * Returns complete sentences + trailing remainder as last element.
 */
const ABBREV = new Set(["dr", "mr", "mrs", "ms", "e.g", "i.e", "etc", "vs", "st", "jr", "sr", "prof"]);

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const push = (end: number) => {
    const s = text.slice(start, end).trim();
    if (s) out.push(s);
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (!".?!:;".includes(ch)) continue;
    const prev = text.slice(Math.max(0, i - 6), i);
    const wordMatch = prev.match(/([A-Za-z.]+)$/);
    const word = (wordMatch?.[1] ?? "").replace(/\.$/, "").toLowerCase();
    if (ch === "." && ABBREV.has(word)) continue;
    if (ch === "." && /[a-z]\.[a-z]/i.test(text.slice(Math.max(0, i - 2), i + 2))) continue; // e.g. middle dot
    const before = text[i - 1] ?? "";
    const after = text[i + 1] ?? "";
    if (ch === "." && /\d/.test(before) && /\d/.test(after)) continue; // decimal 3.14
    if (ch === "." && /v\d/i.test(text.slice(Math.max(0, i - 2), i)) && /\d/.test(after)) continue; // v1.2
    if (after && !/\s/.test(after) && after !== '"' && after !== "'") continue; // require boundary
    push(i + 1);
  }
  const rest = text.slice(start);
  if (rest.trim()) out.push(rest);
  else if (out.length === 0) out.push("");
  return out;
}

/** Summarize code/paths for voice; full text stays in UI (FR-VO-06). */
export function summarizeForSpeech(text: string): string {
  if (/```/.test(text)) {
    const blocks = (text.match(/```/g) ?? []).length / 2;
    return text.replace(/```[\s\S]*?```/g, `[${blocks} code block${blocks === 1 ? "" : "s"} shown in UI]`).slice(0, 600);
  }
  if (text.length > 400) return text.slice(0, 400) + "… (full text in UI)";
  return text;
}
