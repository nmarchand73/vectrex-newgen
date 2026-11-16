// What each original cartridge is, shown in the cartridge list. Keys are "Category/rom" like romList.js.
// Sources: Wikipedia's list of Vectrex games, the Dot Eaters, the Vectrex wiki and the original manuals.
//   origin  where the game comes from ("Arcade: ..." = a port of that coin-op)
//   genre, players, blurb
//   title   only when the file name alone does not tell variants apart
var cartInfo = (function(){
  var ONE = "1 player";
  var ONE_TWO = "1-2 players";
  var ARCADE = "Arcade: ";
  var ORIGINAL = "Made for Vectrex";
  var IMAGER = "3-D Imager";

  return {
    "Commercial/Mine Storm_1982": {
      origin: "Built in", genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Asteroids-style shooter built into every console: blast the drifting mines. Early units crash on level 13."
    },
    "Commercial/Scramble_1982": {
      origin: ARCADE + "Konami", genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Fly a jet over scrolling terrain, bomb the ground targets, shoot the air ones and keep an eye on the fuel gauge. Converted by Paul Allen Newell."
    },
    "Commercial/Armor Attack_1982": {
      origin: ARCADE + "Cinematronics", genre: "Action", players: ONE_TWO,
      blurb: "Drive a jeep through a city grid and hunt the tanks and helicopters before they hunt you."
    },
    "Commercial/Star Trek_1982": {
      origin: ORIGINAL, genre: "Shoot 'em up", players: ONE,
      blurb: "Command the Enterprise from the bridge: shields, phasers, torpedoes, warp. Sold as Starship in Europe.",
      title: "Star Trek: The Motion Picture"
    },
    "Commercial/Blitz_1982": {
      origin: ORIGINAL, genre: "Sports", players: ONE_TWO,
      blurb: "American football with a playbook and a scrolling field. Sold in Europe as Blitz! American Football.",
      title: "Blitz! Action Football"
    },
    "Commercial/Spike_1983": {
      origin: ORIGINAL, genre: "Platformer", players: ONE_TWO,
      blurb: "Platform rescue game with speech, an early console game that talks. Designed by Tom Sloper."
    },
    "Commercial/Berzerk_1982": {
      origin: ARCADE + "Stern", genre: "Maze", players: ONE_TWO,
      blurb: "Stern's maze shooter redrawn in vectors: shoot the robots and leave the room before Evil Otto catches up."
    },
    "Commercial/Space Wars_1982": {
      origin: ARCADE + "Cinematronics", genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Two ships duel around a star whose gravity pulls on both, with plenty of rule options."
    },
    "Commercial/Clean Sweep_1982": {
      origin: ORIGINAL, genre: "Maze", players: ONE_TWO,
      blurb: "Pac-Man-style maze game: you are a vacuum cleaner emptying a bank vault while enemies chase you."
    },
    "Commercial/Rip-Off_1982": {
      origin: ARCADE + "Cinematronics", genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Defend a stack of fuel canisters from thieves, alone or as a two-player team."
    },
    "Commercial/Cosmic Chasm_1982": {
      origin: "Vectrex first, then arcade", genre: "Shoot 'em up", players: ONE,
      blurb: "Descend through the chambers of an alien ship, set a bomb at the reactor and escape. The first home game to be ported to the arcade."
    },
    "Commercial/Solar Quest_1982": {
      origin: ARCADE + "Cinematronics", genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Arena combat around a sun whose gravity pulls on you and your shots. Rescue ejected pilots for bonus points."
    },
    "Commercial/Hyperchase_1982": {
      origin: ORIGINAL, genre: "Racing", players: ONE_TWO,
      blurb: "Into-the-screen road racing with a gear shifter and a fuel gauge. Smooth scaling gives a real sense of speed.",
      title: "Hyperchase: Auto Race"
    },
    "Commercial/Star Hawk_1982": {
      origin: ARCADE + "Cinematronics", genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Into-the-screen space shooter with a fixed crosshair.",
      title: "Starhawk"
    },
    "Commercial/Bedlam_1982": {
      origin: ORIGINAL, genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Tempest in reverse: shoot outward from the centre of a spinning geometric arena. Designed by Tom Sloper."
    },
    "Commercial/Heads Up_1983": {
      origin: ORIGINAL, genre: "Sports", players: ONE_TWO,
      blurb: "Two-a-side soccer on a scrolling pseudo-3D pitch. Sold in Europe as Soccer.",
      title: "Heads Up Action Soccer"
    },
    "Commercial/Spinball_1983": {
      origin: ORIGINAL, genre: "Pinball", players: ONE_TWO,
      blurb: "Vector pinball on a two-screen table. Sold in Europe as Flipper Pinball."
    },
    "Commercial/Fortress of Narzod_1982": {
      origin: ORIGINAL, genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Steer a hovercraft up a mountain road past waves of guardians. Your shots ricochet off the walls, and back at you."
    },
    "Commercial/Star Castle_1983": {
      origin: ARCADE + "Cinematronics", genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Break through three counter-rotating rings of shields to hit the cannon at the centre."
    },
    "Commercial/Web Wars_1983": {
      origin: ORIGINAL, genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "Fly the Hawk King through the Web of Fantasy: capture 20 creatures, shoot the drones and dodge the Cosmic Dragon. Sold in Europe as Web Warp."
    },
    "Commercial/Polar Rescue_1983": {
      origin: ORIGINAL, genre: "Simulation", players: ONE,
      blurb: "First-person submarine rescue mission with a periscope and a sonar map. The most simulation-minded game on the console."
    },
    "Commercial/Pole Position_1983": {
      origin: ARCADE + "Namco", genre: "Racing", players: ONE_TWO,
      blurb: "Namco's Formula One racer rebuilt in vectors."
    },
    "3DImager/3-D Mine Storm_1983": {
      origin: IMAGER, genre: "Shoot 'em up", players: ONE,
      blurb: "The built-in game in stereoscopic 3-D, the pack-in title of the 3-D Imager headset. Needs the headset to look right."
    },
    "3DImager/3-D Narrow Escape_1983": {
      origin: IMAGER, genre: "Maze", players: ONE,
      blurb: "Race through a corridor maze in stereoscopic 3-D against the clock. Needs the 3-D Imager."
    },
    "3DImager/3-D Crazy Coaster_1983": {
      origin: IMAGER, genre: "Action", players: ONE,
      blurb: "A first-person roller-coaster ride in stereoscopic 3-D. Needs the 3-D Imager."
    },
    "Commercial/Clean Sweep_Mr Boston 1983": {
      origin: "Prototype", genre: "Maze", players: ONE_TWO,
      blurb: "Clean Sweep with Mr. Boston branding, a promotional prototype that was never sold. Extremely rare.",
      title: "Clean Sweep (Mr Boston)"
    },
    "Commercial/Mine Storm_II 1983": {
      origin: "Mail order", genre: "Shoot 'em up", players: ONE_TWO,
      blurb: "The corrected Mine Storm, posted to owners who hit the level-13 crash. Never sold in shops.",
      title: "Mine Storm II"
    }
  };
})();
