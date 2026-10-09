// The flatlander. Zero thickness: a 0.6 x 1.7 rectangle living on the slice plane.
import { BLOCKS, B } from '../world/blocks.js';
import { traverseXZ } from '../world/world.js';

export const PHW = 0.3, PH = 1.7;

// cb(cx, y, cz, id) for every voxel the rectangle (centered at x,z on the line, from y up h) touches
export function forCells(world, x, y, z, th, hw, h, cb) {
  const fx = Math.cos(th), fz = Math.sin(th);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-4);
  let stop = false;
  traverseXZ(x - fx * hw, z - fz * hw, x + fx * hw, z + fz * hw, (cx, cz, t0, t1) => {
    if (t1 - t0 < 1e-6) return;
    for (let yy = y0; yy <= y1; yy++) {
      if (cb(cx, yy, cz, world.getBlock(cx, yy, cz)) === false) { stop = true; return false; }
    }
  });
  return stop;
}

export class Player {
  constructor(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.theta = 0;
    this.vu = 0; this.vy = 0;
    this.onGround = false;
    this.hp = 100; this.maxHp = 100;
    this.facing = 1;
    this.inWater = false; this.inLava = false; this.headInWater = false;
    this.hurtTimer = 0; this.sinceHurt = 99; this.walk = 0;
    this.dead = false;
    this.cactusCd = 0; this.lavaCd = 0;
  }
  get dir() { return [Math.cos(this.theta), Math.sin(this.theta)]; }

  collides(world, x, y, z, th = this.theta) {
    return forCells(world, x, y, z, th, PHW, PH, (cx, cy, cz, id) => (BLOCKS[id].solid ? false : undefined));
  }

  tryRotate(world, th) {
    if (this.collides(world, this.x, this.y, this.z, th)) return false;
    this.theta = th;
    return true;
  }

  damage(n, kb = 0) {
    if (this.dead || n <= 0) return false;
    this.hp = Math.max(0, this.hp - n);
    this.hurtTimer = 0.35; this.sinceHurt = 0;
    if (kb) { this.vu = kb; this.vy = Math.max(this.vy, 5); }
    if (this.hp <= 0) this.dead = true;
    return true;
  }

  update(dt, world, input, events) {
    const [fx, fz] = this.dir;
    // environment
    let water = false, lava = false, cactus = false;
    forCells(world, this.x, this.y, this.z, this.theta, PHW, PH, (cx, cy, cz, id) => {
      if (id === B.WATER) water = true; else if (id === B.LAVA) lava = true;
    });
    forCells(world, this.x, this.y - 0.05, this.z, this.theta, PHW + 0.06, PH + 0.1, (cx, cy, cz, id) => { if (id === B.CACTUS) cactus = true; });
    this.inWater = water || lava; this.inLava = lava;
    let head = false;
    forCells(world, this.x, this.y + 1.45, this.z, this.theta, PHW, 0.1, (cx, cy, cz, id) => { if (id === B.WATER) head = true; });
    this.headInWater = head;

    this.cactusCd -= dt; this.lavaCd -= dt;
    if (cactus && this.cactusCd <= 0) { this.cactusCd = 0.5; if (this.damage(4)) events.push('hurt'); }
    if (lava && this.lavaCd <= 0) { this.lavaCd = 0.5; if (this.damage(12)) events.push('hurt'); }

    // horizontal
    const speed = (input.sprint ? 6.2 : 4.4) * (this.inWater ? 0.55 : 1);
    const target = input.move * speed;
    if (input.move) this.facing = input.move;
    const acc = this.onGround ? 16 : 7;
    this.vu += (target - this.vu) * Math.min(1, dt * acc);

    // vertical
    if (this.inWater) {
      this.vy -= 10 * dt;
      if (input.jump) this.vy += 32 * dt;
      if (input.down) this.vy -= 12 * dt;
      this.vy = Math.max(-4, Math.min(4.2, this.vy));
    } else {
      this.vy -= 28 * dt;
      if (input.jump && this.onGround) { this.vy = 9.3; events.push('jump'); }
      this.vy = Math.max(this.vy, -42);
    }

    // move along the slice
    const du = this.vu * dt;
    if (du) {
      if (!this.moveU(world, du, fx, fz)) this.vu = 0;
    }
    // move vertically
    const dy = this.vy * dt;
    const wasVy = this.vy;
    this.onGround = false;
    if (!this.moveY(world, dy)) {
      if (dy < 0) {
        this.onGround = true;
        if (wasVy < -15.5 && !this.inWater) {
          const dmg = Math.round((-wasVy - 15.5) * 3.2);
          if (this.damage(dmg)) events.push('hurt');
        }
      }
      this.vy = 0;
    }
    if (Math.abs(this.vu) > 0.3 && this.onGround) this.walk += dt * Math.abs(this.vu) * 2.2;

    // never stay stuck inside something
    if (this.collides(world, this.x, this.y, this.z)) {
      for (let k = 1; k < 4; k++) if (!this.collides(world, this.x, this.y + k, this.z)) { this.y += k; break; }
    }
    if (this.y < -20) { this.damage(1000); }

    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.sinceHurt += dt;
    if (this.sinceHurt > 6 && this.hp < this.maxHp && !this.dead) this.hp = Math.min(this.maxHp, this.hp + dt * 0.6);
  }

  moveU(world, d, fx, fz) {
    const n = Math.max(1, Math.ceil(Math.abs(d) / 0.05));
    let s = d / n;
    for (let i = 0; i < n; i++) {
      const nx = this.x + fx * s, nz = this.z + fz * s;
      if (!this.collides(world, nx, this.y, nz)) { this.x = nx; this.z = nz; continue; }
      // refine toward the wall
      for (let k = 0; k < 5; k++) {
        s *= 0.5;
        const ax = this.x + fx * s, az = this.z + fz * s;
        if (!this.collides(world, ax, this.y, az)) { this.x = ax; this.z = az; }
      }
      return false;
    }
    return true;
  }

  moveY(world, d) {
    const n = Math.max(1, Math.ceil(Math.abs(d) / 0.1));
    let s = d / n;
    for (let i = 0; i < n; i++) {
      const ny = this.y + s;
      if (!this.collides(world, this.x, ny, this.z)) { this.y = ny; continue; }
      for (let k = 0; k < 6; k++) {
        s *= 0.5;
        if (!this.collides(world, this.x, this.y + s, this.z)) this.y += s;
      }
      return false;
    }
    return true;
  }
}
