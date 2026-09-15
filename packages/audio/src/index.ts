/** Float32 mono ring buffer for mic capture (FR-VI-01). */
export class RingBuffer {
  private buf: Float32Array;
  private head = 0;
  private len = 0;
  constructor(public readonly capacity: number) {
    this.buf = new Float32Array(capacity);
  }
  push(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.buf[this.head] = samples[i]!;
      this.head = (this.head + 1) % this.capacity;
      if (this.len < this.capacity) this.len++;
    }
  }
  /** Last n samples in order (oldest->newest). */
  tail(n: number): Float32Array {
    const k = Math.min(n, this.len);
    const out = new Float32Array(k);
    for (let i = 0; i < k; i++) {
      out[i] = this.buf[(this.head - k + i + this.capacity * 2) % this.capacity]!;
    }
    return out;
  }
  get length(): number { return this.len; }
  clear(): void { this.head = 0; this.len = 0; }
}

export function downmixToMono16k(samples: Float32Array, inRate: number): Float32Array {
  if (inRate === 16000) return samples.slice();
  const ratio = inRate / 16000;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = samples[Math.floor(i * ratio)]!;
  return out;
}
