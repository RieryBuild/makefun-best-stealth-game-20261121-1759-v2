// camera.js — the wall-mounted security camera: a second threat type.
//
// A camera sits fixed on a wall and sweeps a blue vision cone back and
// forth. It sees the thief only inside the cone with a clear line of sight.
// Being seen fills its exposure meter (0-100): past 50 it TRACKS you and
// the alarm stage climbs; at 100 it raises the alarm and calls the guards
// to your position. Step out of the cone and the exposure drains, so a
// sweep can be timed — but a camera never gets tired, unlike a guard.
//
// States: SWEEPING -> TRACKING (exposure >= 50) -> ALERTED (exposure 100)
//        -> back to SWEEPING once the exposure drains below 20.

import { TILE, blocksSight, isBush, isShadow } from "./levels.js";

export const CAMERA_RANGE = 175;
export const CAMERA_HALF_ANGLE = 0.42; // radians, about 24 degrees each side
const EXPOSE_RATE = 160; // exposure per second while the thief is in the cone
const EXPOSE_RATE_LIT = 200; // standing in a lamp glow under a camera
const EXPOSURE_DECAY = 18; // per second while unseen

export class Camera {
  constructor(spec, level) {
    this.name = spec.name;
    this.level = level;
    this.x = spec.tile[0] * TILE + TILE / 2;
    this.y = spec.tile[1] * TILE + TILE / 2;
    this.baseAngle = spec.baseAngle;
    this.sweep = spec.sweep;
    this.speed = spec.speed;
    this.phase = spec.phase || 0;
    this.t = 0;
    this.facing = spec.baseAngle;
    this.range = CAMERA_RANGE;
    this.halfAngle = CAMERA_HALF_ANGLE;
    this.state = "SWEEPING"; // SWEEPING | TRACKING | ALERTED
    this.exposure = 0;
    this.sawPlayer = false;
  }

  // Straight-line sight check, same rule as a guard's: containers and
  // bushes block it, water does not.
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

  // Can this camera see the thief right now? 0 = invisible, 1 = fully seen.
  visibilityOf(player) {
    // Hidden in cover or a bush: invisible unless the camera is right on you.
    if (player.hidden) return 0;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.range) return 0;
    let angle = Math.atan2(dy, dx) - this.facing;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    if (Math.abs(angle) > this.halfAngle) return 0;
    if (!this.hasLineOfSight(player.x, player.y)) return 0;
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor(player.y / TILE);
    if (isBush(this.level, ptx, pty) && dist > 64) return 0;
    if (isBush(this.level, ptx, pty)) return 0.25;
    if (isShadow(this.level, ptx, pty)) return 0.3; // deep shadow fools a lens
    let factor = 1;
    if (player.sneaking) factor *= 0.5;
    if (player.sprinting) factor *= 1.6;
    return Math.min(factor, 2);
  }

  update(dt, player, onSpotted) {
    this.t += dt;
    this.facing = this.baseAngle + Math.sin(this.t * this.speed + this.phase) * this.sweep;
    const seen = this.visibilityOf(player);
    this.sawPlayer = seen > 0;
    if (seen > 0) {
      const ptx = Math.floor(player.x / TILE);
      const pty = Math.floor(player.y / TILE);
      // A lamp-lit thief under a camera is caught almost at once.
      let rate = EXPOSE_RATE;
      if (this.level.rows[pty] && this.level.rows[pty][ptx] === "L") rate = EXPOSE_RATE_LIT;
      this.exposure = Math.min(100, this.exposure + rate * seen * dt);
      if (this.exposure >= 100 && this.state !== "ALERTED") {
        this.state = "ALERTED";
        if (onSpotted) onSpotted(this);
      } else if (this.exposure >= 50 && this.state === "SWEEPING") {
        this.state = "TRACKING";
      }
    } else {
      this.exposure = Math.max(0, this.exposure - EXPOSURE_DECAY * dt);
      if (this.state === "ALERTED" && this.exposure <= 20) {
        this.state = "SWEEPING";
      } else if (this.state === "TRACKING" && this.exposure <= 20) {
        this.state = "SWEEPING";
      }
    }
  }
}
