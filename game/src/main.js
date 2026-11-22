// main.js — Harbour Lights: the game loop, the states, and the score.
//
// States: TITLE -> PLAY <-> PAUSED -> LEVEL_COMPLETE -> PLAY (next level)
//        PLAY -> CAUGHT -> PLAY (retry) · PLAY (level 3) -> WIN.
// Score: loot +100 each, objective +500, a time bonus against the level's
// par, and a +300 GHOST bonus per level finished without any guard ever
// going ALERTED. The score, the loot and the timer live here; the guards
// live in guard.js, the thief in player.js, the drawing in render.js.

import { LEVELS, TILE, validateLevel, findTile } from "./levels.js";
import { Guard } from "./guard.js";
import { Camera } from "./camera.js";
import { Player, NOISE_RADIUS_SPRINT, NOISE_RADIUS_COIN } from "./player.js";
import { Renderer, PLAY_HEIGHT, HUD_HEIGHT } from "./render.js";
import { SoundBank } from "./audio.js";
import { Input } from "./input.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const renderer = new Renderer(canvas);
const sounds = new SoundBank();
const input = new Input(canvas);

const game = {
  state: "TITLE", // TITLE | PLAY | PAUSED | LEVEL_COMPLETE | CAUGHT | WIN
  levelIndex: 0,
  level: LEVELS[0],
  guards: [],
  cameras: [],
  player: null,
  loot: [], // { x, y, taken }
  lootTaken: 0,
  totalLootTaken: 0,
  totalLoot: 0,
  objectiveTaken: false,
  score: 0,
  ghostBonus: 0,
  everAlerted: false, // any guard ALERTED this level
  everAlertedAnyLevel: false, // any alarm on any level this run (win text)
  levelTime: 0,
  time: 0, // global clock for pulsing animations
  lastLevelBonus: 0,
  caughtBy: "",
  message: "",
  nearMiss: 0, // best almost-spotted peak this level (suspicion 40-99, escaped)
  nearMissPeak: 0, // running peak of the current close call
  nearMissUntil: 0, // game.time until the near-miss readout stays up
  alarm: { stage: "CALM", worst: 0 }, // refreshed every frame in update()
};

// Alarm gradient: one stage for the whole harbour, from the worst guard
// suspicion and any camera exposure. CALM < UNEASY < HUNTED < ALARM.
function alarmStage(game) {
  const worstGuard = Math.max(0, ...game.guards.map((g) => g.suspicion));
  const worstCam = Math.max(0, ...game.cameras.map((c) => c.exposure));
  const worst = Math.max(worstGuard, worstCam);
  const anyAlerted =
    game.guards.some((g) => g.state === "ALERTED") ||
    game.cameras.some((c) => c.state === "ALERTED");
  if (anyAlerted || worst >= 90) return { stage: "ALARM", worst };
  if (worst >= 60) return { stage: "HUNTED", worst };
  if (worst >= 30) return { stage: "UNEASY", worst };
  return { stage: "CALM", worst };
}

// A guard going ALERTED for the first time this level costs the ghost bonus.
function onGuardSpotted(guard) {
  game.everAlerted = true;
  game.everAlertedAnyLevel = true;
  sounds.alert();
  game.message = `${guard.name} spotted you!`;
  setTimeout(() => {
    if (game.message === `${guard.name} spotted you!`) game.message = "";
  }, 2600);
}

// A camera going ALERTED calls every guard to your position.
function onCameraSpotted(camera) {
  game.everAlerted = true;
  game.everAlertedAnyLevel = true;
  sounds.alert();
  game.message = `Camera ${camera.name} spotted you!`;
  for (const guard of game.guards) {
    guard.hearNoise(game.player.x, game.player.y, 9999);
  }
  setTimeout(() => {
    if (game.message === `Camera ${camera.name} spotted you!`) game.message = "";
  }, 2600);
}

function setupLevel(index) {
  const level = LEVELS[index];
  game.levelIndex = index;
  game.level = level;
  game.guards = level.guards.map((route) => new Guard(route, level));
  game.cameras = (level.cameras || []).map((spec) => new Camera(spec, level));
  const start = findTile(level, "P");
  game.player = new Player(level, start);
  game.loot = [];
  level.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "c") game.loot.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, taken: false });
    }
  });
  game.lootTaken = 0;
  game.objectiveTaken = false;
  game.everAlerted = false;
  game.nearMiss = 0;
  game.nearMissPeak = 0;
  game.nearMissUntil = 0;
  game.levelTime = 0;
  game.lastLevelBonus = 0;
  game.caughtBy = "";
  game.message = "";
}

function levelBonus() {
  const timeBonus = Math.max(0, Math.round((game.level.parSeconds - game.levelTime) * 4));
  const ghost = game.everAlerted ? 0 : 300;
  return { timeBonus, ghost };
}

function collectPickups() {
  const player = game.player;
  for (const loot of game.loot) {
    if (!loot.taken && Math.hypot(loot.x - player.x, loot.y - player.y) < 22) {
      loot.taken = true;
      game.lootTaken++;
      game.totalLootTaken++;
      game.score += 100;
      sounds.pickup();
    }
  }
  if (!game.objectiveTaken) {
    const [ox, oy] = game.level.objectiveTile;
    const cx = ox * TILE + TILE / 2;
    const cy = oy * TILE + TILE / 2;
    if (Math.hypot(cx - player.x, cy - player.y) < 26) {
      game.objectiveTaken = true;
      game.score += 500;
      sounds.pickup();
      game.message = `${game.level.objectiveName} stolen — reach the green EXIT!`;
      setTimeout(() => {
        if (game.message.startsWith(game.level.objectiveName)) game.message = "";
      }, 3200);
    }
  }
}

function checkExit() {
  if (!game.objectiveTaken) return;
  const [ex, ey] = game.level.exitTile;
  const cx = ex * TILE + TILE / 2;
  const cy = ey * TILE + TILE / 2;
  if (Math.hypot(cx - game.player.x, cy - game.player.y) < 24) {
    const { timeBonus, ghost } = levelBonus();
    game.lastLevelBonus = timeBonus + ghost;
    game.score += game.lastLevelBonus;
    game.ghostBonus += ghost;
    sounds.winChime();
    game.state = "LEVEL_COMPLETE";
  }
}

function checkCaught() {
  for (const guard of game.guards) {
    if (guard.catches(game.player)) {
      game.caughtBy = guard.name;
      game.state = "CAUGHT";
      sounds.alert();
      return;
    }
  }
}

function update(dt) {
  game.time += dt;
  if (game.state !== "PLAY") return;
  game.levelTime += dt;

  const player = game.player;

  // Hide in cover (E): tuck into a bush or deep shadow — guards and
  // cameras lose the trail. Press E again to slip out.
  if (input.hideKey) {
    if (player.hidden) {
      player.hidden = false;
    } else if (player.canHide()) {
      player.hidden = true;
      sounds.pickup();
    }
  }

  // Coin throw: click (or Q) aims at the cursor.
  if ((input.clicked || input.coinKey) && player.coins > 0) {
    if (player.throwCoin(input.mouseX, input.mouseY)) sounds.coinClink();
  }

  player.update(dt, input);

  // Sprinting footsteps carry: guards inside the noise radius investigate.
  if (player.stepLoud) {
    sounds.footstep(true);
    for (const guard of game.guards) guard.hearNoise(player.x, player.y, NOISE_RADIUS_SPRINT);
  } else if (player.moving && player.stepTimer <= 0.01) {
    sounds.footstep(false);
  }

  // A landed coin rings and pulls guards to it.
  if (player.coinLanded && player.coinLanded.ttl > 1.0) {
    for (const guard of game.guards) guard.hearNoise(player.coinLanded.x, player.coinLanded.y, NOISE_RADIUS_COIN);
  }

  let wasSuspicious = false;
  for (const guard of game.guards) {
    const before = guard.state;
    guard.update(dt, player, onGuardSpotted);
    if (before === "PATROL" && guard.state === "SUSPICIOUS") {
      wasSuspicious = true;
    }
  }
  if (wasSuspicious) sounds.suspicious();

  // Cameras sweep, track, and raise the alarm.
  for (const camera of game.cameras) camera.update(dt, player, onCameraSpotted);

  // Near-miss: a guard (or camera) almost had you — suspicion peaked
  // between 40 and 99, then drained without an alert. The peak is the
  // readout: how close the night came to ending.
  const worstNow = Math.max(
    0,
    ...game.guards.map((g) => g.suspicion),
    ...game.cameras.map((c) => c.exposure),
  );
  if (worstNow >= 40 && worstNow < 100) {
    game.nearMissPeak = Math.max(game.nearMissPeak, worstNow);
  }
  if (worstNow < 20 && game.nearMissPeak >= 40) {
    game.nearMiss = Math.round(game.nearMissPeak);
    game.nearMissUntil = game.time + 8;
    game.nearMissPeak = 0;
  }
  game.alarm = alarmStage(game);

  collectPickups();
  checkCaught();
  if (game.state === "PLAY") checkExit();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (game.state === "TITLE") {
    renderer.drawTitle(game);
    return;
  }
  renderer.drawLevel(game.level, game);
  renderer.drawHud(game);
  if (game.message) {
    ctx.fillStyle = "rgba(6, 18, 24, 0.85)";
    const w = ctx.measureText(game.message).width + 28;
    ctx.fillRect((canvas.width - w) / 2, 8, w, 30);
    ctx.fillStyle = "#ffd76a";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(game.message, canvas.width / 2, 24);
  }
  if (game.state === "PAUSED") renderer.drawPaused();
  else if (game.state === "LEVEL_COMPLETE") renderer.drawLevelComplete(game);
  else if (game.state === "CAUGHT") renderer.drawCaught(game);
  else if (game.state === "WIN") renderer.drawWin(game);
}

function advanceFromIntermission() {
  if (game.state === "LEVEL_COMPLETE") {
    if (game.levelIndex + 1 < LEVELS.length) {
      setupLevel(game.levelIndex + 1);
      game.state = "PLAY";
    } else {
      game.state = "WIN";
    }
  } else if (game.state === "CAUGHT") {
    setupLevel(game.levelIndex);
    game.state = "PLAY";
  } else if (game.state === "WIN") {
    game.score = 0;
    game.ghostBonus = 0;
    game.totalLootTaken = 0;
    game.everAlertedAnyLevel = false;
    setupLevel(0);
    game.state = "PLAY";
  }
}

input.onKeyDown = (code) => {
  sounds.ensure();
  if (code === "KeyM") {
    sounds.muted = !sounds.muted;
    return;
  }
  if (game.state === "TITLE" && code === "Enter") {
    game.score = 0;
    game.ghostBonus = 0;
    game.totalLootTaken = 0;
    game.everAlertedAnyLevel = false;
    setupLevel(0);
    game.state = "PLAY";
    return;
  }
  if (game.state === "PLAY" && (code === "Escape" || code === "KeyP")) {
    game.state = "PAUSED";
    return;
  }
  if (game.state === "PAUSED" && (code === "Escape" || code === "KeyP")) {
    game.state = "PLAY";
    return;
  }
  if ((game.state === "LEVEL_COMPLETE" || game.state === "CAUGHT" || game.state === "WIN") && code === "Enter") {
    advanceFromIntermission();
    return;
  }
  if (game.state === "CAUGHT" && code === "KeyR") {
    game.score = 0;
    game.ghostBonus = 0;
    game.totalLootTaken = 0;
    game.everAlertedAnyLevel = false;
    setupLevel(0);
    game.state = "PLAY";
  }
};

// Test hooks for the play-test driver (not part of play): they let a script
// read the live state and steer the thief, so the game can be driven
// end-to-end in headless Chrome. The game itself never calls them.
window.__harbour = {
  game,
  LEVELS,
  startLevel(index) {
    setupLevel(index);
    game.state = "PLAY";
  },
  teleport(x, y) {
    game.player.x = x;
    game.player.y = y;
  },
  setSuspicion(value) {
    for (const guard of game.guards) guard.suspicion = value;
  },
  forceAlert() {
    for (const guard of game.guards) {
      guard.state = "ALERTED";
      guard.suspicion = 100;
      guard.lastSeenX = game.player.x;
      guard.lastSeenY = game.player.y;
    }
    game.everAlerted = true;
  },
  giveObjective() {
    game.objectiveTaken = true;
  },
  alertCamera() {
    // Test hook: force the first camera to full exposure (ALERTED) so the
    // alarm frame can be captured even if a guard catches the thief first.
    if (game.cameras[0]) {
      game.cameras[0].exposure = 100;
      game.cameras[0].state = "ALERTED";
      game.everAlerted = true;
    }
  },
  state() {
    return {
      state: game.state,
      level: game.levelIndex,
      score: game.score,
      lootTaken: game.lootTaken,
      objectiveTaken: game.objectiveTaken,
      hidden: game.player.hidden,
      canHide: game.player.canHide(),
      nearMiss: game.nearMiss,
      alarm: alarmStage(game),
      player: { x: game.player.x, y: game.player.y, coins: game.player.coins },
      guards: game.guards.map((g) => ({
        name: g.name, archetype: g.archetype, state: g.state, suspicion: Math.round(g.suspicion), x: Math.round(g.x), y: Math.round(g.y),
      })),
      cameras: game.cameras.map((c) => ({
        name: c.name, state: c.state, exposure: Math.round(c.exposure), facing: +c.facing.toFixed(2), x: Math.round(c.x), y: Math.round(c.y),
      })),
    };
  },
};

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  draw();
  input.endFrame();
  requestAnimationFrame(frame);
}

async function boot() {
  const problems = [];
  LEVELS.forEach((level, i) => problems.push(...validateLevel(level, i)));
  if (problems.length) {
    console.error("HARBOUR LIGHTS level problems:", problems);
  }
  game.totalLoot = LEVELS.reduce((sum, level) => {
    let n = 0;
    level.rows.forEach((row) => {
      for (const ch of row) if (ch === "c") n++;
    });
    return sum + n;
  }, 0);
  setupLevel(0);
  try {
    await renderer.loadAssets();
  } catch (err) {
    console.error("HARBOUR LIGHTS asset load failed:", err);
  }
  requestAnimationFrame(frame);
}

boot();
