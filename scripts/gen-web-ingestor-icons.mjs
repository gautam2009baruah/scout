// Generates the Scout Web Ingestor extension icons (violet rounded square with
// a white globe/crosshair mark) as PNGs. Run: node scripts/gen-web-ingestor-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "extension-web-ingestor", "icons");
const SIZES = [16, 32, 48, 128];
const VIOLET = [79, 70, 229];
const WHITE = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Signed-distance for a rounded square centered in the canvas.
function roundedBoxOutside(x, y, size, radius) {
  const half = size / 2;
  const px = Math.abs(x - (size - 1) / 2);
  const py = Math.abs(y - (size - 1) / 2);
  const qx = px - (half - radius);
  const qy = py - (half - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function buildIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const cornerR = size * 0.24;
  const ringOuter = size * 0.4;
  const ringInner = size * 0.28;
  const stroke = Math.max(1, size * 0.045);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      if (roundedBoxOutside(x, y, size, cornerR) > 0) {
        rgba[idx + 3] = 0; // transparent outside the rounded square
        continue;
      }
      let color = VIOLET;
      const d = Math.hypot(x - c, y - c);
      const onRing = d <= ringOuter && d >= ringInner;
      const onMeridian = Math.abs(x - c) <= stroke && d <= ringOuter;
      const onEquator = Math.abs(y - c) <= stroke && d <= ringOuter;
      if (onRing || onMeridian || onEquator) color = WHITE;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(path.join(OUT_DIR, `icon${size}.png`), buildIcon(size));
}
console.log(`Wrote ${SIZES.length} icons to ${OUT_DIR}`);
