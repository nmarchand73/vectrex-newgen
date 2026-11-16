// The browser audio path without a browser: runs the real AudioWorklet processor source (built from
// src/js/audioWorkletWrapper.js) in a stub worklet scope and feeds it emulator frames.
// Run: node --test tests/audio.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { root } from '../harness/machine.mjs';

const wrapperSrc = fs.readFileSync(path.join(root, 'src', 'js', 'audioWorkletWrapper.js'), 'utf8');
const FRAME = 441;

function loadProcessor() {
  const host = vm.createContext({ URL: { createObjectURL: () => '' }, Blob: class {}, console });
  vm.runInContext(`${wrapperSrc.replace(/^const /gm, 'var ')}; this.__worker = framedWorker;`, host);
  const scope = vm.createContext({ console });
  vm.runInContext('var Cls; class AudioWorkletProcessor { constructor() { this.port = {}; } } function registerProcessor(n, c) { Cls = c; }', scope);
  vm.runInContext(host.__worker, scope);
  const proc = vm.runInContext('new Cls()', scope);
  proc.write(7, 0x3f); // mixer: tone and noise off, so only register writes to the volume matter
  proc.psg.ready = 1;
  const send = (data) => proc.handleMessage_({ data });
  const frame = (dac, writes = []) => send({ msg: 'frame', dac: Float32Array.from(dac), writes: Int32Array.from(writes.flat()) });
  const render = (quanta) => {
    const out = new Float32Array(128 * quanta);
    for (let q = 0; q < quanta; q++) {
      const buf = new Float32Array(128);
      proc.process([[]], [[buf]]);
      out.set(buf, q * 128);
    }
    return out;
  };
  return { proc, send, frame, render };
}

test('the DAC samples of each frame are played back, continuous and in order, after a 2 frame buffer', () => {
  const { frame, render } = loadProcessor();
  const ramp = (f) => Array.from({ length: FRAME }, (_, i) => ((f * FRAME + i) % 200) / 400); // 0..0.5
  for (let f = 0; f < 6; f++) frame(ramp(f));
  const out = render(20); // 2560 samples > 5 frames
  const expected = [];
  for (let f = 0; f < 6; f++) expected.push(...ramp(f).map((v) => v * 0.9));
  let compared = 0;
  for (let i = 0; i < out.length && i < expected.length; i++) {
    assert.ok(Math.abs(out[i] - expected[i]) < 1e-4, `sample ${i}: ${out[i]} vs ${expected[i]}`);
    compared++;
  }
  assert.ok(compared > 2000);
});

test('PSG register writes are applied at their sample offset, so volume register samples work', () => {
  const { frame, render } = loadProcessor();
  const silent = new Array(FRAME).fill(0);
  // volume of channel A (reg 8) jumps to 15 at sample 100 and back to 0 at sample 300
  frame(silent, [[100, 8, 15], [300, 8, 0]]);
  frame(silent);
  frame(silent);
  const out = render(8);
  const peak = (a, b) => Math.max(...Array.from(out.slice(a, b), Math.abs));
  assert.ok(peak(0, 95) < 1e-4, 'silent before the write');
  assert.ok(peak(105, 295) > 0.01, 'sound between the two writes');
  assert.ok(peak(310, 440) < 1e-4, 'silent after the second write');
});

test('many writes inside one frame are not collapsed into one burst (8 kHz sample playback)', () => {
  const { frame, render } = loadProcessor();
  const silent = new Array(FRAME).fill(0);
  const writes = [];
  // 8 kHz alternation of the volume register: one write every ~2.75 samples
  for (let k = 0, t = 0; t < FRAME - 3; k++, t = Math.round(k * 2.75)) writes.push([t, 8, k % 2 ? 15 : 0]);
  frame(silent, writes);
  frame(silent);
  frame(silent);
  const out = render(8);
  let flips = 0;
  for (let i = 1; i < FRAME; i++) if ((Math.abs(out[i]) > 1e-4) !== (Math.abs(out[i - 1]) > 1e-4)) flips++;
  assert.ok(flips > 100, `only ${flips} level changes in one frame, expected ~160`);
});

test('muting silences the output and the stop message clears queued audio', () => {
  const { send, frame, render, proc } = loadProcessor();
  const tone = new Array(FRAME).fill(0.4);
  for (let f = 0; f < 4; f++) frame(tone);
  send({ msg: 'toggleEnabled' });
  assert.equal(Math.max(...render(6)), 0);
  send({ msg: 'toggleEnabled' });
  send({ msg: 'clear' });
  assert.equal(proc.frames.length, 0);
});
