/** SpeechRecognizer interface (FR-VI-04). whisper.cpp child-process engine implements this; stub used in tests/dev. */
export interface SpeechRecognizer {
  start(): Promise<void>;
  stop(): Promise<void>;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string) => void): void;
  onSpeechStart(cb: () => void): void;
  onSpeechEnd(cb: () => void): void;
}

/** Dev/test stub: replays scripted transcripts without native whisper.cpp. */
export class StubRecognizer implements SpeechRecognizer {
  private partials: Array<(t: string) => void> = [];
  private finals: Array<(t: string) => void> = [];
  private starts: Array<() => void> = [];
  private ends: Array<() => void> = [];
  private running = false;

  async start(): Promise<void> { this.running = true; }
  async stop(): Promise<void> { this.running = false; }
  onPartial(cb: (text: string) => void): void { this.partials.push(cb); }
  onFinal(cb: (text: string) => void): void { this.finals.push(cb); }
  onSpeechStart(cb: () => void): void { this.starts.push(cb); }
  onSpeechEnd(cb: () => void): void { this.ends.push(cb); }

  /** Simulate a user utterance (used by tests + text-mode dev). */
  simulateUtterance(partial: string, final: string): void {
    if (!this.running) return;
    for (const s of this.starts) s();
    for (const p of this.partials) p(partial);
    for (const f of this.finals) f(final);
    for (const e of this.ends) e();
  }
}
