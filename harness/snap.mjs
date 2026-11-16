// Usage: node harness/snap.mjs <rom|-> <frames> <out.png> [--press=4@10-20] [--stick=1,0@0-50] ...
import path from 'node:path';
import { Machine, readRom, root } from './machine.mjs';
import { mergeRenders, savePng } from './png.mjs';

const [romArg, framesArg, outArg, ...opts] = process.argv.slice(2);
if (!romArg || !framesArg || !outArg) {
  console.error('usage: snap.mjs <rom|-> <frames> <out.png> [--press=BTN@from-to] [--stick=x,y@from-to]');
  process.exit(2);
}
const m = new Machine();
m.reset(romArg === '-' ? null : readRom(path.resolve(root, romArg)));
m.keepRenders = 4;
const presses = [];
const sticks = [];
for (const o of opts) {
  let r;
  if ((r = /^--press=(\d)@(\d+)-(\d+)$/.exec(o))) presses.push([+r[1], +r[2], +r[3]]);
  else if ((r = /^--stick=(-?\d),(-?\d)@(\d+)-(\d+)$/.exec(o))) sticks.push([+r[1], +r[2], +r[3], +r[4]]);
}
const total = Number(framesArg);
for (let f = 0; f < total; f++) {
  for (const [b, a, z] of presses) m.button(0, b - 1, f >= a && f < z);
  let sx = 0;
  let sy = 0;
  for (const [x, y, a, z] of sticks) if (f >= a && f < z) { sx = x; sy = y; }
  m.stick(0, sx, sy);
  m.frame();
}
savePng(path.resolve(root, outArg), mergeRenders(m.renders, 2), 2);
console.log('vectors in last render:', m.lastVectorCount, '->', outArg);
