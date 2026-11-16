// Golden path in a real browser: the player loads Scramble and Spike (original ROMs) from its
// cartridge list, then switches between them and Mine Storm without reloading the page.
// Run: node --test tests/ui.test.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { root } from '../harness/machine.mjs';
import { serve } from './serve.mjs';

const outDir = path.join(root, 'tests', 'out');
let server;
let browser;
let page;
// software GL on a CI runner is slow: wait for the DOM, then for the player itself
const NAV = { waitUntil: 'domcontentloaded', timeout: 120000 };
let base;

test.before(async () => {
  ({ server, url: base } = await serve());
  // software WebGL so the CRT pass also runs on machines without a GPU
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  page.on('pageerror', (e) => {
    throw e;
  });
});

test.after(async () => {
  await browser?.close();
  server?.close();
});

const header = () => page.evaluate(() => {
  let s = '';
  for (let i = 0; i < 10; i++) s += String.fromCharCode(vecx.cart[i]);
  return s;
});

const litPixels = () => page.evaluate(() => {
  const c = document.getElementById('vecscr');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) n++;
  return n;
});

const hasLongHorizontalLine = () => page.evaluate(() => {
  const v = vecx.vectors_erse;
  for (let i = 0; i < vecx.vector_erse_cnt; i++) {
    if (Math.abs(v[i].x1 - v[i].x0) > 8000) return true;
  }
  return false;
});

async function waitForRender(min = 200) {
  await page.waitForFunction((m) => {
    const c = document.getElementById('vecscr');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) n++;
    return n > m;
  }, min, { timeout: 15000 });
}

async function closeMenu() {
  await page.evaluate(() => document.getElementById('menu').style.display === 'block' && toggleMenu());
  await page.waitForTimeout(700);
}

async function pickFromList(romPath, filterText) {
  await page.evaluate(() => document.getElementById('menu').style.display !== 'block' && toggleMenu());
  await page.locator('#search').fill(filterText);
  await page.locator(`#myTbl tbody tr[rom="${romPath}"] td`).first().click();
}

test('player boots Mine Storm and lists Scramble and Spike', async () => {
  await page.goto(`${base}/dev.html`, NAV);
  await waitForRender();
  const rows = await page.evaluate(() => [...document.querySelectorAll('#myTbl tbody tr')].map((r) => r.getAttribute('rom')));
  assert.ok(rows.length > 400, `cartridge list has ${rows.length} entries`);
  assert.ok(rows.includes('Commercial/Scramble_1982'), 'Scramble is listed');
  assert.ok(rows.includes('Commercial/Spike_1983'), 'Spike is listed');
});

const visibleRoms = () => page.evaluate(() => [...document.querySelectorAll('#myTbl tbody tr:not(.hide)')].map((r) => r.getAttribute('rom')));

test('the list shows only the original cartridges by default, "All" shows the rest', async () => {
  await page.evaluate(() => document.getElementById('menu').style.display !== 'block' && toggleMenu());
  const original = await visibleRoms();
  assert.ok(original.length >= 24 && original.length <= 40, `${original.length} original cartridges listed`);
  for (const rom of original) assert.match(rom, /^(Commercial|3DImager)\//, `${rom} is not an original cartridge`);
  assert.equal(await page.locator('[data-scope="original"]').getAttribute('aria-pressed'), 'true');
  const ranks = await page.evaluate(() => [...document.querySelectorAll('#myTbl tbody tr:not(.hide) td.rank')].map((td) => Number(td.textContent)));
  assert.deepEqual(ranks, original.map((_, i) => i + 1), 'originals are listed by popularity, 1..n, no gaps');
  assert.equal(original[0], 'Commercial/Mine Storm_1982', 'the built-in game is the most widespread');
  assert.equal(original[1], 'Commercial/Scramble_1982');
  const described = await page.evaluate(() => [...document.querySelectorAll('#myTbl tbody tr:not(.hide)')].every((r) => r.classList.contains('rich') && r.querySelector('.blurb').textContent.length > 30));
  assert.ok(described, 'every original cartridge has a description');
  await page.locator('#search').fill('helicopters');
  assert.deepEqual(await visibleRoms(), ['Commercial/Armor Attack_1982'], 'the description is searchable');
  await page.locator('#search').fill('');
  await page.locator('#search').fill('Amen Break');
  assert.equal((await visibleRoms()).length, 0, 'a homebrew is hidden in the original list');
  await page.locator('#searchAll').click();
  assert.ok((await visibleRoms()).some((r) => r.includes('Amen Break')), 'search all finds the homebrew');
  await page.locator('#search').fill('');
  assert.ok((await visibleRoms()).length > 400, 'All lists every cartridge');
  await page.locator('[data-scope="original"]').first().click();
  assert.equal((await visibleRoms()).length, original.length);
  await page.waitForTimeout(400); // let the chip transition finish
  await page.screenshot({ path: path.join(outDir, 'ui_menu.png') });
});

test('Scramble loads, shows its overlay and can be played', async () => {
  await pickFromList('Commercial/Scramble_1982', 'Scramble');
  await page.waitForFunction(() => /^g GCE 1982/.test(String.fromCharCode(...vecx.cart.slice(0, 10))));
  assert.equal(await header(), 'g GCE 1982');
  await page.waitForFunction(() => {
    const o = document.getElementById('overlay');
    return o.src.endsWith('/Scramble.png') && o.complete && o.naturalWidth > 0;
  }, null, { timeout: 15000 });
  await waitForRender();
  // title screen -> menu -> game: press button 4 (F) like the original does
  for (let i = 0; i < 40 && !(await hasLongHorizontalLine()); i++) {
    await page.keyboard.down('KeyF');
    await page.waitForTimeout(120);
    await page.keyboard.up('KeyF');
    await page.waitForTimeout(500);
  }
  assert.ok(await hasLongHorizontalLine(), 'Scramble terrain is scrolling');
  await closeMenu();
  await page.screenshot({ path: path.join(outDir, 'ui_scramble.png') });
});

test('switching to Spike resets the machine and loads Spike', async () => {
  await pickFromList('Commercial/Spike_1983', 'Spike');
  await page.waitForFunction(() => /^g GCE 1983/.test(String.fromCharCode(...vecx.cart.slice(0, 10))));
  assert.equal(await header(), 'g GCE 1983');
  await page.waitForFunction(() => {
    const o = document.getElementById('overlay');
    return o.src.endsWith('/Spike.png') && o.complete && o.naturalWidth > 0;
  }, null, { timeout: 15000 });
  await waitForRender();
  assert.equal(await hasLongHorizontalLine(), false, 'Scramble terrain must be gone');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down('KeyF');
    await page.waitForTimeout(120);
    await page.keyboard.up('KeyF');
    await page.waitForTimeout(500);
  }
  await waitForRender();
  assert.ok((await litPixels()) > 200, 'Spike is drawing');
  await closeMenu();
  await page.screenshot({ path: path.join(outDir, 'ui_spike.png') });
});

test('back to Scramble, then direct links work', async () => {
  await pickFromList('Commercial/Scramble_1982', 'Scramble');
  await page.waitForFunction(() => /^g GCE 1982/.test(String.fromCharCode(...vecx.cart.slice(0, 10))));
  await waitForRender();
  await page.goto(`${base}/dev.html?rom=Commercial/Spike_1983`, NAV);
  await page.waitForFunction(() => vecx.cart && /^g GCE 1983/.test(String.fromCharCode(...vecx.cart.slice(0, 10))));
  await waitForRender();
  await page.goto(`${base}/dev.html?rom=Commercial/Scramble_1982`, NAV);
  await page.waitForFunction(() => vecx.cart && /^g GCE 1982/.test(String.fromCharCode(...vecx.cart.slice(0, 10))));
  await waitForRender();
});

// What the player sees goes through the CRT pass (#crt); #vecscr stays the untouched source underneath.
const crtStats = () => page.evaluate(() => {
  crt.frame();
  const c = document.getElementById('crt');
  const t = document.createElement('canvas');
  t.width = c.width;
  t.height = c.height;
  const x = t.getContext('2d');
  x.drawImage(c, 0, 0); // same task as the draw, the WebGL buffer is still there
  const d = x.getImageData(0, 0, t.width, t.height).data;
  let bright = 0;
  let halo = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] + d[i + 1] + d[i + 2];
    if (v > 600) bright++;
    else if (v > 60) halo++;
  }
  return { bright, halo, shown: getComputedStyle(c).display !== 'none', srcHidden: getComputedStyle(vecscr).filter === 'brightness(0)', ok: crt.ok };
});

test('the CRT pass draws the beam with a halo and can be switched off', async () => {
  await pickFromList('Commercial/Scramble_1982', 'Scramble');
  await page.waitForFunction(() => /^g GCE 1982/.test(String.fromCharCode(...vecx.cart.slice(0, 10))));
  await waitForRender();
  await closeMenu();
  await page.waitForTimeout(500);
  const on = await crtStats();
  assert.ok(on.ok, 'WebGL is available');
  assert.ok(on.shown && on.srcHidden, 'the CRT canvas is what is shown');
  assert.ok(on.bright > 50, `beam core is lit (${on.bright})`);
  assert.ok(on.halo > on.bright * 3, `the glow spreads well beyond the core (${on.halo} vs ${on.bright})`);

  await page.evaluate(() => toggleMenu());
  await page.locator('#btnCRT').click();
  await page.waitForTimeout(100); // the tile state refreshes right after the click
  assert.equal(await page.locator('#btnCRT').getAttribute('aria-pressed'), 'false');
  const off = await page.evaluate(() => ({ crtShown: getComputedStyle(document.getElementById('crt')).display !== 'none', src: getComputedStyle(vecscr).filter }));
  assert.equal(off.crtShown, false);
  assert.equal(off.src, 'none');
  await page.locator('#btnCRT').click(); // the choice is remembered, turn it back on
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#btnCRT').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => document.getElementById('menu').style.display === 'block' && toggleMenu());
});

test('CRT instability is adjustable, remembered, and off at zero', async () => {
  await page.evaluate(() => toggleMenu());
  await page.locator('#instab_slider').fill('1.2');
  const set = await page.evaluate(() => ({ v: crt.instab, saved: localStorage.getItem('vecx.crt.instab') }));
  assert.equal(set.v, 1.2);
  assert.equal(set.saved, '1.2');
  await page.locator('#instab_slider').fill('0');
  const quiet = await page.evaluate(() => {
    let glitches = 0;
    for (let i = 0; i < 1000; i++) {
      crt.frame();
      if (crt.glitching()) glitches++;
    }
    return glitches;
  });
  assert.equal(quiet, 0, 'no tearing without instability');
  const wild = await page.evaluate(() => {
    crt.setInstab(1.5);
    let glitches = 0;
    for (let i = 0; i < 3000; i++) {
      crt.frame();
      if (crt.glitching()) {
        glitches++;
        break;
      }
    }
    return glitches;
  });
  assert.ok(wild > 0, 'the picture tears now and then at high instability');
  await page.locator('#instab_slider').fill('0.5');
  await page.evaluate(() => document.getElementById('menu').style.display === 'block' && toggleMenu());
});

// Regression: the vector picture used an integer scale (24 instead of 24.96 on a retina screen), which made it 4%
// too big, anchored top left, so it sat to the right of the overlay window and was cropped.
test('the picture fills the screen exactly and is centred, at any window size and pixel ratio', async () => {
  for (const [w, h, dsf] of [[1440, 900, 2], [1920, 1080, 1], [1280, 720, 1.5], [900, 1000, 1]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
    await p.goto(`${base}/dev.html?rom=Commercial/Star_Castle_1983`.replace('Star_Castle', 'Star Castle'), NAV);
    await p.waitForFunction(() => vecx.osint.ctx && vecscr.width > 300, null, { timeout: 120000 });
    const g = await p.evaluate(() => {
      const o = vecx.osint;
      const ov = document.getElementById('overlay').getBoundingClientRect();
      const sc = vecscr.getBoundingClientRect();
      return {
        spanX: Globals.ALG_MAX_X / o.scl_factor,
        spanY: Globals.ALG_MAX_Y / o.scl_factor,
        w: vecscr.width,
        h: vecscr.height,
        offX: o.off_x,
        offY: o.off_y,
        dx: (sc.left + sc.width / 2) - (ov.left + ov.width / 2),
        dpage: (ov.left + ov.width / 2) - innerWidth / 2,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    await p.close();
    const tag = `${w}x${h}@${dsf}`;
    assert.ok(Math.abs(g.spanX - g.w) <= 1.5 || Math.abs(g.spanY - g.h) <= 1.5, `${tag}: picture spans the canvas (${g.spanX.toFixed(1)}x${g.spanY.toFixed(1)} in ${g.w}x${g.h})`);
    assert.ok(g.spanX <= g.w + 0.01 && g.spanY <= g.h + 0.01, `${tag}: picture is not cropped`);
    assert.ok(Math.abs(g.offX) <= 1.5 && Math.abs(g.offY) <= 1.5, `${tag}: picture is centred (offsets ${g.offX.toFixed(2)}, ${g.offY.toFixed(2)})`);
    assert.ok(Math.abs(g.dx) <= 1, `${tag}: screen is centred in the overlay (${g.dx.toFixed(2)}px)`);
    assert.ok(Math.abs(g.dpage) <= 1, `${tag}: overlay is centred in the window (${g.dpage.toFixed(2)}px)`);
    assert.ok(g.overflow <= 0, `${tag}: the page does not overflow sideways (${g.overflow}px)`);
  }
});

// Regression: the glow around a point used to be an ellipse, 2-3x stronger vertically than horizontally
// (the vertical blur passes stepped twice as far as the horizontal ones).
test('the CRT glow around a point is round', async () => {
  const p = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  await p.goto(`${base}/dev.html`, NAV);
  await p.waitForFunction(() => vecx.osint.ctx && crt.ok && vecscr.width > 300, null, { timeout: 120000 });
  const g = await p.evaluate(() => {
    vecx.stop();
    crt.setInstab(0);
    document.getElementById('overlay').classList.add('fadeOut'); // no colour filter
    const ctx = vecx.osint.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, vecscr.width, vecscr.height);
    const cx = Math.round(vecscr.width / 2);
    const cy = Math.round(vecscr.height / 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, 7);
    ctx.fill();
    crt.frame();
    const c = document.getElementById('crt');
    const t = document.createElement('canvas');
    t.width = c.width;
    t.height = c.height;
    const x = t.getContext('2d');
    x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, t.width, t.height).data;
    const lum = (px, py) => d[(py * t.width + px) * 4 + 1];
    const out = {};
    for (const r of [8, 12, 20]) {
      // average of the four directions on each axis, so a tiny offset of the dot does not matter
      out[r] = {
        h: (lum(cx + r, cy) + lum(cx - r, cy)) / 2,
        v: (lum(cx, cy + r) + lum(cx, cy - r)) / 2,
      };
    }
    return out;
  });
  await p.close();
  for (const r of Object.keys(g)) {
    const ratio = g[r].v / g[r].h;
    assert.ok(ratio > 0.8 && ratio < 1.25, `glow at ${r}px is round: horizontal ${g[r].h}, vertical ${g[r].v}`);
  }
});
