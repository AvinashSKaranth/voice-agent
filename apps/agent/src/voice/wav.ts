/** Minimal 16-bit PCM WAV reader/writer (16 kHz mono) — no native deps. */

export function encodeWav16(samples: Float32Array, sampleRate = 16000): Buffer {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

export function decodeWav16Pcm(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  // Locate "data" chunk (SAPI/LAME headers may precede it).
  let dataOff = -1;
  for (let i = 0; i + 8 <= buf.length; i++) {
    if (buf.toString("ascii", i, i + 4) === "data") { dataOff = i + 8; break; }
  }
  if (dataOff < 0) throw new Error("WAV data chunk not found");
  const fmtOff = buf.toString("ascii", 12, 16) === "fmt " ? 12 : -1;
  const channels = fmtOff >= 0 ? buf.readUInt16LE(fmtOff + 10) : 1;
  const sampleRate = fmtOff >= 0 ? buf.readUInt32LE(fmtOff + 12) : 16000;
  const bits = fmtOff >= 0 ? buf.readUInt16LE(fmtOff + 22) : 16;
  if (bits !== 16) throw new Error(`Only 16-bit WAV supported (got ${bits})`);
  const frames = Math.floor((buf.length - dataOff) / (2 * channels));
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) acc += buf.readInt16LE(dataOff + (f * channels + c) * 2) / 32768;
    out[f] = acc / channels;
  }
  return { samples: out, sampleRate };
}
