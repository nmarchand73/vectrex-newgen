// Headless regression for the unmodified JSVecX core running the bundled original ROMs.
// Run: node --test tests/roms.test.mjs   (UPDATE_BASELINE=1 to rewrite tests/baseline.json)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Machine, readRom, root } from '../harness/machine.mjs';
import { mergeRenders, savePng } from '../harness/png.mjs';

const romDir = path.join(root, 'src', 'roms', 'Commercial');
const baselineFile = path.join(root, 'tests', 'baseline.json');
const outDir = path.join(root, 'tests', 'out');
const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
const updated = {};

// Games that must always run. Scramble and Spike are explicit requirements.
const GAMES = [
  { name: 'Scramble', file: 'Scramble_1982.bin', header: 'g GCE 1982' },
  { name: 'Spike', file: 'Spike_1983.bin', header: 'g GCE 1983' },
  { name: 'Armor Attack', file: 'Armor Attack_1982.bin', header: 'g GCE 1982' },
  { name: 'Berzerk', file: 'Berzerk_1982.bin', header: 'g GCE 1982' },
  { name: 'Star Trek', file: 'Star Trek_1982.bin', header: 'g GCE 1982' },
  { name: 'Hyperchase', file: 'Hyperchase_1982.bin', header: 'g GCE 1982' },
  { name: 'Pole Position', file: 'Pole Position_1983.bin', header: 'g GCE 1983' },
];

function sha(vectors) {
  return crypto.createHash('sha1').update(JSON.stringify(vectors)).digest('hex').slice(0, 16);
}

function lastRender(m) {
  return m.renders[m.renders.length - 1] || [];
}

function boot(rom) {
  const m = new Machine();
  m.reset(rom);
  m.keepRenders = 4;
  return m;
}

// Presses button 4 (index 3) briefly every 60 frames: how every GCE title/menu starts a game.
function pressStartRepeatedly(m, totalFrames) {
  for (let f = 0; f < totalFrames; f++) {
    m.button(0, 3, f % 60 < 6);
    m.frame();
  }
  m.button(0, 3, false);
}

test('Mine Storm (built into the BIOS) runs without a cartridge', () => {
  const m = boot(null);
  m.frames(200);
  assert.ok(m.lastVectorCount > 50, `Mine Storm drew ${m.lastVectorCount} vectors`);
  savePng(path.join(outDir, 'minestorm.png'), mergeRenders(m.renders, 2));
});

for (const g of GAMES) {
  test(`${g.name}: cartridge is recognised and renders`, () => {
    const rom = readRom(path.join(romDir, g.file));
    assert.equal(rom.subarray(0, g.header.length).toString('latin1'), g.header, 'GCE header');
    const m = boot(rom);
    const steps = m.bootToCart();
    assert.ok(steps > 0);
    m.frames(150);
    const vectors = lastRender(m);
    assert.ok(vectors.length > 5, `${g.name} drew only ${vectors.length} vectors`);
    for (const [x0, y0, x1, y1] of vectors) {
      for (const c of [x0, y0, x1, y1]) assert.ok(Number.isFinite(c));
    }
    savePng(path.join(outDir, `${g.name.replace(/ /g, '_')}.png`), mergeRenders(m.renders, 2));
  });
}

test('Scramble: pressing start leads to the scrolling game', () => {
  const rom = readRom(path.join(romDir, 'Scramble_1982.bin'));
  const m = boot(rom);
  m.bootToCart();
  m.frames(30);
  const title = sha(lastRender(m));
  pressStartRepeatedly(m, 600);
  m.frames(120);
  const vectors = lastRender(m);
  // In play the terrain is one long horizontal line near the bottom of the screen.
  const longLine = vectors.some(([x0, , x1]) => Math.abs(x1 - x0) > 8000);
  assert.ok(longLine, 'expected a long terrain line while playing');
  assert.notEqual(sha(vectors), title, 'screen should differ from the title screen');
  savePng(path.join(outDir, 'scramble_play.png'), mergeRenders(m.renders, 2));
});

test('Spike: pressing start changes the screen', () => {
  const rom = readRom(path.join(romDir, 'Spike_1983.bin'));
  const m = boot(rom);
  m.bootToCart();
  m.frames(60);
  const before = sha(lastRender(m));
  pressStartRepeatedly(m, 400);
  m.frames(60);
  assert.ok(lastRender(m).length > 5);
  assert.notEqual(sha(lastRender(m)), before);
  savePng(path.join(outDir, 'spike_play.png'), mergeRenders(m.renders, 2));
});

// Spike talks through the VIA DAC routed to the sound line (not through the AY chip).
function dacActivity(rom, frames) {
  const m = boot(rom);
  if (rom) m.bootToCart();
  m.dacLog = true;
  let samples = 0;
  let activeFrames = 0;
  let peak = 0;
  const levels = new Set();
  for (let f = 0; f < frames; f++) {
    m.dacChunks.length = 0;
    m.button(0, 3, f % 60 < 6);
    m.frame();
    for (const chunk of m.dacChunks) {
      samples += chunk.length;
      let active = false;
      for (const v of chunk) {
        if (v !== 0) active = true;
        peak = Math.max(peak, Math.abs(v));
        levels.add(v.toFixed(3));
      }
      if (active) activeFrames++;
    }
  }
  return { samples, activeFrames, peak, levels: levels.size, openCycles: m.vecx.dacOpen };
}

test('Spike speaks through the direct DAC, games without speech stay silent on it', () => {
  const spike = dacActivity(readRom(path.join(romDir, 'Spike_1983.bin')), 700);
  assert.ok(Math.abs(spike.samples / 700 - 441) < 2, `expected 441 samples per frame, got ${spike.samples / 700}`);
  assert.ok(spike.activeFrames > 50, `Spike DAC was active in only ${spike.activeFrames} frames`);
  assert.ok(spike.levels >= 4, `Spike DAC used ${spike.levels} levels`);
  assert.ok(spike.peak > 0.5 && spike.peak <= 1, `Spike DAC peak ${spike.peak}`);
  assert.equal(dacActivity(null, 300).openCycles, 0, 'Mine Storm must not open the DAC gate');
  assert.equal(dacActivity(readRom(path.join(romDir, 'Scramble_1982.bin')), 300).activeFrames, 0, 'Scramble has no speech');
});

// Found with `node harness/audioscan.mjs`: besides Spike, 19 bundled ROMs play samples through the DAC.
const SAMPLE_ROMS = [
  'Homebrew/Sound1 Demo (19xx).bin',
  'Homebrew/Lines and Digitized Sounds Demo (1998).bin',
  'Binary Star/Apache_2019.bin',
];

test('other cartridges that play samples through the DAC are heard too', () => {
  for (const rel of SAMPLE_ROMS) {
    const a = dacActivity(readRom(path.join(root, 'src', 'roms', rel)), 300);
    assert.ok(a.activeFrames > 100, `${rel}: DAC active in only ${a.activeFrames} of 300 frames`);
    assert.ok(a.levels > 10, `${rel}: only ${a.levels} DAC levels`);
  }
});

test('rendering is deterministic and matches the recorded baseline', () => {
  for (const g of [{ name: 'Mine Storm', file: null }, ...GAMES]) {
    const rom = g.file ? readRom(path.join(romDir, g.file)) : null;
    const run = () => {
      const m = boot(rom);
      if (rom) m.bootToCart();
      pressStartRepeatedly(m, 240);
      m.frames(60);
      return sha(lastRender(m));
    };
    const hash = run();
    assert.equal(run(), hash, `${g.name} is not deterministic`);
    updated[g.name] = hash;
    if (!process.env.UPDATE_BASELINE && baseline[g.name]) {
      assert.equal(hash, baseline[g.name], `${g.name} render changed vs baseline (core regression?)`);
    }
  }
});

test.after(() => {
  if (process.env.UPDATE_BASELINE || !fs.existsSync(baselineFile)) {
    fs.writeFileSync(baselineFile, JSON.stringify(updated, null, 2) + '\n');
  }
});
