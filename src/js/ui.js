// Modern menu glue: now-playing header, toggle states, slider fills, keyboard labels for any layout.
// Loaded before seamless.js, which calls modernUI.nowPlaying() from switchRom(). Everything touching
// the emulator globals (vecx, input, romTbl, ...) is lazy.
var modernUI = (function () {
  var my = { rom: "", gamepad: false };
  var BUILTIN = { name: "Mine Storm", sub: "Built into the console" };
  var learned = {};     // KeyboardEvent.code -> printed character, learned from real key presses
  var layoutMap = null; // navigator.keyboard layout map where the browser has one

  function $(id) {
    return document.getElementById(id);
  }

  function setPressed(id, on) {
    var b = $(id);
    if (b) b.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function paintSlider(el) {
    var min = +el.min;
    var max = +el.max;
    el.style.setProperty("--p", ((el.value - min) / (max - min) * 100) + "%");
    var out = $(el.id + "_val");
    if (out) out.textContent = (+el.value).toFixed(2);
  }

  // ---- now playing ----------------------------------------------------------------------------

  my.nowPlaying = function (rom) {
    my.rom = (typeof rom === "string") ? rom : "";
    var name = BUILTIN.name;
    var sub = BUILTIN.sub;
    if (typeof rom === "object") {
      name = "Dropped cartridge";
      sub = "Local file";
    } else if (rom) {
      var row = (typeof romTbl !== "undefined") ? romTbl.find(rom) : null;
      if (row) {
        name = row[0];
        var parts = [];
        if (row[1] && row[1] !== row[7]) parts.push(row[1]);
        parts.push(row[7]);
        if (row[3] && row[7].indexOf(row[3]) === -1) parts.push(row[3]);
        sub = parts.join(" · ");
      } else {
        name = rom.substr(rom.lastIndexOf("/") + 1).split("_")[0];
        sub = "";
      }
    }
    $("nowName").textContent = name;
    $("nowSub").textContent = sub;
    document.title = name + " · Vectrex";
    if (typeof romTbl !== "undefined" && romTbl.tbl) romTbl.setActive(my.rom);
  };

  // ---- state of the toggle tiles --------------------------------------------------------------

  my.sync = function () {
    var rtm = $("rtm6809");
    setPressed("btnSound", !(typeof vecx !== "undefined" && vecx.e8910 && vecx.e8910.enabled === false));
    setPressed("btnOverlay", !$("overlay").classList.contains("fadeOut"));
    setPressed("btnAA", !$("vecscr").classList.contains("noAA"));
    setPressed("btnCRT", typeof crt !== "undefined" && crt.on);
    setPressed("btnGP", my.gamepad);
    setPressed("btnKeys", typeof input !== "undefined" && input.keys.switchKeys);
    setPressed("btnPads", typeof input !== "undefined" && input.gamepads.switchGP);
    setPressed("btnRTM", !!(rtm && rtm.classList.contains("fadeIn")));
    setPressed("btnFull", !!document.fullscreenElement);
    ["vol_slider", "glow_slider", "instab_slider", "lum_slider", "gam_slider"].forEach(function (id) {
      paintSlider($(id));
    });
  };

  // ---- actions --------------------------------------------------------------------------------

  my.resumeSoon = function () {
    // picking a cartridge closes the menu once the new ROM had time to start
    setTimeout(function () {
      var menu = $("menu");
      if (menu.style.display === "block") toggleMenu();
    }, 350);
  };

  my.reset = function () {
    vecx.reset();
    my.resumeSoon();
  };

  my.toggleGamepad = function () {
    toggleGP();
    my.gamepad = !my.gamepad;
  };

  my.copyLink = function () {
    var url = location.origin + location.pathname + (my.rom ? "?rom=" + my.rom : "");
    copyToClipboard(url);
    $("stat").textContent = "Link copied.";
  };

  // ---- keyboard labels ------------------------------------------------------------------------

  var SYMBOLS = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: "Space" };

  function labelFor(code) {
    if (SYMBOLS[code]) return SYMBOLS[code];
    var num = /^Numpad(\d)$/.exec(code);
    if (num) return num[1];
    var printed = learned[code] || (layoutMap && layoutMap.get(code));
    if (printed) return printed.toUpperCase();
    return code.replace(/^Key|^Digit/, "");
  }

  my.labelKeys = function () {
    var list = document.querySelectorAll("kbd[data-p]");
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      var set = (k.getAttribute("data-p") === "2") ? input.keys.keys2 : input.keys.keys1;
      k.textContent = labelFor(set[+k.getAttribute("data-i")]);
    }
  };

  function learnLayout(e) {
    if (e.code && /^(Key|Digit)/.test(e.code) && e.key && e.key.length === 1 && learned[e.code] !== e.key) {
      learned[e.code] = e.key;
      if (typeof input !== "undefined") my.labelKeys();
    }
  }

  // ---- wiring ---------------------------------------------------------------------------------

  function init() {
    var menu = $("menu");

    new MutationObserver(function () {
      var open = menu.style.display === "block";
      document.body.classList.toggle("menu-open", open);
      if (open) {
        my.sync();
        my.labelKeys();
        if (window.matchMedia("(pointer: fine)").matches) $("search").focus({ preventScroll: true });
      }
    }).observe(menu, { attributes: true, attributeFilter: ["style"] });

    // click on the dimmed backdrop = resume
    menu.addEventListener("click", function (e) {
      if (e.target === menu) toggleMenu();
    });

    // toggles in the menu change state asynchronously (chip monitor loads a script)
    menu.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".tile")) {
        setTimeout(my.sync, 0);
        setTimeout(my.sync, 400);
      }
    });
    document.addEventListener("fullscreenchange", my.sync);

    ["vol_slider", "glow_slider", "instab_slider", "lum_slider", "gam_slider"].forEach(function (id) {
      $(id).addEventListener("input", function (e) {
        paintSlider(e.target);
      });
    });

    window.addEventListener("keydown", learnLayout, true);
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then(function (map) {
        layoutMap = map;
        my.labelKeys();
      }).catch(function () {});
    }

    my.labelKeys();
    my.sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return my;
})();
