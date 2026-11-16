// Popularity ranking of the original cartridges, most widespread first.
//
// Nobody published per-title sales figures for the Vectrex (GCE / Milton Bradley kept none public;
// the only total anyone quotes is roughly 50,000 consoles). So this is a PROXY, not a sales count:
// the more copies were made, the more survive today, so the ranking follows how easy each cartridge is to find.
//
//   Tier 1  built in: shipped with every console, so it was "sold" more than any cartridge
//   Tier 2  "Common"        in the Digital Press rarity guide (steverd.com/rare/vectrex-r.htm)
//   Tier 3  "Uncommon"
//   Tier 4  "Rare"
//   Tier 5  "Extremely rare" (late releases and the 3-D Imager games)
//   Tier 6  never sold: prototype / mail-in replacement
//
// Inside a tier, titles are ordered by how many copies the Cartouche Power collectors' database finds on the
// market (cartouche-power.com, both the US and the European release counted).
var popularity = (function(){
  var order = [
    // built in
    "Commercial/Mine Storm_1982",
    // common
    "Commercial/Scramble_1982",
    "Commercial/Armor Attack_1982",
    "Commercial/Star Trek_1982",
    // uncommon
    "Commercial/Blitz_1982",
    "Commercial/Spike_1983",
    "Commercial/Berzerk_1982",
    "Commercial/Space Wars_1982",
    "Commercial/Clean Sweep_1982",
    "Commercial/Rip-Off_1982",
    "Commercial/Cosmic Chasm_1982",
    "Commercial/Solar Quest_1982",
    "Commercial/Hyperchase_1982",
    "Commercial/Star Hawk_1982",
    "Commercial/Bedlam_1982",
    // rare
    "Commercial/Heads Up_1983",
    "Commercial/Spinball_1983",
    "Commercial/Fortress of Narzod_1982",
    "Commercial/Star Castle_1983",
    // extremely rare
    "Commercial/Web Wars_1983",
    "Commercial/Polar Rescue_1983",
    "Commercial/Pole Position_1983",
    "3DImager/3-D Mine Storm_1983",
    "3DImager/3-D Narrow Escape_1983",
    "3DImager/3-D Crazy Coaster_1983",
    // never sold
    "Commercial/Clean Sweep_Mr Boston 1983",
    "Commercial/Mine Storm_II 1983"
  ];

  var rank = {};
  for (var i = 0; i < order.length; i++) rank[order[i]] = i + 1;

  return {
    // 1 = most widespread; 0 for cartridges that are not ranked (homebrews, hacks, demos...)
    rankOf: function(rom){ return rank[rom] || 0; },
    size: order.length
  };
})();
