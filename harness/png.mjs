// Tiny dependency-free PNG writer + vector frame rasterizer for the headless harness.
import fs from 'node:fs';
import zlib from 'node:zlib';

const W = 330;
const H = 410;
const SCALE = 100; // alg units per pixel, same as the browser renderer

function crc32(buf) {
  let c;
  let crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(width, height, gray) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    gray.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function rasterize(vectors, zoom = 2) {
  const w = W * zoom;
  const h = H * zoom;
  const img = Buffer.alloc(w * h, 0);
  const plot = (x, y, v) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (img[i] < v) img[i] = v;
  };
  for (const [x0, y0, x1, y1, color] of vectors) {
    if (color >= 128) continue; // invalid entry
    const v = Math.min(255, 90 + color * 2);
    let ax = Math.round((x0 / SCALE) * zoom);
    let ay = Math.round((y0 / SCALE) * zoom);
    const bx = Math.round((x1 / SCALE) * zoom);
    const by = Math.round((y1 / SCALE) * zoom);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      plot(ax, ay, v);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ay += sy;
      }
    }
  }
  return { png: encodePng(w, h, img), width: w, height: h };
}

export function savePng(file, vectors, zoom = 2) {
  const { png } = rasterize(vectors, zoom);
  fs.mkdirSync(file.replace(/\/[^/]*$/, ''), { recursive: true });
  fs.writeFileSync(file, png);
}

// Merge the last n renders (the browser fades older ones as phosphor persistence).
export function mergeRenders(renders, n = 2) {
  return renders.slice(-n).flat();
}
