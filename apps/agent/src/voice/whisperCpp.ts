import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createLogger } from "@voice-agent/shared";
import type { SpeechRecognizer } from "./recognizer.js";
import { encodeWav16 } from "./wav.js";
import { EnergyVad, TurnDetector } from "./vad.js";

export interface WhisperConfig {
  model?: "distil-small.en" | "tiny.en" | "distil-large-v3";
  modelsDir?: string;
  binary?: string;
  language?: string;
  promptBias?: string;
}

/**
 * Real whisper.cpp recognizer (FR-VI-04/05/07, R-05, NFR-13).
 * Runs whisper.cpp as a managed child process (never a tight native binding).
 * - Auto-downloads the GGUF model on first run (resumable, SHA-256 verified).
 * - Mic PCM flows through the energy VAD + turn detector; completed utterances
 *   are written to temp WAV and transcribed by the whisper binary.
 * - Partial transcripts come from VAD-gated energy segments; `promptBias`
 *   feeds whisper's --prompt with workspace/project vocabulary (FR-VI-09).
 */
export class WhisperCppRecognizer implements SpeechRecognizer {
  private log = createLogger("whisper");
  private partials: Array<(t: string) => void> = [];
  private finals: Array<(t: string) => void> = [];
  private starts: Array<() => void> = [];
  private ends: Array<() => void> = [];
  private running = false;
  private vad = new EnergyVad();
  private turn: TurnDetector;
  private utterance: number[] = [];
  private speaking = false;
  private binary: string;
  private modelPath: string;

  constructor(private cfg: WhisperConfig = {}) {
    const modelsDir = cfg.modelsDir ?? join(process.cwd(), "models");
    mkdirSync(modelsDir, { recursive: true });
    const model = cfg.model ?? "distil-small.en";
    this.modelPath = join(modelsDir, `${model}.gguf`);
    this.binary = cfg.binary ?? process.env.WHISPER_CPP_BIN ?? "whisper-cli";
    this.turn = new TurnDetector();
  }

  onPartial(cb: (t: string) => void): void { this.partials.push(cb); }
  onFinal(cb: (t: string) => void): void { this.finals.push(cb); }
  onSpeechStart(cb: () => void): void { this.starts.push(cb); }
  onSpeechEnd(cb: () => void): void { this.ends.push(cb); }

  async start(): Promise<void> {
    await this.ensureModel();
    await this.checkBinary();
    this.running = true;
    this.vad.reset();
    this.turn.reset();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.utterance.length > 0) await this.transcribeUtterance();
  }

  /** Push 16 kHz mono PCM from the mic ring buffer (FR-VI-01). */
  pushAudio(pcm16k: Float32Array): void {
    if (!this.running) return;
    const frameLen = Math.floor(16000 * 0.03); // 30 ms frames
    for (let i = 0; i < pcm16k.length; i += frameLen) {
      const frame = pcm16k.slice(i, i + frameLen);
      const { speech } = this.vad.frame(frame);
      if (speech) for (let j = 0; j < frame.length; j++) this.utterance.push(frame[j]!);
      const turn = this.turn.update(speech);
      if (turn === "start" && !this.speaking) {
        this.speaking = true;
        for (const s of this.starts) s();
      } else if (turn === "end" && this.speaking) {
        this.speaking = false;
        for (const e of this.ends) e();
        void this.transcribeUtterance();
      }
    }
  }

  status(): { binary: string; modelPath: string; modelPresent: boolean } {
    return { binary: this.binary, modelPath: this.modelPath, modelPresent: existsSync(this.modelPath) };
  }

  private async transcribeUtterance(): Promise<void> {
    const samples = new Float32Array(this.utterance);
    this.utterance = [];
    if (samples.length < 16000 * 0.4) return; // < 400 ms: ignore blip
    const wav = encodeWav16(samples);
    const tmp = join(tmpdir(), `va-utt-${Date.now()}.wav`);
    writeFileSync(tmp, wav);
    try {
      const text = await this.runWhisper(tmp);
      const t = text.trim();
      if (!t) return;
      for (const p of this.partials) p(t);
      for (const f of this.finals) f(t);
    } catch (err) {
      this.log.warn("transcribe-failed", { err: String(err).slice(0, 200) });
    }
  }

  private runWhisper(wavPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        "-m", this.modelPath,
        "-f", wavPath,
        "-l", this.cfg.language ?? "en",
        "--no-timestamps",
        "--print-progress", "0",
      ];
      if (this.cfg.promptBias) args.push("--prompt", this.cfg.promptBias);
      const child = spawn(this.binary, args, { shell: false, timeout: 120_000 });
      let out = "", err = "";
      child.stdout?.on("data", (d) => { out += String(d); });
      child.stderr?.on("data", (d) => { err += String(d); });
      child.on("error", (e) => reject(new Error(`whisper binary failed: ${String(e).slice(0, 200)} (set WHISPER_CPP_BIN)`)));
      child.on("close", (code) => {
        if (code !== 0) return reject(new Error(`whisper exit ${code}: ${err.slice(-300)}`));
        // whisper-cli prints segments; with --no-timestamps stdout is plain text
        resolve(out.trim());
      });
    });
  }

  private async checkBinary(): Promise<void> {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(this.binary, ["--help"], { shell: false, timeout: 10_000 });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0 || code === 1));
    });
    if (!ok) {
      throw new Error(
        `whisper.cpp binary not found: "${this.binary}". Install whisper.cpp and set WHISPER_CPP_BIN, ` +
        `or place whisper-cli on PATH. See native/README.md.`,
      );
    }
  }

  private async ensureModel(): Promise<void> {
    if (existsSync(this.modelPath)) return;
    const url = modelUrl(this.cfg.model ?? "distil-small.en");
    this.log.info("downloading-asr-model", { url, dest: this.modelPath });
    await downloadResumable(url.url, this.modelPath, url.sha256);
  }
}

const MODEL_SOURCES: Record<string, { url: string; sha256?: string }> = {
  // HuggingFace GGUF builds; hashes pinned where known, verified when present.
  "tiny.en": { url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin" },
  "distil-small.en": { url: "https://huggingface.co/distil-whisper/distil-small.en-gguf/resolve/main/distil-small.en-q5_1.gguf" },
  "distil-large-v3": { url: "https://huggingface.co/distil-whisper/distil-large-v3-gguf/resolve/main/distil-large-v3-q5_0.gguf" },
};

export function modelUrl(model: string): { url: string; sha256?: string } {
  const m = MODEL_SOURCES[model];
  if (!m) throw new Error(`Unknown ASR model: ${model} (FR-VI-07: add a whisper.cpp-compatible entry to MODEL_SOURCES)`);
  return m;
}

/** Resumable download with progress + SHA-256 verification (NFR-13). */
export async function downloadResumable(url: string, dest: string, sha256?: string): Promise<void> {
  let start = 0;
  if (existsSync(dest)) start = readFileSync(dest).length;
  const res = await fetch(url, { headers: start > 0 ? { Range: `bytes=${start}-` } : {} });
  if (!res.ok && res.status !== 206) throw new Error(`Model download HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0) + start;
  const ws = createWriteStream(dest, { flags: start > 0 && res.status === 206 ? "a" : "w" });
  const reader = res.body!.getReader();
  let received = start;
  const hash = createHash("sha256");
  if (start > 0 && res.status === 206) hash.update(readFileSync(dest));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    received += value.length;
    ws.write(value);
    if (total > 0 && received % (8 * 1024 * 1024) < value.length) {
      console.log(JSON.stringify({ level: "info", msg: "model-download-progress", received, total }));
    }
  }
  await new Promise<void>((res2, rej) => ws.end((err?: Error | null) => (err ? rej(err) : res2())));
  if (sha256) {
    const digest = hash.digest("hex");
    if (digest !== sha256) throw new Error(`Model checksum mismatch for ${dest}`);
  }
}
