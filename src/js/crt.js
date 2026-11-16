// Vectrex monitor look: a WebGL pass over the 2D vector canvas (#vecscr).
//
// The Vectrex has a 9" black and white *vector* tube: there is no raster, so no scanlines, no shadow mask and no
// RGB triads. Adding those would be wrong. What the tube really does, and what this reproduces:
//   - a thin, white-hot beam core whose spot swells with intensity (osint.js draws it that way)
//   - halation: light scattering in the phosphor and the thick glass, a soft halo of several radii around every line
//   - joins and crossings get brighter because the beam dwells / overdraws there (additive drawing in osint.js)
//   - a slightly domed face plate: gentle barrel distortion, darker corners, rounded visible area
//   - a faint glass reflection and a lifted black level (a lit tube never shows pure black)
//   - a little phosphor sparkle
//   - the overlay: the coloured plastic sheet sits in front of the tube and the beam shines THROUGH it. A white line
//     behind a yellow band is a yellow line, and the halo spreads the colour of the plastic it lands in. So the
//     overlay is sampled here and used as a filter on the light, and the light is added on top of the overlay
//     (CSS mix-blend-mode: screen), instead of the overlay being painted over a white picture.
//   - analog instability (slider): the deflection drifts and shimmers, the image breathes with the load on the high
//     voltage, a hum band rolls through the brightness and now and then the picture tears sideways for a moment
//
// #vecscr stays the source of truth (tests and screenshots read it); #crt is only what you see.
var crt = (function(){
  var STORE = "vecx.crt";
  var STORE_GLOW = "vecx.crt.glow";
  var STORE_INSTAB = "vecx.crt.instab";
  // 0..1.6 and 0..1.5; the defaults are the balanced look
  var my = { on: false, glow: 1, instab: 0.5, canvas: null, ok: false };
  var last = 0;
  var glitch = 0;
  var glitchY = 0;

  var gl = null;
  var src = null;
  var progBlur = null;
  var progFinal = null;
  var srcTex = null;
  var ovTex = null;
  var ovOk = false;
  var overlayEl = null;
  // the screen canvas covers this part of the overlay picture (see resizer() in seamless.js)
  var OV_SCALE_X = 330 / 351;
  var OV_SCALE_Y = 410 / 449;
  var levels = [];      // [{ w, h, a, b }] ping-pong pairs at 1/2, 1/4, 1/8
  var texW = 0;
  var texH = 0;
  var t0 = 0;

  var VERT =
    "attribute vec2 a; varying vec2 uv;" +
    "void main(){ uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }";

  var PREC =
    "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";

  // 9 tap gaussian from 5 bilinear taps
  var FRAG_BLUR = PREC +
    "varying vec2 uv; uniform sampler2D t; uniform vec2 d;" +
    "void main(){" +
    "  vec3 c = texture2D(t, uv).rgb * 0.2270270270;" +
    "  c += (texture2D(t, uv + d * 1.3846153846).rgb + texture2D(t, uv - d * 1.3846153846).rgb) * 0.3162162162;" +
    "  c += (texture2D(t, uv + d * 3.2307692308).rgb + texture2D(t, uv - d * 3.2307692308).rgb) * 0.0702702703;" +
    "  gl_FragColor = vec4(c, 1.0);" +
    "}";

  var FRAG_FINAL = PREC +
    "varying vec2 uv;" +
    "uniform sampler2D uS, uB1, uB2, uB3, uOv;" +
    "uniform float uTime, uGlow, uInstab, uFlick, uGlitch, uGlitchY, uOvOn;" +
    "uniform vec2 uOvK;" +
    "uniform vec2 uJit;" +
    "float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }" +
    // smooth 1D noise, in [0, 1]
    "float vn(float x){ float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(vec2(i, 3.7)), hash(vec2(i + 1.0, 3.7)), f); }" +
    "void main(){" +
    "  vec2 p = uv * 2.0 - 1.0;" +
    "  float I = uInstab;" +
    // --- analog instability -------------------------------------------------------------------------
    // the high voltage sags when much of the picture is lit: the image breathes (a touch smaller, a touch dimmer)
    "  float load = (texture2D(uB3, vec2(0.3, 0.3)).g + texture2D(uB3, vec2(0.7, 0.3)).g + texture2D(uB3, vec2(0.3, 0.7)).g + texture2D(uB3, vec2(0.7, 0.7)).g + texture2D(uB3, vec2(0.5, 0.5)).g) * 0.2;" +
    "  float breath = clamp(load * 7.0, 0.0, 1.0);" +
    "  p *= 1.0 - 0.012 * I * breath;" +
    // deflection amplifiers drift and hum: slow wander, a shimmer that differs line by line, a tiny jitter per frame
    "  vec2 wob = vec2(" +
    "    sin(uTime * 0.9 + p.y * 2.3) * 0.0035 + sin(uTime * 2.1 + p.y * 5.0) * 0.0015 + (vn(p.y * 11.0 + uTime * 4.0) - 0.5) * 0.0045," +
    "    sin(uTime * 0.7 + p.x * 1.9) * 0.0030 + (vn(p.x * 9.0 - uTime * 3.0) - 0.5) * 0.0030);" +
    "  p += (wob + uJit) * I;" +
    // now and then the picture tears sideways for a moment
    "  float band = smoothstep(0.0, 1.0, 1.0 - abs(p.y - uGlitchY) * 5.0);" +
    "  p.x += uGlitch * band * 0.018 * I;" +
    // the overlay in front of this spot of the tube: a gel that filters the light, printed art that blocks it
    "  vec4 ov = texture2D(uOv, (uv - 0.5) * uOvK + 0.5);" +
    "  float oa = ov.a * uOvOn;" +
    "  float mx = max(max(ov.r, ov.g), max(ov.b, 0.004));" +
    "  vec3 hue = ov.rgb / mx;" +
    "  float tint = smoothstep(0.02, 0.12, oa);" +
    "  float lightPass = 1.0 - 0.85 * smoothstep(0.55, 0.95, oa);" +
    // the white-hot core stays whiter than the halo, which carries the full colour of the plastic
    "  vec3 tCore = mix(mix(vec3(1.0), hue * (0.55 + 0.45 * mx), tint), vec3(1.0), 0.3) * lightPass;" +
    "  vec3 tHalo = mix(vec3(1.0), hue * (0.7 + 0.3 * mx), tint) * lightPass;" +
    // domed face plate
    "  vec2 w = p * vec2(1.0 + p.y * p.y * 0.016, 1.0 + p.x * p.x * 0.014);" +
    "  vec2 u = w * 0.5 + 0.5;" +
    "  vec3 core = texture2D(uS, u).rgb;" +
    "  vec3 h1 = texture2D(uB1, u).rgb;" +
    "  vec3 h2 = texture2D(uB2, u).rgb;" +
    "  vec3 h3 = texture2D(uB3, u).rgb;" +
    // beam: white-hot core, cool halation in three radii
    "  vec3 col = core * vec3(0.97, 0.99, 1.0) * tCore;" +
    "  col += uGlow * (h1 * vec3(0.55, 0.78, 1.0) * 1.3 + h2 * vec3(0.38, 0.62, 1.0) * 1.1 + h3 * vec3(0.28, 0.50, 0.95) * 0.9) * tHalo;" +
    // lit tube: lifted blacks, a bit of the picture's own light everywhere
    "  float r2 = dot(w, w);" +
    "  float vig = 1.0 - 0.30 * r2 * r2 * 0.5 - 0.10 * r2;" +
    "  vec3 haze = vec3(0.009, 0.012, 0.017) + h3 * vec3(0.05, 0.09, 0.16) * uGlow;" +
    "  col += haze * tHalo;" +
    // glass reflection from a window up and to the left
    "  vec2 q = w - vec2(-0.55, 0.62);" +
    "  float spot = exp(-dot(q * vec2(1.0, 1.3), q * vec2(1.0, 1.3)) * 2.2);" +
    "  float sweep = smoothstep(0.15, 1.2, dot(w, normalize(vec2(-0.55, 0.85))));" +
    "  col += vec3(0.78, 0.86, 1.0) * (spot * 0.040 + sweep * 0.014);" +
    "  col *= vig;" +
    // phosphor sparkle (only where there is light)
    "  float n = hash(gl_FragCoord.xy + fract(uTime * 0.37) * vec2(113.0, 71.0));" +
    "  float lit = clamp(dot(col, vec3(0.33)) * 2.0, 0.0, 1.0);" +
    "  col *= 1.0 + (n - 0.5) * 0.10 * lit;" +
    // brightness: supply ripple, a slow rolling hum band (mains beat), random flutter, sag under load, glitch dip
    "  float hum = 1.0 + 0.035 * sin((uv.y * 1.2 - uTime * 0.33) * 6.2832);" +
    "  float ripple = 1.0 + 0.010 * sin(uTime * 7.3) + 0.006 * sin(uTime * 19.1) + (vn(uTime * 8.0) - 0.5) * 0.020;" +
    "  col *= mix(1.0, hum * ripple * (1.0 + (uFlick - 0.5) * 0.04) * (1.0 - 0.07 * breath) * (1.0 - 0.18 * uGlitch), I);" +
    "  col *= 1.0 + 0.004 * sin(uTime * 7.3) * (1.0 - I);" +
    // soft shoulder so overlapping beams roll off instead of clipping
    "  col = 1.0 - exp(-col * 1.9);" +
    "  col /= (1.0 - exp(-1.9));" +
    "  col += (hash(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;" +
    // visible area of the tube: rounded corners, soft edge
    "  vec2 b = abs(w) - vec2(1.0 - 0.07);" +
    "  float d = length(max(b, 0.0)) - 0.07;" +
    "  col *= 1.0 - smoothstep(-0.012, 0.018, d);" +
    "  gl_FragColor = vec4(col, 1.0);" +
    "}";

  function shader(type, text) {
    var s = gl.createShader(type);
    gl.shaderSource(s, text);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(frag) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function texture(w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  function target(w, h) {
    var t = { w: w, h: h, tex: texture(w, h), fbo: gl.createFramebuffer() };
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    return t;
  }

  function freeTarget(t) {
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
  }

  function buildLevels(w, h) {
    for (var i = 0; i < levels.length; i++) {
      freeTarget(levels[i].a);
      freeTarget(levels[i].b);
    }
    levels = [];
    for (var k = 1; k <= 3; k++) {
      var lw = Math.max(2, Math.floor(w / (1 << k)));
      var lh = Math.max(2, Math.floor(h / (1 << k)));
      levels.push({ a: target(lw, lh), b: target(lw, lh) });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function blur(from, to, dx, dy) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, to.w, to.h);
    gl.useProgram(progBlur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.tex || from);
    gl.uniform1i(gl.getUniformLocation(progBlur, "t"), 0);
    gl.uniform2f(gl.getUniformLocation(progBlur, "d"), dx, dy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function setup() {
    var c = document.createElement("canvas");
    c.id = "crt";
    c.setAttribute("aria-hidden", "true");
    gl = c.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false })
      || c.getContext("experimental-webgl", { alpha: false, antialias: false });
    if (!gl) return false;
    progBlur = program(FRAG_BLUR);
    progFinal = program(FRAG_FINAL);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    srcTex = texture(0, 0);
    ovTex = texture(0, 0);
    // above the overlay: the light is added on top of the plastic (mix-blend-mode: screen in modern.css)
    overlayEl = document.getElementById("overlay");
    var anchor = overlayEl || src;
    anchor.parentNode.insertBefore(c, anchor.nextSibling);
    my.canvas = c;
    return true;
  }

  function fitToSource() {
    var c = my.canvas;
    if (c.width !== src.width || c.height !== src.height) {
      c.width = src.width;
      c.height = src.height;
    }
    // same box on the page as the 2D canvas (resizer() positions that one)
    if (c.style.cssText !== src.style.cssText) c.style.cssText = src.style.cssText;
    if (texW !== src.width || texH !== src.height) {
      texW = src.width;
      texH = src.height;
      buildLevels(texW, texH);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
    }
  }

  // the rare sideways tear: an envelope that decays in about 0.2 s, started at random
  function stir() {
    var now = performance.now();
    var dt = last ? Math.min(now - last, 100) : 0;
    last = now;
    if (glitch > 0) glitch = Math.max(0, glitch - dt / 200);
    else if (my.instab > 0 && Math.random() < my.instab * 0.004) {
      glitch = 1;
      glitchY = Math.random() * 1.8 - 0.9;
    }
  }
  my.glitching = function () {
    return glitch > 0;
  };

  // the overlay picture as a texture, whenever a new one has loaded
  function uploadOverlay() {
    ovOk = false;
    if (!gl || !overlayEl || !overlayEl.naturalWidth) return;
    try {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, ovTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlayEl);
      ovOk = true;
    } catch (e) {
      // a page opened from file:// taints the image: no colour filtering then, white beam as before
      console.warn("CRT: overlay not readable, beam stays white", e);
    }
    my.frame();
  }

  // one display refresh: upload the vector canvas, blur it three times, composite
  my.frame = function () {
    if (!my.on || !my.ok || !src.width || !src.height) return;
    if (gl.isContextLost()) return;
    fitToSource();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

    var first = levels[0];
    blur(srcTex, first.a, 1 / texW, 0);
    blur(first.a, first.b, 0, 1 / first.a.h);
    for (var i = 1; i < levels.length; i++) {
      var prev = levels[i - 1].b;
      blur(prev, levels[i].a, 1 / prev.w, 0);
      blur(levels[i].a, levels[i].b, 0, 1 / levels[i].a.h);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, my.canvas.width, my.canvas.height);
    gl.useProgram(progFinal);
    var units = [srcTex, levels[0].b.tex, levels[1].b.tex, levels[2].b.tex];
    var names = ["uS", "uB1", "uB2", "uB3"];
    for (var u = 0; u < units.length; u++) {
      gl.activeTexture(gl.TEXTURE0 + u);
      gl.bindTexture(gl.TEXTURE_2D, units[u]);
      gl.uniform1i(gl.getUniformLocation(progFinal, names[u]), u);
    }
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, ovTex);
    gl.uniform1i(gl.getUniformLocation(progFinal, "uOv"), 4);
    var ovOn = ovOk && overlayEl && !overlayEl.classList.contains("fadeOut") ? 1 : 0;
    gl.uniform1f(gl.getUniformLocation(progFinal, "uOvOn"), ovOn);
    gl.uniform2f(gl.getUniformLocation(progFinal, "uOvK"), OV_SCALE_X, OV_SCALE_Y);
    gl.uniform1f(gl.getUniformLocation(progFinal, "uTime"), (performance.now() - t0) / 1000);
    gl.uniform1f(gl.getUniformLocation(progFinal, "uGlow"), my.glow);
    stir();
    gl.uniform1f(gl.getUniformLocation(progFinal, "uInstab"), my.instab);
    gl.uniform1f(gl.getUniformLocation(progFinal, "uFlick"), Math.random());
    gl.uniform1f(gl.getUniformLocation(progFinal, "uGlitch"), glitch);
    gl.uniform1f(gl.getUniformLocation(progFinal, "uGlitchY"), glitchY);
    gl.uniform2f(gl.getUniformLocation(progFinal, "uJit"), (Math.random() - 0.5) * 0.003, (Math.random() - 0.5) * 0.003);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // beam width in canvas pixels for the 2D renderer: fatter with the CRT look because the halo hides the aliasing
  function applyBeam() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (typeof vecx !== "undefined" && vecx.osint) vecx.osint.beam = dpr * (my.on ? 1.35 : 1);
  }
  my.applyBeam = applyBeam;

  function show(on) {
    var wrap = document.getElementById("wrapper");
    if (wrap) wrap.classList.toggle("crt-on", on);
  }

  my.set = function (on, remember) {
    my.on = !!on && my.ok;
    show(my.on);
    applyBeam();
    if (remember !== false) {
      try { localStorage.setItem(STORE, my.on ? "1" : "0"); } catch (e) { /* private mode */ }
    }
    if (my.on) my.frame();
    return my.on;
  };

  my.toggle = function () {
    return my.set(!my.on);
  };

  my.setInstab = function (v) {
    my.instab = Math.max(0, +v || 0);
    if (my.instab === 0) glitch = 0;
    try { localStorage.setItem(STORE_INSTAB, String(my.instab)); } catch (e) { /* private mode */ }
    my.frame();
  };

  my.setGlow = function (v) {
    my.glow = Math.max(0, +v || 0);
    try { localStorage.setItem(STORE_GLOW, String(my.glow)); } catch (e) { /* private mode */ }
    my.frame();
  };

  // blob of the picture as it is on screen, for screenshots
  my.shot = function () {
    if (!my.on) return null;
    my.frame();
    return my.canvas;
  };

  my.init = function (source) {
    src = source;
    t0 = performance.now();
    try {
      my.ok = setup();
    } catch (e) {
      console.warn("CRT effect unavailable:", e);
      my.ok = false;
    }
    var stored = null;
    var storedGlow = null;
    var storedInstab = null;
    try {
      stored = localStorage.getItem(STORE);
      storedGlow = localStorage.getItem(STORE_GLOW);
      storedInstab = localStorage.getItem(STORE_INSTAB);
    } catch (e) { /* private mode */ }
    if (storedGlow !== null && storedGlow == storedGlow * 1) my.glow = +storedGlow;
    if (storedInstab !== null && storedInstab == storedInstab * 1) my.instab = +storedInstab;
    var instab = document.getElementById("instab_slider");
    if (instab) {
      instab.value = my.instab;
      instab.disabled = !my.ok;
      instab.addEventListener("input", function (e) {
        my.setInstab(e.target.value);
        var stat = document.getElementById("stat");
        if (stat) stat.innerText = "CRT instability: " + (+e.target.value).toFixed(2);
      }, false);
    }
    var slider = document.getElementById("glow_slider");
    if (slider) {
      slider.value = my.glow;
      slider.disabled = !my.ok;
      slider.addEventListener("input", function (e) {
        my.setGlow(e.target.value);
        var stat = document.getElementById("stat");
        if (stat) stat.innerText = "Glow: " + (+e.target.value).toFixed(2);
      }, false);
    }
    if (my.ok && overlayEl) {
      overlayEl.addEventListener("load", uploadOverlay, false);
      uploadOverlay();
    }
    var wantsOn = (stored === null) ? true : stored === "1";
    my.set(wantsOn, false);
    return my.ok;
  };

  return my;
})();
