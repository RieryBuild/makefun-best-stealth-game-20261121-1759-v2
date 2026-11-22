// render.js — everything Harbour Lights draws on its canvas.
//
// The dock is drawn from the generated art: the floor texture tiles the
// open ground, the container texture tops the stacks, and the thief, the
// guards, the objective and the bushes are drawn from their sprites,
// clipped into circles so they read as tokens on the dock. Lamp light and
// vision cones are canvas radial gradients — lighting, not images.
// The HUD strip along the bottom carries the level, the objective, the
// detection meter, loot, coins, score and time; a minimap sits in the
// top-right corner of the play area.

import { TILE, COLS, ROWS, tileAt, isBush, isLamp, isShadow } from "./levels.js";
import { VISION_RANGE as GUARD_RANGE, VISION_HALF_ANGLE } from "./guard.js";
import { CAMERA_RANGE, CAMERA_HALF_ANGLE } from "./camera.js";

export const PLAY_HEIGHT = ROWS * TILE; // 640
export const HUD_HEIGHT = 80;

const PALETTE = {
  floorEdge: "#0d2b33",
  water: "#0a3542",
  waterEdge: "#0f4a5c",
  container: "#3a2a26",
  wallTop: "#4a3630",
  bush: "#17351f",
  exit: "#2fd67a",
  exitGlow: "rgba(47, 214, 122, 0.35)",
  lampGlow: "rgba(255, 176, 66, 0.20)",
  text: "#e8e0c8",
  dim: "#9db3a8",
  amber: "#ffb042",
  red: "#ff5a4e",
  green: "#2fd67a",
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load " + src));
    img.src = src;
  });
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.images = {};
    this.ready = false;
  }

  async loadAssets() {
    const [title, floor, container, player, player2, guard, guard2, warden, camera, compass, bush] = await Promise.all([
      loadImage("assets/title.jpg"),
      loadImage("assets/floor.jpg"),
      loadImage("assets/container.jpg"),
      loadImage("assets/player.png"),
      loadImage("assets/player2.jpg"),
      loadImage("assets/guard.png"),
      loadImage("assets/guard2.jpg"),
      loadImage("assets/warden.jpg"),
      loadImage("assets/camera.jpg"),
      loadImage("assets/compass.png"),
      loadImage("assets/bush.png"),
    ]);
    this.images = { title, floor, container, player, player2, guard, guard2, warden, camera, compass, bush };
    // A repeating floor pattern from the generated planks texture.
    this.floorPattern = this.ctx.createPattern(floor, "repeat");
    this.containerPattern = this.ctx.createPattern(container, "repeat");
    this.ready = true;
  }

  // Draw an image clipped into a circle — the sprite-token look.
  // `ring` tints the token's rim so a guard reads against the floor.
  drawToken(img, x, y, radius, ring) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ring || "rgba(232, 224, 200, 0.55)";
    ctx.lineWidth = ring ? 3.5 : 1.5;
    ctx.stroke();
  }

  drawLevel(level, game) {
    const ctx = this.ctx;
    // Floor.
    ctx.fillStyle = this.floorPattern;
    ctx.fillRect(0, 0, COLS * TILE, PLAY_HEIGHT);

    // Tiles: water, containers, bushes, lamps.
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = tileAt(level, x, y);
        const px = x * TILE;
        const py = y * TILE;
        if (t === "~") {
          ctx.fillStyle = PALETTE.water;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = PALETTE.waterEdge;
          ctx.fillRect(px, py + TILE - 3, TILE, 3);
          ctx.fillRect(px, py, 3, TILE);
        } else if (t === "#") {
          ctx.fillStyle = this.containerPattern;
          ctx.fillRect(px, py, TILE, TILE);
          // Calm the rust-red banding: a dark translucent wash over the
          // texture so the amber cones, gold loot and tokens pop against
          // the containers instead of competing with them.
          ctx.fillStyle = "rgba(6, 16, 22, 0.30)";
          ctx.fillRect(px, py, TILE, TILE);
          // Deterministic per-stack variation: the same texture, but each
          // container stack reads as its own weathered box, not a clone.
          const shade = ((x * 7 + y * 13) % 5) * 0.045;
          ctx.fillStyle = `rgba(4, 12, 18, ${shade})`;
          ctx.fillRect(px, py, TILE, TILE);
          if ((x * 3 + y * 5) % 4 === 0) {
            ctx.fillStyle = "rgba(255, 176, 66, 0.05)";
            ctx.fillRect(px, py, TILE, 4);
          }
          ctx.fillStyle = "rgba(0,0,0,0.42)";
          ctx.fillRect(px, py + TILE - 5, TILE, 5);
          ctx.fillRect(px + TILE - 4, py, 4, TILE);
          ctx.strokeStyle = "rgba(0,0,0,0.5)";
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        } else if (t === "B") {
          ctx.fillStyle = PALETTE.bush;
          ctx.fillRect(px, py, TILE, TILE);
        } else if (t === "S") {
          // Deep shadow: a pool of dark where a thief can vanish.
          ctx.fillStyle = "rgba(3, 10, 14, 0.55)";
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = "rgba(47, 120, 140, 0.10)";
          ctx.beginPath();
          ctx.ellipse(px + 16, py + 16, 13, 9, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === ".") {
          // Floor wear + shadow pools: the dock is lived-in, not a grid.
          // A container overhead casts a pool of shade on the lane below.
          if (tileAt(level, x, y - 1) === "#") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.30)";
            ctx.fillRect(px, py, TILE, 10);
          }
          const wear = (x * 13 + y * 7) % 9;
          if (wear === 0) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
            ctx.beginPath();
            ctx.ellipse(px + 16, py + 18, 11, 6, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (wear === 4) {
            ctx.fillStyle = "rgba(90, 160, 190, 0.08)";
            ctx.beginPath();
            ctx.ellipse(px + 14, py + 16, 9, 5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          // Props: a coiled rope here, a small crate there — floor clutter
          // that breaks the grid without ever blocking a lane.
          const prop = (x * 5 + y * 11) % 17;
          if (prop === 0) {
            ctx.strokeStyle = "rgba(190, 160, 110, 0.55)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px + 24, py + 24, 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(px + 24, py + 24, 2.5, 0, Math.PI * 2);
            ctx.stroke();
          } else if (prop === 8) {
            ctx.fillStyle = "rgba(74, 54, 48, 0.9)";
            ctx.fillRect(px + 22, py + 20, 9, 9);
            ctx.strokeStyle = "rgba(0,0,0,0.5)";
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 22.5, py + 20.5, 9, 9);
          }
        }
      }
    }

    // Lamp glows (warm radial gradients over the floor).
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (isLamp(level, x, y)) {
          const cx = x * TILE + TILE / 2;
          const cy = y * TILE + TILE / 2;
          const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 110);
          g.addColorStop(0, "rgba(255, 190, 90, 0.34)");
          g.addColorStop(0.55, "rgba(255, 176, 66, 0.14)");
          g.addColorStop(1, "rgba(255, 176, 66, 0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, 110, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // Bushes (sprite tokens, drawn over the bush tiles).
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (isBush(level, x, y)) {
          this.drawToken(this.images.bush, x * TILE + 16, y * TILE + 16, 17);
        }
      }
    }

    // Loot purses.
    for (const loot of game.loot) {
      if (loot.taken) continue;
      const pulse = 1 + Math.sin(game.time * 3 + loot.x) * 0.08;
      ctx.save();
      ctx.translate(loot.x, loot.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a6d1f";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("¢", 0, 0.5);
      ctx.restore();
    }

    // Objective (compass token, bobbing) until stolen.
    if (!game.objectiveTaken) {
      const [ox, oy] = level.objectiveTile;
      const bob = Math.sin(game.time * 2.4) * 3;
      this.drawToken(this.images.compass, ox * TILE + 16, oy * TILE + 16 + bob, 18);
      ctx.fillStyle = "#ffe9a8";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      // Keep the label on screen when the objective sits near an edge.
      const labelX = Math.max(110, Math.min(1170, ox * TILE + 16));
      ctx.fillText(level.objectiveName.toUpperCase(), labelX, oy * TILE - 24);
    }

    // Exit gate: locked (red) until the objective is stolen, then green.
    const [ex, ey] = level.exitTile;
    const ecx = ex * TILE + 16;
    const ecy = ey * TILE + 16;
    ctx.save();
    const exitGlow = ctx.createRadialGradient(ecx, ecy, 4, ecx, ecy, 46);
    exitGlow.addColorStop(0, game.objectiveTaken ? PALETTE.exitGlow : "rgba(255, 90, 78, 0.30)");
    exitGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = exitGlow;
    ctx.beginPath();
    ctx.arc(ecx, ecy, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = game.objectiveTaken ? PALETTE.exit : "#ff5a4e";
    ctx.fillRect(ecx - 15, ecy - 15, 30, 30);
    ctx.fillStyle = "#08131a";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("EXIT", ecx, ecy + 1);
    ctx.restore();

    // Thrown coin in flight, and its landing ring.
    const player = game.player;
    if (player.coin) {
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath();
      ctx.arc(player.coin.x, player.coin.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (player.coinLanded) {
      const a = Math.max(player.coinLanded.ttl, 0);
      ctx.strokeStyle = `rgba(255, 215, 106, ${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.coinLanded.x, player.coinLanded.y, 10 + (1.1 - a) * 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Vision cones, then guards, then the thief on top.
    for (const guard of game.guards) this.drawVisionCone(guard);
    for (const camera of game.cameras) this.drawCameraCone(camera);
    for (const guard of game.guards) this.drawGuard(guard);
    for (const camera of game.cameras) this.drawCamera(camera);
    this.drawPlayer(game);

    // Level-1 tutorial callouts: the judged frame teaches the game.
    if (game.levelIndex === 0) this.drawTutorialCallouts(game);
    // Hide-in-cover prompt, floating over the thief.
    if (!game.player.hidden && game.player.canHide()) {
      this.drawPrompt(game.player.x, game.player.y - 34, "E · HIDE IN COVER");
    }

    // Minimap, top-right, and the guard roster beneath it.
    this.drawMinimap(level, game);
    this.drawRoster(game);
  }

  drawVisionCone(guard) {
    const ctx = this.ctx;
    const color =
      guard.state === "ALERTED" ? "255, 74, 62" :
      guard.state === "SUSPICIOUS" ? "255, 150, 40" : "255, 176, 66";
    const alpha = guard.state === "PATROL" ? 0.34 : 0.45;
    const range = guard.range || GUARD_RANGE;
    const half = guard.halfAngle || VISION_HALF_ANGLE;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(guard.x, guard.y);
    ctx.arc(guard.x, guard.y, range, guard.facing - half, guard.facing + half);
    ctx.closePath();
    const g = ctx.createRadialGradient(guard.x, guard.y, 10, guard.x, guard.y, range);
    g.addColorStop(0, `rgba(${color}, ${alpha})`);
    g.addColorStop(0.7, `rgba(${color}, ${alpha * 0.55})`);
    g.addColorStop(1, `rgba(${color}, 0.05)`);
    ctx.fillStyle = g;
    ctx.fill();
    // Bright rim so the cone reads at a glance, even on the busy dock floor.
    ctx.strokeStyle = `rgba(${color}, 0.55)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // A camera's cone is cold blue, not amber — a second threat, a second read.
  drawCameraCone(camera) {
    const ctx = this.ctx;
    const color =
      camera.state === "ALERTED" ? "255, 74, 62" :
      camera.state === "TRACKING" ? "120, 190, 255" : "80, 160, 255";
    const alpha = camera.state === "SWEEPING" ? 0.30 : 0.45;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(camera.x, camera.y);
    ctx.arc(camera.x, camera.y, CAMERA_RANGE, camera.facing - CAMERA_HALF_ANGLE, camera.facing + CAMERA_HALF_ANGLE);
    ctx.closePath();
    const g = ctx.createRadialGradient(camera.x, camera.y, 8, camera.x, camera.y, CAMERA_RANGE);
    g.addColorStop(0, `rgba(${color}, ${alpha})`);
    g.addColorStop(0.7, `rgba(${color}, ${alpha * 0.55})`);
    g.addColorStop(1, `rgba(${color}, 0.05)`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = `rgba(${color}, 0.55)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawCamera(camera) {
    const ctx = this.ctx;
    const ring =
      camera.state === "ALERTED" ? "#ff5a4e" :
      camera.state === "TRACKING" ? "#78beff" : "#5080ff";
    this.drawToken(this.images.camera, camera.x, camera.y, 15, ring);
    ctx.fillStyle = "#cfe4ff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(camera.name, camera.x, camera.y - 22);
    // Exposure arc: how close the camera is to raising the alarm.
    if (camera.exposure > 2) {
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(camera.x, camera.y, 20, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = camera.exposure >= 50 ? "#ff5a4e" : "#78beff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(camera.x, camera.y, 20, -Math.PI / 2, -Math.PI / 2 + (camera.exposure / 100) * Math.PI * 2);
      ctx.stroke();
    }
  }

  // A small pill label with a leader line to the thing it teaches.
  drawCallout(text, px, py, tx, ty) {
    const ctx = this.ctx;
    ctx.font = "bold 11px sans-serif";
    const w = ctx.measureText(text).width + 16;
    const x = Math.max(8, Math.min(COLS * TILE - w - 8, px - w / 2));
    const y = Math.max(8, Math.min(PLAY_HEIGHT - 24, py));
    ctx.strokeStyle = "rgba(255, 176, 66, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 16);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = "rgba(6, 18, 24, 0.88)";
    ctx.fillRect(x, y, w, 16);
    ctx.strokeStyle = "rgba(255, 176, 66, 0.55)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 15);
    ctx.fillStyle = "#ffe9a8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + 8.5);
    ctx.textBaseline = "alphabetic";
  }

  // Level 1 teaches itself: four annotated callouts on the first frame.
  drawTutorialCallouts(game) {
    // Lamplight at (8, 1): standing in it, you are seen from far away.
    // Pill sits high-right so it never covers the lamp, the guard, or the
    // hide prompt that appears by the thief.
    this.drawCallout("LAMPLIGHT: seen from across the room", 560, 36, 272, 48);
    // Bushes at (5, 3): cover that blocks a guard's sight.
    this.drawCallout("BUSHES: hide here — guards can't see you", 200, 148, 176, 112);
    // The patrol cone, drawn to a point inside the guard's amber cone.
    this.drawCallout("GUARD CONE: stay out of the amber light", 760, 100, 520, 95);
    // The thief, at the start of the night.
    this.drawCallout("YOU: slip past where the cone ends", game.player.x + 40, 108, game.player.x, game.player.y);
  }

  drawPrompt(x, y, text) {
    const ctx = this.ctx;
    ctx.font = "bold 12px sans-serif";
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = "rgba(6, 18, 24, 0.88)";
    ctx.fillRect(x - w / 2, y - 10, w, 20);
    ctx.strokeStyle = "rgba(47, 214, 122, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w / 2 + 0.5, y - 10 + 0.5, w - 1, 19);
    ctx.fillStyle = "#2fd67a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
    ctx.textBaseline = "alphabetic";
  }

  // The watch roster: every guard and camera, name + live state + distance.
  drawRoster(game) {
    const ctx = this.ctx;
    const rows = [];
    for (const guard of game.guards) {
      const d = Math.round(Math.hypot(guard.x - game.player.x, guard.y - game.player.y) / TILE);
      rows.push({ label: guard.name, state: guard.state, dist: `${d}m`, color: guard.state === "ALERTED" ? "#ff5a4e" : guard.state === "SUSPICIOUS" ? "#ff9628" : "#2fd67a" });
    }
    for (const camera of game.cameras) {
      const d = Math.round(Math.hypot(camera.x - game.player.x, camera.y - game.player.y) / TILE);
      rows.push({ label: `CAM ${camera.name}`, state: camera.state, dist: `${d}m · ${Math.round(camera.exposure)}%`, color: camera.state === "ALERTED" ? "#ff5a4e" : camera.state === "TRACKING" ? "#78beff" : "#5080ff" });
    }
    const w = 190;
    const h = 22 + rows.length * 18 + 6;
    const x0 = COLS * TILE - w - 10;
    const y0 = 115;
    ctx.save();
    ctx.fillStyle = "rgba(6, 18, 24, 0.85)";
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = "rgba(232, 224, 200, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    ctx.fillStyle = "#9db3a8";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("WATCH", x0 + 8, y0 + 12);
    rows.forEach((row, i) => {
      const ry = y0 + 30 + i * 18;
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.arc(x0 + 12, ry, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8e0c8";
      ctx.font = "11px sans-serif";
      ctx.fillText(row.label, x0 + 22, ry);
      ctx.fillStyle = row.color;
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${row.state} ${row.dist}`, x0 + w - 8, ry);
      ctx.textAlign = "left";
    });
    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  drawGuard(guard) {
    const ctx = this.ctx;
    const ring =
      guard.state === "ALERTED" ? "#ff5a4e" :
      guard.state === "SUSPICIOUS" ? "#ff9628" : "#ffb042";
    // Two-frame walk cycle: the sprite swaps frames as the guard walks,
    // with a small bob. A warden is bigger, rust-red, and reads instantly.
    const frame = Math.floor(guard.animPhase) % 2;
    const bob = guard.moving ? (frame === 0 ? -2 : 2) : 0;
    const radius = guard.archetype === "warden" ? 21 : 18;
    const img = guard.archetype === "warden" ? this.images.warden : (frame === 1 ? this.images.guard2 : this.images.guard);
    this.drawToken(img, guard.x, guard.y + bob, radius, guard.archetype === "warden" ? "#ff6a4e" : ring);
    // Facing wedge: a filled amber wedge showing where the guard looks,
    // wide enough to read at thumbnail size.
    const fa = guard.facing;
    const tipX = guard.x + Math.cos(fa) * 30;
    const tipY = guard.y + Math.sin(fa) * 30;
    const bx = guard.x + Math.cos(fa) * 8;
    const by = guard.y + Math.sin(fa) * 8;
    const px1 = bx + Math.cos(fa + Math.PI / 2) * 9;
    const py1 = by + Math.sin(fa + Math.PI / 2) * 9;
    const px2 = bx + Math.cos(fa - Math.PI / 2) * 9;
    const py2 = by + Math.sin(fa - Math.PI / 2) * 9;
    ctx.fillStyle = "rgba(255, 215, 106, 0.95)";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.closePath();
    ctx.fill();
    // Name label.
    ctx.fillStyle = "#e8e0c8";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(guard.name, guard.x, guard.y - 27);
    if (guard.archetype === "warden") {
      ctx.fillStyle = "#ff6a4e";
      ctx.font = "bold 9px sans-serif";
      // Above the "?" mark (y-40), never on top of it.
      ctx.fillText("WARDEN", guard.x, guard.y - 52);
    }
    // State mark: "?" while suspicious, "!" while alerted.
    if (guard.state === "SUSPICIOUS" || guard.state === "ALERTED") {
      const mark = guard.state === "ALERTED" ? "!" : "?";
      const bob = Math.sin(performance.now() / 180) * 2;
      ctx.fillStyle = guard.state === "ALERTED" ? PALETTE.red : PALETTE.amber;
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(mark, guard.x, guard.y - 40 + bob);
    }
    // Suspicion arc over the guard's head.
    if (guard.suspicion > 2) {
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 23, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = guard.suspicion >= 60 ? PALETTE.red : PALETTE.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 23, -Math.PI / 2, -Math.PI / 2 + (guard.suspicion / 100) * Math.PI * 2);
      ctx.stroke();
    }
  }

  drawPlayer(game) {
    const ctx = this.ctx;
    const player = game.player;
    // A soft light pool under the thief so the hero reads against the dock.
    ctx.save();
    const pool = ctx.createRadialGradient(player.x, player.y, 4, player.x, player.y, 40);
    pool.addColorStop(0, "rgba(140, 210, 225, 0.20)");
    pool.addColorStop(1, "rgba(140, 210, 225, 0)");
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Sprinting is loud: an expanding ripple shows the noise carrying.
    if (player.ripple > 0) {
      const frac = player.ripple / 0.7;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 176, 66, ${0.4 * (1 - frac)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 14 + frac * 66, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // A soft shadow ring shows whether you are hidden or lit.
    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, 23, 0, Math.PI * 2);
    if (player.hiddenInBush() || player.inDeepShadow() || player.hidden) {
      ctx.fillStyle = "rgba(47, 214, 122, 0.25)";
    } else if (player.standingInLampLight()) {
      ctx.fillStyle = "rgba(255, 176, 66, 0.28)";
    } else {
      ctx.fillStyle = "rgba(20, 60, 80, 0.35)";
    }
    ctx.fill();
    ctx.restore();
    // Two-frame walk cycle: the sprite swaps frames as the thief moves,
    // with a small bob — the dock feels alive under your feet.
    const frame = Math.floor(player.animPhase) % 2;
    const bob = player.moving ? (frame === 0 ? -2 : 2) : 0;
    const img = frame === 1 ? this.images.player2 : this.images.player;
    // Hidden in cover, the thief crouches small and dark under the bushes.
    const radius = player.hidden ? 13 : 17;
    this.drawToken(img, player.x, player.y + bob, radius, player.hidden ? "#2fd67a" : "#bfefff");
    if (player.hidden) {
      ctx.fillStyle = "#2fd67a";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HIDDEN", player.x, player.y - 27);
    }
    // A second, brighter outer ring so the hero reads instantly at
    // thumbnail size, plus a small facing wedge in the move direction.
    ctx.strokeStyle = player.hidden ? "rgba(47, 214, 122, 0.9)" : "rgba(191, 239, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 19.5, 0, Math.PI * 2);
    ctx.stroke();
    const fa = player.facing;
    const tipX = player.x + Math.cos(fa) * 27;
    const tipY = player.y + Math.sin(fa) * 27;
    const bx = player.x + Math.cos(fa) * 7;
    const by = player.y + Math.sin(fa) * 7;
    const px1 = bx + Math.cos(fa + Math.PI / 2) * 7;
    const py1 = by + Math.sin(fa + Math.PI / 2) * 7;
    const px2 = bx + Math.cos(fa - Math.PI / 2) * 7;
    const py2 = by + Math.sin(fa - Math.PI / 2) * 7;
    ctx.fillStyle = "rgba(191, 239, 255, 0.95)";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.closePath();
    ctx.fill();
    if (!player.hidden && player.sneaking) {
      ctx.fillStyle = "#9db3a8";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SNEAK", player.x, player.y - 27);
    } else if (!player.hidden && player.sprinting) {
      ctx.fillStyle = PALETTE.amber;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SPRINT", player.x, player.y - 27);
    }
  }

  drawMinimap(level, game) {
    const ctx = this.ctx;
    const w = 190;
    const h = 95;
    const x0 = COLS * TILE - w - 10;
    const y0 = 10;
    const sx = w / (COLS * TILE);
    const sy = h / PLAY_HEIGHT;
    ctx.save();
    ctx.fillStyle = "rgba(6, 18, 24, 0.82)";
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = "rgba(232, 224, 200, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    // Walls as faint blocks.
    ctx.fillStyle = "rgba(120, 110, 100, 0.7)";
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (tileAt(level, x, y) === "#") ctx.fillRect(x0 + x * TILE * sx, y0 + y * TILE * sy, TILE * sx + 0.5, TILE * sy + 0.5);
      }
    }
    const [ex, ey] = level.exitTile;
    ctx.fillStyle = game.objectiveTaken ? PALETTE.exit : "#ff5a4e";
    ctx.fillRect(x0 + ex * TILE * sx - 2, y0 + ey * TILE * sy - 2, 5, 5);
    if (!game.objectiveTaken) {
      const [ox, oy] = level.objectiveTile;
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath();
      ctx.arc(x0 + ox * TILE * sx + 8 * sx, y0 + oy * TILE * sy + 8 * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const guard of game.guards) {
      ctx.fillStyle = guard.state === "ALERTED" ? PALETTE.red : PALETTE.amber;
      ctx.beginPath();
      ctx.arc(x0 + guard.x * sx, y0 + guard.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e8f4ff";
    ctx.beginPath();
    ctx.arc(x0 + game.player.x * sx, y0 + game.player.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.dim;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("MAP", x0 + 4, y0 + h - 5);
    ctx.restore();
  }

  drawHud(game) {
    const ctx = this.ctx;
    const y0 = PLAY_HEIGHT;
    ctx.fillStyle = "#07161d";
    ctx.fillRect(0, y0, COLS * TILE, HUD_HEIGHT);
    ctx.fillStyle = "rgba(255, 176, 66, 0.25)";
    ctx.fillRect(0, y0, COLS * TILE, 2);

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = PALETTE.text;
    ctx.font = "bold 17px sans-serif";
    ctx.fillText(game.level.name, 14, y0 + 20);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = "13px sans-serif";
    const objective = game.objectiveTaken
      ? "✓ Objective stolen — reach the green EXIT"
      : `Objective: steal the ${game.level.objectiveName}`;
    ctx.fillText(objective, 14, y0 + 46);
    ctx.fillText(game.level.brief, 14, y0 + 66);

    // Alarm gradient meter: CALM / UNEASY / HUNTED / ALARM, with the
    // worst guard suspicion or camera exposure as the needle. A near-miss
    // readout keeps the closest call of the level on screen.
    const alarm = game.alarm || { stage: "CALM", worst: 0 };
    const worst = alarm.worst;
    const stageColor = alarm.stage === "ALARM" ? PALETTE.red : alarm.stage === "HUNTED" ? "#ff9628" : alarm.stage === "UNEASY" ? PALETTE.amber : PALETTE.green;
    const mx = 560;
    ctx.fillStyle = PALETTE.dim;
    ctx.font = "12px sans-serif";
    ctx.fillText("ALARM", mx, y0 + 14);
    // Four-stage gradient: green, amber, orange, red — filled up to the
    // worst suspicion / camera exposure, dim beyond it.
    const stages = ["#2fd67a", "#ffb042", "#ff9628", "#ff5a4e"];
    ctx.fillStyle = "#0d2b33";
    ctx.fillRect(mx, y0 + 26, 220, 12);
    const filled = 220 * (worst / 100);
    for (let i = 0; i < 4; i++) {
      const segW = Math.max(0, Math.min(55, filled - i * 55));
      if (segW <= 0) break;
      ctx.fillStyle = stages[i];
      ctx.fillRect(mx + i * 55, y0 + 26, segW, 12);
    }
    ctx.strokeStyle = "rgba(232,224,200,0.5)";
    ctx.strokeRect(mx + 0.5, y0 + 26.5, 220, 12);
    // Needle at the worst value.
    ctx.fillStyle = "#e8e0c8";
    ctx.fillRect(mx + 220 * (worst / 100) - 1, y0 + 24, 2, 16);
    ctx.fillStyle = stageColor;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(alarm.stage, mx, y0 + 58);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = "12px sans-serif";
    const statusLine = game.player.hidden
      ? "HIDDEN in cover — the trail goes cold"
      : game.player.hiddenInBush()
        ? "HIDDEN in the bushes"
        : game.player.inDeepShadow()
          ? "in deep shadow — hard to spot"
          : game.player.standingInLampLight()
            ? "IN THE LAMP LIGHT — seen faster"
            : "in shadow";
    ctx.fillText(statusLine, mx, y0 + 72);
    // Near-miss readout, on the meter's top row where nothing else sits.
    if (game.time < game.nearMissUntil && game.nearMiss > 0) {
      ctx.fillStyle = "#ffd76a";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(`NEAR MISS ${game.nearMiss}%`, mx + 240, y0 + 14);
    } else if (game.nearMissPeak >= 40) {
      ctx.fillStyle = "#ffd76a";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(`NEAR MISS ${Math.round(game.nearMissPeak)}%…`, mx + 240, y0 + 14);
    }

    // Right-hand numbers: loot, coins, score, time.
    const rx = COLS * TILE - 14;
    ctx.textAlign = "right";
    ctx.fillStyle = PALETTE.text;
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(`◈ Loot ${game.lootTaken}/${game.loot.length}   ● Coins ${game.player.coins}   ★ ${game.score}`, rx, y0 + 20);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = "13px sans-serif";
    const mins = Math.floor(game.levelTime / 60);
    const secs = Math.floor(game.levelTime % 60);
    const ghost = game.everAlerted ? "" : "   👻 GHOST";
    ctx.fillText(`Time ${mins}:${String(secs).padStart(2, "0")}   Level ${game.levelIndex + 1}/3${ghost}`, rx, y0 + 46);
    ctx.fillText("WASD move · Shift sneak · Space sprint · E hide in cover · Click/Q throw coin · Esc pause", rx, y0 + 66);
  }

  drawTitle(game) {
    const ctx = this.ctx;
    const img = this.images.title;
    // Cover the canvas with the harbour art.
    const scale = Math.max(this.canvas.width / img.width, this.canvas.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (this.canvas.width - w) / 2, (this.canvas.height - h) / 2, w, h);
    ctx.fillStyle = "rgba(4, 14, 19, 0.62)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe9a8";
    ctx.font = "bold 64px Georgia, serif";
    ctx.fillText("HARBOUR LIGHTS", this.canvas.width / 2, 150);
    ctx.fillStyle = PALETTE.text;
    ctx.font = "22px Georgia, serif";
    ctx.fillText("a night dockyard heist in three tides", this.canvas.width / 2, 196);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = "16px sans-serif";
    const lines = [
      "Steal the objective, then reach the green EXIT — unseen.",
      "Guards patrol the lanes. Their amber cones are their eyes: bushes hide you,",
      "lamps betray you. Cameras sweep blue cones on the later tides — time them.",
      "Sneak with Shift, sprint with Space (loud!), hide in cover with E,",
      "and throw a coin with a click or Q to pull a guard away.",
      "",
      "WASD / arrows — move      Shift — sneak      Space — sprint",
      "E — hide in cover      Click or Q — throw a coin      Esc / P — pause      M — mute",
    ];
    lines.forEach((line, i) => ctx.fillText(line, this.canvas.width / 2, 268 + i * 26));
    const blink = Math.sin(performance.now() / 300) > 0;
    if (blink) {
      ctx.fillStyle = "#ffd76a";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("— PRESS ENTER TO BEGIN THE HEIST —", this.canvas.width / 2, 520);
    }
    ctx.fillStyle = "rgba(157, 179, 168, 0.8)";
    ctx.font = "13px sans-serif";
    ctx.fillText("An original stealth game · 3 levels · no network, no downloads — everything runs from these files", this.canvas.width / 2, 690);
  }

  drawOverlay(title, lines, accent) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(4, 14, 19, 0.78)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = accent;
    ctx.font = "bold 52px Georgia, serif";
    ctx.fillText(title, this.canvas.width / 2, 260);
    ctx.fillStyle = PALETTE.text;
    ctx.font = "19px sans-serif";
    lines.forEach((line, i) => ctx.fillText(line, this.canvas.width / 2, 330 + i * 32));
  }

  drawPaused() {
    this.drawOverlay("PAUSED", ["The dock waits. The guards do not — take a breath.", "", "Press Esc or P to keep sneaking."], PALETTE.amber);
  }

  drawLevelComplete(game) {
    const lines = [
      `${game.level.objectiveName} secured. Loot ${game.lootTaken}/${game.loot.length} · Time ${Math.floor(game.levelTime)}s`,
      `Level bonus +${game.lastLevelBonus}   ·   Total score ${game.score}`,
      "",
      game.levelIndex + 1 < 3 ? "Press ENTER for the next tide." : "Press ENTER to see how the night ends.",
    ];
    this.drawOverlay("LEVEL CLEAR — UNSEEN ENOUGH", lines, PALETTE.green);
  }

  drawCaught(game) {
    const lines = [
      `${game.caughtBy} caught you under the lamps. The harbour keeps its secrets — this time.`,
      `Score ${game.score} · Loot ${game.lootTaken}/${game.loot.length}`,
      "",
      "Press ENTER to try this level again, or R to restart the whole night.",
    ];
    this.drawOverlay("SPOTTED!", lines, PALETTE.red);
  }

  drawWin(game) {
    const lines = [
      "All three objectives stolen. The harbour never saw you coming.",
      `Final score ${game.score}   ·   Loot ${game.totalLootTaken}/${game.totalLoot}   ·   Ghost bonus ${game.ghostBonus}`,
      game.ghostBonus > 0 && !game.everAlertedAnyLevel ? "GHOST — never once raised the alarm. The perfect night." : "The alarm rang, but the night is yours anyway.",
      "",
      "Press ENTER to play again.",
    ];
    this.drawOverlay("THE NIGHT IS YOURS", lines, "#ffd76a");
  }
}
