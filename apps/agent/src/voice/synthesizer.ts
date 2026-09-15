export interface PcmChunk { samples: Float32Array; sampleRate: number; }

/** SpeechSynthesizer interface (FR-VO-04). TinyTTS ONNX implements this; stub keeps pipeline testable. */
export interface SpeechSynthesizer {
  synthesize(text: string, signal: AbortSignal): AsyncIterable<PcmChunk>;
}

/** Silent stub: yields one empty chunk per call. Real TinyTTS/ONNX engine plugs in here (R-01). */
export class StubSynthesizer implements SpeechSynthesizer {
  async *synthesize(_text: string, signal: AbortSignal): AsyncIterable<PcmChunk> {
    if (signal.aborted) return;
    yield { samples: new Float32Array(160), sampleRate: 16000 };
  }
}
