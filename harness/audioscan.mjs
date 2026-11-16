// Usage: node harness/audioscan.mjs            scan every bundled ROM, print JSON lines to tests/out/audioscan.jsonl
//        node harness/audioscan.mjs <rom.bin>  scan one ROM (used by the parent)
// Finds games that play speech or samples: DAC routed to the sound line, or PSG volume register
// written at sample rates. Drives start/fire/joystick so title screens do not hide the activity.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Machine, readRom, root } from './machine.mjs';

const FRAMES = Number(process.env.SCAN_FRAMES || 900);

function scanOne(file) {
  const m = new Machine();
  m.reset(readRom(file));
  m.dacLog = true;
  m.psgLog = true;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const r = { file: path.relative(path.join(root, 'src', 'roms'), file), dacActive: 0, dacPeak: 0, dacLevels: 0, psgMax: 0, psgHeavy: 0, vecs: 0 };
  const levels = new Set();
  for (let f = 0; f < FRAMES; f++) {
    m.dacChunks.length = 0;
    m.psgWrites.length = 0;
    if (f < 400) m.button(0, 3, f % 60 < 6);
    else {
      for (let b = 0; b < 4; b++) if (f % 20 === b * 5) m.button(0, b, rnd() < 0.5);
      if (f % 15 === 0) m.stick(0, Math.round(rnd() * 2 - 1), Math.round(rnd() * 2 - 1));
    }
    m.frame();
    for (const c of m.dacChunks) {
      let active = false;
      for (const v of c) {
        if (v !== 0) active = true;
        if (Math.abs(v) > r.dacPeak) r.dacPeak = Math.abs(v);
        levels.add(Math.round(v * 128));
      }
      if (active) r.dacActive++;
    }
    const n = m.psgWrites.filter(([reg]) => reg !== 14).length;
    if (n > r.psgMax) r.psgMax = n;
    if (n >= 60) r.psgHeavy++;
  }
  r.dacLevels = levels.size;
  r.vecs = m.lastVectorCount;
  return r;
}

if (process.argv[2]) {
  try {
    console.log(JSON.stringify(scanOne(path.resolve(process.argv[2]))));
  } catch (e) {
    console.log(JSON.stringify({ file: process.argv[2], error: String(e.message || e) }));
  }
} else {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(bin|vec|rom)$/i.test(e.name)) files.push(p);
    }
  };
  walk(path.join(root, 'src', 'roms'));
  const out = fs.openSync(path.join(root, 'tests', 'out', 'audioscan.jsonl'), 'w');
  const self = fileURLToPath(import.meta.url);
  let next = 0;
  let running = 0;
  const jobs = Number(process.env.SCAN_JOBS || Math.max(2, os.cpus().length - 1));
  const launch = () => {
    while (running < jobs && next < files.length) {
      const file = files[next++];
      running++;
      let buf = '';
      const p = spawn(process.execPath, [self, file]);
      const timer = setTimeout(() => p.kill(), 120000);
      p.stdout.on('data', (d) => (buf += d));
      p.on('close', () => {
        clearTimeout(timer);
        fs.writeSync(out, (buf.trim() || JSON.stringify({ file, error: 'no output' })) + '\n');
        running--;
        if (next >= files.length && running === 0) console.log(`done: ${files.length} ROMs`);
        else launch();
      });
    }
  };
  console.log(`scanning ${files.length} ROMs with ${jobs} jobs`);
  launch();
}
