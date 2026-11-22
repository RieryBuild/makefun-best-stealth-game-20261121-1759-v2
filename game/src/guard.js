// guard.js — the dock guard: patrols, vision cones, suspicion, chase.
//
// A guard walks a rectangle of waypoints, pausing at each one to look
// around. It sees the thief only inside its vision cone with a clear line
// of sight. Being seen fills its suspicion meter; suspicion decays when
// the thief is out of sight, so a near miss is recoverable — unless the
// meter fills, when the guard gives chase.
//
// States: PATROL -> SUSPICIOUS (walk to the last-seen spot or a noise)
//        -> ALERTED (chase the thief) -> back down when the trail goes cold.

import { TILE, blocksSight, isBush, isLamp, isShadow, tileAt } from "./levels.js";

export const VISION_RANGE = 190;
export const VISION_HALF_ANGLE = 0.62; // radians, about 35 degrees each side
export const CATCH_DISTANCE = 24;

// How fast suspicion (0-100) rises per second while the thief is visible.
const SPOT_RATE = 55; // base, in the open
const SPOT_RATE_LIT = 95; // standing in a lamp glow
const SPOT_RATE_SNEAK = 26; // thief sneaking
const SPOT_RATE_CLOSE = 130; // thief very close — almost no hiding
const SUSPICION_DECAY = 20; // per second while unseen
const ALERT_DECAY = 10; // ALERTED guards calm down slower

export class Guard {
  constructor(route, level) {
    this.name = route.name;
    this.archetype = route.type || "guard"; // "guard" | "warden"
    this.route = route;
    this.level = level;
    // A warden is heavier: a wider cone and a slower patrol, but he sees
    // further and is harder to slip past up close.
    this.range = this.archetype === "warden" ? 215 : VISION_RANGE;
    this.halfAngle = this.archetype === "warden" ? 0.85 : VISION_HALF_ANGLE;
    this.speed = route.speed * (this.archetype === "warden" ? 0.8 : 1);
    this.animPhase = 0; // walk-cycle phase: flips the sprite frame
    this.moving = false;
    const [sx, sy] = route.waypoints[0];
    this.x = sx * TILE + TILE / 2;
    this.y = sy * TILE + TILE / 2;
    this.waypointIndex = 1;
    this.pause = 0.6; // brief look-around at the start
    this.facing = 0; // radians; 0 = east
    this.state = "PATROL";
    this.suspicion = 0;
    this.lastSeenX = this.x;
    this.lastSeenY = this.y;
    this.investigateX = this.x;
    this.investigateY = this.y;
    this.loseSightTimer = 0;
    this.stuckTimer = 0;
    this.lastX = this.x;
    this.lastY = this.y;
    this.sawPlayer = false;
    this.chaseSpeed = this.speed * (this.archetype === "warden" ? 2.2 : 2.6);
  }

  waypointTarget() {
    const [tx, ty] = this.route.waypoints[this.waypointIndex];
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  // Walk toward a point, sliding along container walls. Returns true when
  // the point is reached.
  moveToward(tx, ty, speed, dt) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    this.moving = dist >= 4;
    if (dist < 4) return true;
    const step = Math.min(speed * dt, dist);
    const nx = this.x + (dx / dist) * step;
    const ny = this.y + (dy / dist) * step;
    this.facing = Math.atan2(dy, dx);
    // Axis-separated movement: slide along a wall instead of sticking to it.
    if (!this.hitsWall(nx, this.y)) this.x = nx;
    if (!this.hitsWall(this.x, ny)) this.y = ny;
    return false;
  }

  hitsWall(px, py) {
    const r = 11;
    const corners = [
      [px - r, py - r], [px + r, py - r],
      [px - r, py + r], [px + r, py + r],
    ];
    for (const [cx, cy] of corners) {
      const t = tileAt(this.level, Math.floor(cx / TILE), Math.floor(cy / TILE));
      if (t === "#" || t === "~") return true;
    }
    return false;
  }

  // Straight-line sight check: sample the ray; containers and bushes block it.
  hasLineOfSight(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.range) return false;
    const steps = Math.ceil(dist / 6);
    for (let i = 1; i < steps; i++) {
      const sx = this.x + (dx * i) / steps;
      const sy = this.y + (dy * i) / steps;
      if (blocksSight(this.level, Math.floor(sx / TILE), Math.floor(sy / TILE))) return false;
    }
    return true;
  }

  // Can this guard see the thief right now? Returns a visibility factor
  // (0 = invisible, 1 = fully seen) so the caller can scale suspicion.
  visibilityOf(player) {
    // Hidden in cover: invisible unless the guard is right on top of you.
    if (player.hidden) {
      const d = Math.hypot(player.x - this.x, player.y - this.y);
      return d < 40 ? 0.25 : 0;
    }
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.range) return 0;
    let angle = Math.atan2(dy, dx) - this.facing;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    if (Math.abs(angle) > this.halfAngle) return 0;
    if (!this.hasLineOfSight(player.x, player.y)) return 0;

    // Hidden in a bush: invisible unless the guard is right on top of you.
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor(player.y / TILE);
    if (isBush(this.level, ptx, pty) && dist > 64) return 0;
    if (isBush(this.level, ptx, pty)) return 0.25;
    // Deep shadow: a still thief in the dark is easy to miss.
    if (isShadow(this.level, ptx, pty)) return 0.3;

    // Sneaking halves your profile; sprinting doubles it.
    let factor = 1;
    if (player.sneaking) factor *= 0.5;
    if (player.sprinting) factor *= 1.6;
    if (dist < 70) factor *= 1.8; // close up, hard to miss
    return Math.min(factor, 2);
  }

  // A noise at (x, y) — a thrown coin, a sprinting footstep — pulls a
  // patrolling or suspicious guard over to look.
  hearNoise(x, y, radius) {
    const dist = Math.hypot(x - this.x, y - this.y);
    if (dist > radius) return false;
    if (this.state === "ALERTED") return false;
    this.investigateX = x;
    this.investigateY = y;
    if (this.state === "PATROL") {
      this.state = "SUSPICIOUS";
      this.suspicion = Math.max(this.suspicion, 45);
    }
    return true;
  }

  update(dt, player, onSpotted) {
    const seen = this.visibilityOf(player);
    this.sawPlayer = seen > 0;
    // Walk-cycle animation: the sprite frame flips while the guard moves.
    if (this.moving) this.animPhase += dt * 6;
    // A hidden thief's trail goes cold fast: the guard loses the scent.
    if (player.hidden) this.loseSightTimer += dt;

    if (seen > 0) {
      this.lastSeenX = player.x;
      this.lastSeenY = player.y;
      this.loseSightTimer = 0;
      let rate = SPOT_RATE;
      const ptx = Math.floor(player.x / TILE);
      const pty = Math.floor(player.y / TILE);
      if (isLamp(this.level, ptx, pty)) rate = SPOT_RATE_LIT;
      if (player.sneaking) rate = Math.min(rate, SPOT_RATE_SNEAK);
      if (Math.hypot(player.x - this.x, player.y - this.y) < 70) {
        rate = Math.max(rate, SPOT_RATE_CLOSE);
      }
      this.suspicion += rate * seen * dt;
      if (this.suspicion >= 60 && this.state === "PATROL") {
        this.state = "SUSPICIOUS";
        this.investigateX = this.lastSeenX;
        this.investigateY = this.lastSeenY;
      }
      if (this.suspicion >= 100) {
        this.suspicion = 100;
        if (this.state !== "ALERTED") {
          this.state = "ALERTED";
          this.loseSightTimer = 0;
          if (onSpotted) onSpotted(this);
        }
      }
    } else {
      this.loseSightTimer += dt;
      let decay = this.state === "ALERTED" ? ALERT_DECAY : SUSPICION_DECAY;
      if (player.hidden) decay *= 2; // hiding in cover shakes a guard off
      this.suspicion = Math.max(0, this.suspicion - decay * dt);
      if (this.state === "ALERTED" && this.loseSightTimer > 3.5) {
        // Trail gone cold: drop back to searching the last-seen spot.
        this.state = "SUSPICIOUS";
        this.suspicion = 55;
        this.investigateX = this.lastSeenX;
        this.investigateY = this.lastSeenY;
      } else if (this.state === "SUSPICIOUS" && this.suspicion <= 0) {
        this.state = "PATROL";
      }
    }

    // Movement by state.
    if (this.state === "PATROL") {
      if (this.pause > 0) {
        this.pause -= dt;
        // Look around while paused: slow sweep of the lamp.
        this.facing += dt * 1.4;
      } else {
        const target = this.waypointTarget();
        if (this.moveToward(target.x, target.y, this.speed, dt)) {
          this.waypointIndex = (this.waypointIndex + 1) % this.route.waypoints.length;
          this.pause = 0.9;
        }
      }
    } else if (this.state === "SUSPICIOUS") {
      const arrived = this.moveToward(this.investigateX, this.investigateY, this.speed * 1.5, dt);
      if (arrived) {
        // Look around the spot, then give up and go back on patrol.
        this.facing += dt * 2.2;
        this.pause += dt;
        if (this.pause > 2.2) {
          this.pause = 0;
          this.state = "PATROL";
          this.suspicion = 0;
        }
      }
    } else if (this.state === "ALERTED") {
      this.moveToward(player.x, player.y, this.chaseSpeed, dt);
    }

    // Unstick: if a wall corner trapped the guard, skip to the next waypoint.
    if (Math.hypot(this.x - this.lastX, this.y - this.lastY) < 0.5 && this.state !== "PATROL") {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
    }
    if (this.stuckTimer > 1.6) {
      this.stuckTimer = 0;
      if (this.state === "SUSPICIOUS") {
        this.state = "PATROL";
        this.suspicion = 0;
      }
      this.waypointIndex = (this.waypointIndex + 1) % this.route.waypoints.length;
    }
    this.lastX = this.x;
    this.lastY = this.y;
  }

  // Distance at which the thief is caught.
  catches(player) {
    return Math.hypot(player.x - this.x, player.y - this.y) < CATCH_DISTANCE;
  }
}
