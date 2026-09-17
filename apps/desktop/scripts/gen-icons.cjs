/** Generates placeholder app icons (pure Node, no deps). Replace with real branding before release. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outDir = path.join(__dirname, "..", "src-tauri", "icons");
fs.mkdirSync(outDir, { recursive: true });

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}
// Dark tile + green mic dot motif (placeholder).
function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size * 0.42, r = size * 0.24;
  const dotR = size * 0.07;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      px[i] = 16; px[i + 1] = 20; px[i + 2] = 24; px[i + 3] = 255; // #101418
      const dm = Math.hypot(x - cx, y - (cy + r * 1.9));
      const inMic = Math.hypot(x - cx, y - cy) < r && y < cy + r * 0.9;
      const inStand = Math.abs(x - cx) < size * 0.03 && y > cy && y < cy + r * 2.1;
      if (inMic || inStand || dm < dotR + size * 0.05) {
        px[i] = 46; px[i + 1] = 204; px[i + 2] = 113; px[i + 3] = 255; // green
      }
    }
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const p32 = render(32), p128 = render(128), p256 = render(256);
fs.writeFileSync(path.join(outDir, "32x32.png"), p32);
fs.writeFileSync(path.join(outDir, "128x128.png"), p128);
fs.writeFileSync(path.join(outDir, "128x128@2x.png"), p256);
// ICO with PNG payload (valid Vista+).
const ico = Buffer.alloc(6 + 16 + p32.length);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 32; ico[7] = 32; ico[8] = 0; ico[9] = 0;
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(p32.length, 14); ico.writeUInt32LE(6 + 16, 18);
p32.copy(ico, 6 + 16);
fs.writeFileSync(path.join(outDir, "icon.ico"), ico);
console.log("icons written to " + outDir);
