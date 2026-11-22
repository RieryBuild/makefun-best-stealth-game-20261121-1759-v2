// levels.js — the three harbour levels for Harbour Lights.
//
// Each level is a grid of tiles, 40 columns by 20 rows, tile size 32px.
// Rows are built from four 10-character chunks so every row is exactly
// 40 characters. Legend:
//   #  container / wall — blocks movement and sight
//   .  open dock floor
//   ~  water — blocks movement, sight passes over it
//   B  bush / foliage — walk through it; hides you and blocks guard sight
//   L  lamp — floor with a lamp; standing in its glow you are seen faster
//   S  deep shadow — dark floor; hide in it with E, guards barely see you
//   c  loot (a brass coin purse, +100)
//   O  the level objective (steal it to unlock the exit)
//   E  exit — green gate, opens once the objective is stolen
//   P  where the thief starts
//   1-4  guard spawn tiles (patrol routes live in `guards` below)
//
// The docks are laid out as container stacks with open lanes between them:
// horizontal lanes run the full width, vertical lanes run the full height,
// and every guard patrols a rectangle of lanes — so a patrol can be learned
// by watching it once.

export const TILE = 32;
export const COLS = 40;
export const ROWS = 20;

const WALL = "##########";

export const LEVELS = [
  {
    name: "Level 1 — The Docks",
    brief: "Steal the Harbourmaster's Compass, then slip out the green gate.",
    objectiveName: "Harbourmaster's Compass",
    parSeconds: 90,
    // Horizontal lanes: rows 1, 6, 11, 16. Vertical lanes: cols 5, 15, 25, 35.
    rows: [
      WALL + WALL + WALL + WALL,
      "#P...1..L." + ".........." + ".....c...." + "........E.",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####B####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####B####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#..S......" + ".....c...." + "L........." + ".........#",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####B####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#....2...." + ".........." + "c.......S." + "L........#",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####B####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      ".....c...." + "..L......." + "S........." + "........O.",
      "#~~~~....." + "#####.####" + "#####.####" + "#####.####",
      "#~~~~....." + "#####.####" + "#####.####" + "#####.####",
      WALL + WALL + WALL + WALL,
    ],
    guards: [
      { name: "Bram", waypoints: [[5, 1], [35, 1], [35, 6], [5, 6]], speed: 52 },
      { name: "Kett", waypoints: [[5, 11], [35, 11], [35, 16], [5, 16]], speed: 52 },
    ],
    objectiveTile: [38, 16],
    exitTile: [38, 1],
  },
  {
    name: "Level 2 — The Warehouse",
    brief: "Lift the Captain's Logbook from the warehouse office. Three guards now.",
    objectiveName: "Captain's Logbook",
    parSeconds: 120,
    // Horizontal lanes: rows 2, 7, 12, 17. Vertical lanes: cols 5, 15, 25, 35.
    rows: [
      WALL + WALL + WALL + WALL,
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#....1..L." + ".....3...." + ".....c...." + ".....E....",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####B####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#P........" + ".........." + "L.S......." + "c........#",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####B####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#....2...." + ".........." + ".....c...." + "L.......S#",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      "#####.####" + "#####.####" + "#####.####" + "#####B####",
      "#####.####" + "#####.####" + "#####.####" + "#####.~~~#",
      "#####.####" + "#####.####" + "#####.####" + "#####.~~~#",
      "#........." + "..L..c...S" + ".........." + ".....O....",
      "#####.####" + "#####.####" + "#####.####" + "#####.####",
      WALL + WALL + WALL + WALL,
    ],
    guards: [
      { name: "Dolf", waypoints: [[5, 2], [35, 2], [35, 7], [5, 7]], speed: 58 },
      { name: "Mira", waypoints: [[5, 12], [35, 12], [35, 17], [5, 17]], speed: 58 },
      { name: "Joss", type: "warden", waypoints: [[15, 2], [15, 17], [25, 17], [25, 2]], speed: 58 },
    ],
    objectiveTile: [35, 17],
    exitTile: [35, 2],
    // Wall-mounted cameras: fixed eyes that sweep a blue cone. Base angle
    // in radians (0 = east, PI/2 = south); sweep = half-amplitude. Both
    // sweep along the open horizontal lane they sit in, never into a wall.
    cameras: [
      { name: "C1", tile: [10, 2], baseAngle: 0, sweep: 0.9, speed: 0.45, phase: 0 },
      { name: "C2", tile: [20, 12], baseAngle: Math.PI, sweep: 0.8, speed: 0.45, phase: 1.7 },
    ],
  },
  {
    name: "Level 3 — Captain's Office",
    brief: "The Vault Key hangs in the captain's office. Four guards, no slack.",
    objectiveName: "The Vault Key",
    parSeconds: 150,
    // Horizontal lanes: rows 1, 6, 11, 16. Vertical lanes: cols 8, 18, 28, 38.
    rows: [
      WALL + WALL + WALL + WALL,
      "#.......1." + "..L..c...." + ".........." + ".....c...#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "########.#" + "########B#" + "########.#" + "########.#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "#.......3." + ".........." + "S.......4." + "L........#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "########.#" + "########.#" + "########B#" + "########.#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "#.......2." + ".........." + "..L......." + "S........#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "########B#" + "########.#" + "########.#" + "########.#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "########.#" + "########.#" + "########.#" + "########.#",
      "#PE......." + ".....c...." + "S........." + "...L.....#",
      "#~~~####.#" + "########.#" + "########.#" + "########.#",
      "#~~~####.#" + "########.#" + "########.#" + "........O#",
      WALL + WALL + WALL + WALL,
    ],
    guards: [
      { name: "Piet", waypoints: [[8, 1], [38, 1], [38, 6], [8, 6]], speed: 64 },
      { name: "Sanne", waypoints: [[8, 11], [38, 11], [38, 16], [8, 16]], speed: 64 },
      { name: "Tomas", type: "warden", waypoints: [[8, 6], [8, 11], [18, 11], [18, 6]], speed: 64 },
      { name: "Bram", waypoints: [[28, 6], [28, 16], [38, 16], [38, 6]], speed: 64 },
    ],
    objectiveTile: [38, 18],
    exitTile: [2, 16],
    cameras: [
      { name: "C1", tile: [18, 1], baseAngle: Math.PI / 2, sweep: 0.9, speed: 0.6, phase: 0.6 },
      { name: "C2", tile: [28, 11], baseAngle: Math.PI, sweep: 0.85, speed: 0.5, phase: 2.4 },
    ],
  },
];

// Check a level's grid at load time so a typo shows up in the console
// (and in the play-test log) instead of silently breaking the level.
export function validateLevel(level, index) {
  const problems = [];
  if (level.rows.length !== ROWS) {
    problems.push(`level ${index}: ${level.rows.length} rows, expected ${ROWS}`);
  }
  let player = 0;
  let guards = 0;
  level.rows.forEach((row, y) => {
    if (row.length !== COLS) problems.push(`level ${index} row ${y}: ${row.length} chars, expected ${COLS}`);
    for (const ch of row) {
      if (ch === "P") player++;
      if (ch >= "1" && ch <= "4") guards++;
    }
  });
  if (player !== 1) problems.push(`level ${index}: ${player} player starts`);
  if (guards !== level.guards.length) {
    problems.push(`level ${index}: ${guards} guard tiles but ${level.guards.length} guard routes`);
  }
  return problems;
}

// Tile lookup: returns the character at a tile, '#' outside the map.
export function tileAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return "#";
  return level.rows[ty][tx];
}

export function blocksMovement(level, tx, ty) {
  const t = tileAt(level, tx, ty);
  return t === "#" || t === "~";
}

export function blocksSight(level, tx, ty) {
  const t = tileAt(level, tx, ty);
  return t === "#" || t === "B";
}

export function isBush(level, tx, ty) {
  return tileAt(level, tx, ty) === "B";
}

export function isLamp(level, tx, ty) {
  return tileAt(level, tx, ty) === "L";
}

export function isShadow(level, tx, ty) {
  return tileAt(level, tx, ty) === "S";
}

// Find the single tile holding a character (P, O, E, or a digit).
export function findTile(level, ch) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (level.rows[y][x] === ch) return [x, y];
    }
  }
  return null;
}
