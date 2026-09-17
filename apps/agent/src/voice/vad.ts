/**
 * Real-time voice activity detector (FR-VI-01/03).
 * Frame-energy + zero-crossing-rate gate with hangover, tuned for 16 kHz mono.
 * A Silero ONNX model can be dropped into models/ later and plugged in behind
 * this same interface (BR-05) — the energy gate remains as a fast pre-filter.
 */
export interface VadFrame {
  speech: boolean;
  energy: number;
}

export class EnergyVad {
  private hangover = 0;
  constructor(
    private opts = {
      frameMs: 30,
      sampleRate: 16000,
      energyThreshold: 0.008,
      zcrThreshold: 0.35,
      hangoverFrames: 8,
      minSpeechFrames: 4,
    },
  ) {}

  private speechFrames = 0;

  frame(samples: Float32Array): VadFrame {
    let e = 0;
    let zc = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      e += s * s;
      if (i > 0 && Math.sign(samples[i]!) !== Math.sign(samples[i - 1]!)) zc++;
    }
    e /= Math.max(1, samples.length);
    const zcr = zc / Math.max(1, samples.length);
    const voiced = e > this.opts.energyThreshold && zcr < this.opts.zcrThreshold;
    if (voiced) {
      this.speechFrames++;
      this.hangover = this.opts.hangoverFrames;
    } else if (this.hangover > 0) {
      this.hangover--;
    } else {
      this.speechFrames = 0;
    }
    const speech = this.speechFrames >= this.opts.minSpeechFrames || (this.hangover > 0 && this.speechFrames > 0);
    return { speech, energy: e };
  }

  reset(): void {
    this.hangover = 0;
    this.speechFrames = 0;
  }
}

/** End-of-turn detector: VAD silence duration with configurable thresholds (FR-VI-03). */
export class TurnDetector {
  private silenceFrames = 0;
  private speechFrames = 0;
  constructor(
    private opts = { minSpeechMs: 200, minSilenceMs: 600, frameMs: 30 },
  ) {}

  /** Returns "start" | "end" | null per frame. */
  update(speech: boolean): "start" | "end" | null {
    if (speech) {
      this.speechFrames++;
      this.silenceFrames = 0;
      if (this.speechFrames * this.opts.frameMs >= this.opts.minSpeechMs && this.speechFrames === Math.ceil(this.opts.minSpeechMs / this.opts.frameMs)) {
        return "start";
      }
      return null;
    }
    if (this.speechFrames * this.opts.frameMs >= this.opts.minSpeechMs) {
      this.silenceFrames++;
      if (this.silenceFrames * this.opts.frameMs >= this.opts.minSilenceMs) {
        this.speechFrames = 0;
        this.silenceFrames = 0;
        return "end";
      }
    } else {
      this.speechFrames = 0;
    }
    return null;
  }

  reset(): void {
    this.silenceFrames = 0;
    this.speechFrames = 0;
  }
}
