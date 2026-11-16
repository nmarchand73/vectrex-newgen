// Usage: node harness/probe.mjs <rom> [frames] -- boots to the cartridge, runs frames, prints the last render's vectors.
import path from 'node:path';
import { Machine, readRom, root } from './machine.mjs';

const [romArg, framesArg = '10'] = process.argv.slice(2);
const m = new Machine();
m.reset(readRom(path.resolve(root, romArg)));
m.bootToCart();
m.keepRenders = 2;
m.frames(Number(framesArg));
const last = m.renders[m.renders.length - 1] || [];
console.log('vectors:', last.length);
for (const v of last) console.log(v.join(' '));
