// Cartridge library: sortable table with one search box over name, detail, author and year.
var romTbl = (function(){
  // table column -> field of a data row [name, detail, category, year, rom, rank, info, source]
  var FIELD = [5, 0, 7, 3];
  var YEAR_COL = 3;
  var RANK_COL = 0;
  var my = {
    tbl: null,
    search: null,
    count: null,
    data: [],
    sortCol: RANK_COL,
    sortDir: "asc",
    filteredVal: "",
    active: "",
    // "original" = the cartridges Milton Bradley / GCE sold; "all" adds homebrews, hacks, demos...
    scope: "original",
    originalCategories: ["Commercial", "3DImager"]
  };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  my.init = function(tbl, dat){
    my.tbl = tbl;
    my.search = document.getElementById("search");
    my.count = document.getElementById("count");

    var heads = tbl.getElementsByTagName("th");
    for (var h = 0; h < heads.length; h++) {
      heads[h].addEventListener("click", my.sort, false);
    }
    if (my.search) my.search.addEventListener("input", my.filt, false);
    var scopeBtns = document.querySelectorAll("[data-scope]");
    for (var b = 0; b < scopeBtns.length; b++) {
      scopeBtns[b].addEventListener("click", function(e){
        my.setScope(e.currentTarget.getAttribute("data-scope"));
      }, false);
    }

    var body = tbl.getElementsByTagName("tbody")[0];
    body.addEventListener("click", my.sel, false);
    body.addEventListener("keydown", function(e){
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        my.sel(e);
      }
    }, false);

    var thisYear = new Date().getFullYear();
    for (var i in dat) {
      for (var j in dat[i]) {
        var rom = romList[i][j];
        var year = rom.match(/\d{4}/);
        if (rom.indexOf("_") !== -1) year = rom.split("_")[1].match(/\d{4}/); // look behind _
        if (i.match(/\d{4}/) && i.match(/\d{4}/).toString().length === 4) year = i.match(/\d{4}/); // use year from category
        if (year != year *1 || year.toString().length != 4 || year > thisYear) {
          year = "";
        }
        var name = rom.split("_")[0];
        var detail = rom.split("_")[1];
        if (typeof detail == "undefined") {
          detail = i;
        }
        detail = detail.replace("by ","");
        detail = detail.replace("(","");
        detail = detail.replace(")","");
        detail = detail.split(",")[0];
        detail = detail.replace(year, "");

        // the original cartridges come with a description, genre and origin
        var info = cartInfo[i + "/" + rom] || null;
        if (info) {
          name = info.title || name;
          detail = info.genre + " · " + info.players;
        }
        var source = info ? info.origin : i;

        my.data.push([name, detail, i, year ? String(year) : "", rom, popularity.rankOf(i + "/" + rom), info, source]);
      }
    }

    my.sortBy(my.sortCol, my.sortDir);
  };

  my.rowRom = function(row) {
    return row[2] + "/" + row[4];
  };

  my.find = function(rom) {
    for (var i = 0; i < my.data.length; i++) {
      if (my.rowRom(my.data[i]) === rom) return my.data[i];
    }
    return null;
  };

  my.sel = function(e){
    var tr = e.target;
    while (tr && tr.tagName !== "TR") {
      tr = tr.parentElement;
    }
    if (!tr) return;
    var rom = tr.getAttribute("rom");
    if (rom) {
      switchRom( rom );
      if (typeof modernUI !== "undefined") modernUI.resumeSoon();
    }
  };

  my.inScope = function(row) {
    return my.scope === "all" || my.originalCategories.indexOf(row[2]) !== -1;
  };

  my.setScope = function(scope) {
    my.scope = scope;
    my.filterNow();
    var list = document.getElementById("tblDiv");
    if (list) list.scrollTop = 0;
  };

  my.filt = function(e){
    my.filteredVal = e.target.value.toLowerCase().trim();
    my.filterNow();
  };

  my.filterNow = function(){
    var words = my.filteredVal ? my.filteredVal.split(/\s+/) : [];
    var rows = my.tbl.getElementsByTagName("tbody")[0].rows;
    var shown = 0;
    var inScope = 0;
    var originals = 0;
    for (var i = 0; i < rows.length; i++) {
      var d = my.data[i];
      if (my.originalCategories.indexOf(d[2]) !== -1) originals++;
      var ok = my.inScope(d);
      if (ok) inScope++;
      var hay = (d[0] +" "+ d[1] +" "+ d[7] +" "+ d[3] +" "+ (d[6] ? d[6].blurb : "")).toLowerCase();
      for (var w = 0; ok && w < words.length; w++) {
        if (hay.indexOf(words[w]) === -1) ok = false;
      }
      rows[i].classList.toggle("hide", !ok);
      if (ok) shown++;
    }
    if (my.count) {
      my.count.textContent = (shown === inScope) ? inScope + " cartridges" : shown + " of " + inScope;
    }
    var btns = document.querySelectorAll("[data-scope]");
    for (var b = 0; b < btns.length; b++) {
      var scope = btns[b].getAttribute("data-scope");
      btns[b].setAttribute("aria-pressed", scope === my.scope ? "true" : "false");
      var n = btns[b].querySelector("b");
      if (n) n.textContent = (scope === "all") ? my.data.length : originals;
    }
    var empty = document.getElementById("noResults");
    if (empty) {
      empty.style.display = shown ? "none" : "block";
      var more = document.getElementById("searchAll");
      if (more) more.style.display = (my.scope === "original") ? "inline" : "none";
    }
  };

  my.sort = function(e){
    var th = e.currentTarget;
    var col = th.cellIndex;
    var dir = (my.sortCol === col && my.sortDir === "asc") ? "desc" : "asc";
    my.sortBy(col, dir);
  };

  my.sortBy = function(col, dir){
    my.sortCol = col;
    my.sortDir = dir;
    var sign = (dir === "asc") ? 1 : -1;
    var f = FIELD[col];
    my.data.sort(function(a, b){
      var x = a[f], y = b[f];
      if (col === RANK_COL) {
        // unranked cartridges always come after the ranked ones
        if (x === 0 && y !== 0) return 1;
        if (y === 0 && x !== 0) return -1;
        var d = (x - y) * sign;
        return d || String(a[0]).localeCompare(String(b[0]), undefined, { sensitivity: "base" });
      }
      if (col === YEAR_COL) {
        // empty years always last
        if (x === "" && y !== "") return 1;
        if (y === "" && x !== "") return -1;
      }
      var r = String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      if (r === 0) r = String(a[0]).localeCompare(String(b[0]), undefined, { sensitivity: "base" });
      return r * sign;
    });
    var heads = my.tbl.getElementsByTagName("th");
    for (var i = 0; i < heads.length; i++) {
      if (i === col) heads[i].setAttribute("data-dir", dir);
      else heads[i].removeAttribute("data-dir");
    }
    my.render();
  };

  // scroll the list (only the list, never the page) so that the row is visible below the sticky header
  my.reveal = function(row){
    var box = document.getElementById("tblDiv");
    if (!box) return;
    var head = my.tbl.tHead ? my.tbl.tHead.offsetHeight : 0;
    var b = box.getBoundingClientRect();
    var r = row.getBoundingClientRect();
    if (r.top < b.top + head) box.scrollTop -= (b.top + head) - r.top;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
  };

  my.setActive = function(rom){
    my.active = rom || "";
    var rows = my.tbl ? my.tbl.getElementsByTagName("tbody")[0].rows : [];
    for (var i = 0; i < rows.length; i++) {
      var on = rows[i].getAttribute("rom") === my.active;
      rows[i].classList.toggle("active", on);
      if (on && !rows[i].classList.contains("hide")) my.reveal(rows[i]);
    }
  };

  my.render = function() {
    var html = [];
    for (var i = 0; i < my.data.length; i++) {
      var d = my.data[i];
      var rom = my.rowRom(d);
      var cls = (d[6] ? "rich" : "") + (rom === my.active ? " active" : "");
      html.push('<tr tabindex="0" rom="'+ esc(rom) +'"'+ (cls ? ' class="'+ cls.trim() +'"' : '') +'>');
      html.push('<td class="rank"><div>'+ (d[5] ? d[5] : "") +'</div></td>');
      var blurb = d[6] ? '<div class="blurb" title="'+ esc(d[6].blurb) +'">'+ esc(d[6].blurb) +'</div>' : '';
      html.push('<td><div class="nm" title="'+ esc(d[0]) +'">'+ esc(d[0]) +'</div>'+ blurb +'</td>');
      html.push('<td><div class="d1" title="'+ esc(d[7]) +'">'+ esc(d[7]) +'</div>'+ (d[1] ? '<div class="d2" title="'+ esc(d[1]) +'">'+ esc(d[1]) +'</div>' : '') +'</td>');
      html.push('<td><div title="'+ esc(d[3]) +'">'+ esc(d[3]) +'</div></td>');
      html.push('</tr>');
    }
    my.tbl.getElementsByTagName("tbody")[0].innerHTML = html.join("");
    my.filterNow();
  };

  return my;
})();
