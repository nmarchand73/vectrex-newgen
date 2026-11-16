// Headless Vectrex machine built on the unmodified JSVecX core (CPU, VIA, analog).
// Only the browser-bound parts (canvas renderer, WebAudio PSG) are replaced by stubs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..');
const jsDir = path.join(root, 'src', 'js');
const procDir = path.join(root, 'src', 'processed');
export const BIOS_PATH = path.join(root, 'src', 'bios', '7adb.bin');

export const CYCLES_PER_FRAME = 30000; // 1.5 MHz / 50 Hz
export const WAIT_RECAL = 0xf192;

const STUBS = `
var input = { mouse: { down: false, x: 0, y: 0 } };
function osint() {
  this.EMU_TIMER = 20;
  this.init = function () {};
  this.osint_clearscreen = function () {};
  this.osint_render = function () { __host.onRender(vecx); };
}
function e8910() {
  this.psg = { AnaA: 0, AnaB: 0, AnaC: 0, lastReg: 0, lastVal: 0, BDir: 0, BC1: 0 };
  this.init = function () {};
  this.start = function () {};
  this.stop = function () {};
  this.toggleEnabled = function () { return true; };
  this.e8910_write = function (r, v) { __host.onPsg(r, v); };
  this.dac_push = function (samples) { __host.onDac(samples); };
}
`;

function load(ctx, file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

export class Machine {
  // fastBios applies the same 3-byte patch as the browser player's default `bopt=fast`
  // (shortens the BIOS title delay). Pass fastBios:false for the untouched BIOS.
  constructor({ biosPath = BIOS_PATH, fastBios = true } = {}) {
    this.renders = [];
    this.keepRenders = 0;
    this.psgWrites = [];
    this.psgLog = false;
    const host = {
      onRender: (v) => {
        if (this.keepRenders > 0) {
          const list = [];
          for (let i = 0; i < v.vector_draw_cnt; i++) {
            const e = v.vectors_draw[i];
            list.push([e.x0, e.y0, e.x1, e.y1, e.color]);
          }
          this.renders.push(list);
          if (this.renders.length > this.keepRenders) this.renders.shift();
        }
        this.lastVectorCount = v.vector_draw_cnt;
      },
      onPsg: (r, v) => {
        if (this.psgLog) this.psgWrites.push([r, v]);
      },
      onDac: (samples) => {
        // one chunk of 22050 Hz samples per emulated frame, level -1..1
        if (this.dacLog) this.dacChunks.push(Float32Array.from(samples));
      },
    };
    this.dacChunks = [];
    this.dacLog = false;
    this.lastVectorCount = 0;
    const ctx = vm.createContext({
      console,
      Math,
      Date,
      __host: host,
      setTimeout: () => 0,
      setInterval: () => 0,
      clearInterval: () => {},
      clearTimeout: () => {},
    });
    load(ctx, path.join(jsDir, 'utils.js'));
    load(ctx, path.join(jsDir, 'globals.js'));
    load(ctx, path.join(procDir, 'e6809.js'));
    vm.runInContext(STUBS, ctx);
    load(ctx, path.join(jsDir, 'vector_t.js'));
    load(ctx, path.join(procDir, 'vecx.js'));
    vm.runInContext('var vecx = new VecX();', ctx);
    this.ctx = ctx;
    this.vecx = vm.runInContext('vecx', ctx);
    this.globals = vm.runInContext('Globals', ctx);
    let bios = fs.readFileSync(biosPath).toString('latin1');
    if (fastBios) bios = bios.slice(0, 0x1067) + '\x26\x81\x20' + bios.slice(0x106a);
    this.globals.romdata = bios;
    this.vecx.e6809.init(this.vecx);
    this.cycles = 0;
  }

  reset(cartridge) {
    this.globals.cartdata = cartridge ? Buffer.from(cartridge).toString('latin1') : null;
    this.vecx.doBankSwitching = false;
    this.vecx.currentBank = 0;
    this.vecx.shadow_snd_regs14 = 0xff;
    this.vecx.vecx_reset();
    this.cycles = 0;
    this.renders.length = 0;
  }

  // Run the BIOS boot/title sequence until the cartridge's own code starts executing.
  // Returns the number of CPU steps used. The BIOS shows the title for a fixed time first.
  bootToCart(maxSteps = 40_000_000) {
    const v = this.vecx;
    let n = 0;
    for (; n < maxSteps; n++) {
      v.snd_regs[14] = v.shadow_snd_regs14;
      v.vecx_emu(1, 0);
      const pc = this.pc;
      if (pc < 0x8000 && pc >= 0x10) return n;
    }
    throw new Error('cartridge code never started');
  }

  get pc() {
    return this.vecx.e6809.reg_pc;
  }

  peek(addr) {
    return this.vecx.ram[addr & 0x3ff] & 0xff;
  }

  peek16(addr) {
    return (this.peek(addr) << 8) | this.peek(addr + 1);
  }

  poke(addr, val) {
    this.vecx.ram[addr & 0x3ff] = val & 0xff;
  }

  // button: 0..3 (physical buttons 1..4), controller 0 or 1
  button(controller, button, pressed) {
    this.vecx.button(controller, button, pressed);
  }

  // x, y in -1, 0, 1
  stick(controller, x, y) {
    const v = (n) => (n < 0 ? 0x00 : n > 0 ? 0xff : 0x80);
    this.vecx.axis(controller, 0, v(x));
    this.vecx.axis(controller, 1, v(y));
  }

  // Run one 50 Hz frame (30000 cycles), like the browser emulation loop.
  frame() {
    this.vecx.snd_regs[14] = this.vecx.shadow_snd_regs14;
    this.vecx.vecx_emu(CYCLES_PER_FRAME, 0);
    this.cycles += CYCLES_PER_FRAME;
  }

  frames(n) {
    for (let i = 0; i < n; i++) this.frame();
  }

  // Step instruction by instruction and report per-game-frame timing, measured at Wait_Recal.
  // Returns { frames, overruns, maxCycles, cycles: number[] }.
  profile(nGameFrames, onFrame) {
    const vecx = this.vecx;
    const out = { frames: 0, overruns: 0, maxCycles: 0, cycles: [] };
    let sinceEntry = 0;
    let started = false;
    let guard = 0;
    while (out.frames < nGameFrames) {
      if (this.pc === WAIT_RECAL) {
        if (started) {
          const late = (vecx.via_ifr & 0x20) !== 0;
          if (late) out.overruns++;
          out.cycles.push(sinceEntry);
          if (sinceEntry > out.maxCycles) out.maxCycles = sinceEntry;
          out.frames++;
          if (onFrame) onFrame(out.frames, late, sinceEntry);
        }
        started = true;
        sinceEntry = 0;
      }
      vecx.snd_regs[14] = vecx.shadow_snd_regs14;
      const before = vecx.fcycles;
      vecx.vecx_emu(1, 0);
      // vecx_emu(1) always executes at least one instruction; fcycles tracks the cycle count.
      let used = before - vecx.fcycles;
      if (used < 0) used += this.globals.FCYCLES_INIT;
      sinceEntry += used;
      this.cycles += used;
      if (++guard > 400_000_000) throw new Error('profile guard tripped');
    }
    return out;
  }
}

export function readRom(file) {
  return fs.readFileSync(file);
}
