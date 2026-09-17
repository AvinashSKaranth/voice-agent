import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { createLogger } from "@voice-agent/shared";
import type { PcmChunk, SpeechSynthesizer } from "./synthesizer.js";
import { decodeWav16Pcm } from "./wav.js";

const execFileAsync = (cmd: string, args: string[], opts: { timeout: number }): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${String(stderr ?? err).slice(0, 300)}`));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

/**
 * Real local TTS for Windows v1 (FR-VO-03/04): System.Speech synthesizer renders
 * to a temp WAV via PowerShell, decoded to a 16 kHz PCM stream — no intermediate
 * files left behind, no external service, no Python. Pluggable behind
 * SpeechSynthesizer so TinyTTS/Piper/Kokoro ONNX engines swap in (R-01).
 */
export class SapiSynthesizer implements SpeechSynthesizer {
  private log = createLogger("tts-sapi");
  constructor(private opts: { voice?: string; rate?: number } = { rate: 0 }) {}

  async *synthesize(text: string, signal: AbortSignal): AsyncIterable<PcmChunk> {
    if (signal.aborted) return;
    const clean = text.replace(/```[\s\S]*?```/g, " code, see screen. ").slice(0, 1200);
    const wavPath = join(tmpdir(), `va-tts-${randomUUID()}.wav`);
    const escaped = clean.replace(/'/g, "''");
    const voiceSel = this.opts.voice ? `$s.SelectVoice('${this.opts.voice.replace(/'/g, "''")}');` : "";
    const ps = [
      `Add-Type -AssemblyName System.Speech;`,
      `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;`,
      voiceSel,
      `$s.Rate = ${Math.max(-10, Math.min(10, this.opts.rate ?? 0))};`,
      `$s.SetOutputToWaveFile('${wavPath}');`,
      `$s.Speak('${escaped}'); $s.Dispose();`,
    ].join(" ");
    try {
      await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 60_000 });
      if (signal.aborted) return;
      const { readFile } = await import("node:fs/promises");
      const wav = await readFile(wavPath);
      const { samples, sampleRate } = decodeWav16Pcm(wav);
      // Stream in ~200 ms chunks so playback can pipeline (FR-VO-01).
      const chunk = Math.floor(sampleRate * 0.2);
      for (let i = 0; i < samples.length && !signal.aborted; i += chunk) {
        yield { samples: samples.slice(i, i + chunk), sampleRate };
      }
    } catch (err) {
      this.log.warn("sapi-failed", { err: String(err).slice(0, 200) });
      throw err;
    } finally {
      await unlink(wavPath).catch(() => undefined);
    }
  }

  /** Voices installed on this machine (for settings UI). */
  async listVoices(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command",
          "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }"],
        { timeout: 15_000 },
      );
      return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
}
