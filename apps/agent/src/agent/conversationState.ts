import type { VoiceState } from "@voice-agent/protocol";

/**
 * Barge-in state machine: IDLE → LISTENING → THINKING → SPEAKING → INTERRUPTED → LISTENING (FR-BI-01).
 * Pure logic; audio/IO layers drive transitions via method calls.
 */
export class ConversationState {
  private state: VoiceState = "idle";
  private speakingSince = 0;
  private lastSpeechAt = 0;
  private speechStartCandidate = 0;

  constructor(
    private opts: Partial<{ bargeInPersistenceMs: number; minSpeechMs: number }> = {},
  ) {
    this.opts = { bargeInPersistenceMs: 150, minSpeechMs: 200, ...opts };
  }

  get current(): VoiceState { return this.state; }

  toListening(): void { this.state = "listening"; }
  toThinking(): void { this.state = "thinking"; }
  toSpeaking(): void { this.state = "speaking"; this.speakingSince = Date.now(); }
  toIdle(): void { this.state = "idle"; }

  /**
   * Called when VAD reports speech energy while SPEAKING.
   * Returns true when persistence threshold crossed → caller must stop TTS ≤300ms (FR-BI-02).
   */
  vadWhileSpeaking(now = Date.now()): boolean {
    if (this.state !== "speaking") return false;
    if (this.speechStartCandidate === 0) this.speechStartCandidate = now;
    if (now - this.speechStartCandidate >= (this.opts.bargeInPersistenceMs ?? 150)) {
      this.state = "interrupted";
      this.lastSpeechAt = now;
      this.speechStartCandidate = 0;
      return true;
    }
    return false;
  }

  vadSilence(): void { this.speechStartCandidate = 0; }

  /** After INTERRUPTED, move back to LISTENING once input turn begins. */
  resumeListening(): void {
    if (this.state === "interrupted") this.state = "listening";
  }

  speakingDurationMs(now = Date.now()): number {
    return this.state === "speaking" ? now - this.speakingSince : 0;
  }
}
