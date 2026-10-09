// 3D creatures. They live in full 3D; the flatlander only sees where their bodies cross the slice.
import { BLOCKS, B, I } from '../world/blocks.js';

const solid = (world, x, y, z) => BLOCKS[world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))].solid;

function boxHits(world, x, y, z, hw, h) {
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-4);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-4);
  const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw - 1e-4);
  for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++)
    if (BLOCKS[world.getBlock(xx, yy, zz)].solid) return true;
  return false;
}

export const MOB_TYPES = {
  spider: { hp: 20, hw: 0.5, h: 0.9, speed: 3.1, dmg: 10, hostile: true, name: 'Phase Spider' },
  butterfly: { hp: 3, hw: 0.2, h: 0.3, speed: 2.0, dmg: 0, name: 'Butterfly' },
  jelly: { hp: 12, hw: 0.4, h: 0.8, speed: 0.8, dmg: 22, name: 'Jellyfish' },
};

const LENS_COL = { red: [1.0, 0.25, 0.3], green: [0.3, 1.0, 0.4], blue: [0.3, 0.55, 1.0] };

let nextId = 1;
export class Mob {
  constructor(type, x, y, z, opts = {}) {
    const T = MOB_TYPES[type];
    this.id = nextId++;
    this.type = type; this.T = T;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = T.hp;
    this.t = Math.random() * 100;
    this.hurt = 0; this.attackCd = 0;
    this.onGround = false; this.dead = false;
    this.wanderT = 0; this.target = null;
    this.color = opts.color || 'red';
    this.aggro = false;
  }

  // List of [x, y, z, r, rgb] spheres making up the body. Cached until the mob changes.
  parts() {
    if (this._pk === this.t && this._ph === this.hurt) return this._parts;
    this._pk = this.t; this._ph = this.hurt;
    const P = this._parts = [];
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const fwd = (d, side, up) => [this.x + cy * d - sy * side, this.y + up, this.z + sy * d + cy * side];
    const flash = this.hurt > 0;
    if (this.type === 'spider') {
      const body = flash ? [1, 0.3, 0.3] : [0.2, 0.11, 0.28];
      const abd = flash ? [1, 0.35, 0.35] : [0.3, 0.13, 0.4];
      P.push([...fwd(-0.35, 0, 0.5), 0.46, abd]);
      P.push([...fwd(0.2, 0, 0.45), 0.32, body]);
      P.push([...fwd(0.5, 0, 0.48), 0.22, body]);
      P.push([...fwd(0.66, 0.09, 0.56), 0.065, [1, 0.15, 0.25]]);
      P.push([...fwd(0.66, -0.09, 0.56), 0.065, [1, 0.15, 0.25]]);
      const angs = [0.5, 1.1, 1.8, 2.4];
      for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 4; k++) {
        const ph = Math.sin(this.t * 12 + k * 1.7 + (side > 0 ? 0 : Math.PI)) * 0.25;
        const a = this.yaw + side * (angs[k] + ph * 0.4);
        const kx = this.x + Math.cos(a) * 0.62, kz = this.z + Math.sin(a) * 0.62;
        const lift = Math.max(0, ph) * 0.4;
        P.push([kx, this.y + 0.72 + lift * 0.5, kz, 0.085, body]);
        P.push([this.x + Math.cos(a) * 1.0, this.y + 0.08 + lift, this.z + Math.sin(a) * 1.0, 0.07, body]);
      }
    } else if (this.type === 'butterfly') {
      const wc = flash ? [1, 1, 1] : LENS_COL[this.color];
      P.push([this.x, this.y, this.z, 0.07, [0.08, 0.08, 0.1]]);
      const flap = Math.sin(this.t * 16) * 1.0;
      for (let side = -1; side <= 1; side += 2) for (let fb = -1; fb <= 1; fb += 2) {
        const off = 0.2, ca = Math.cos(flap) * off, sa = Math.sin(flap) * off;
        const [x, y, z] = fwd(fb * 0.09, side * (0.08 + ca), 0.02 + Math.abs(sa));
        P.push([x, y, z, fb > 0 ? 0.17 : 0.13, wc]);
      }
    } else if (this.type === 'jelly') {
      const bell = flash ? [1, 1, 1] : [1.0, 0.5, 0.82];
      const pulse = 1 + Math.sin(this.t * 3) * 0.08;
      P.push([this.x, this.y + 0.55, this.z, 0.42 * pulse, bell]);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.4;
        for (let j = 1; j <= 3; j++) {
          const sw = Math.sin(this.t * 4 + j + k) * 0.08;
          P.push([this.x + Math.cos(a) * 0.2 + sw, this.y + 0.25 - j * 0.2, this.z + Math.sin(a) * 0.2, 0.07, [0.95, 0.7, 1]]);
        }
      }
    }
    return P;
  }

  hit(dmg, kx, kz) {
    this.hp -= dmg;
    this.hurt = 0.25;
    this.aggro = true;
    this.vx += kx * 6; this.vz += kz * 6; this.vy = Math.max(this.vy, 4.5);
    if (this.hp <= 0) this.dead = true;
  }

  drops(rng) {
    if (this.type === 'spider') {
      const d = [[I.PHASE_SILK, 1 + (rng() < 0.4 ? 1 : 0)]];
      if (rng() < 0.1) d.push([I.HEALTH_POTION, 1 + Math.floor(rng() * 3)]);
      return d;
    }
    if (this.type === 'butterfly') return [[{ red: I.RED_LENS, green: I.GREEN_LENS, blue: I.BLUE_LENS }[this.color], 1]];
    return [];
  }

  update(dt, world, player, daylight) {
    this.t += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    const T = this.T;
    const dx = player.x - this.x, dz = player.z - this.z, dyp = player.y - this.y;
    const dist = Math.hypot(dx, dz, dyp);

    if (this.type === 'spider') {
      let wantX = 0, wantZ = 0;
      if (!player.dead && dist < 22 && !this.passive) {
        const d = Math.hypot(dx, dz) || 1;
        wantX = dx / d; wantZ = dz / d;
        this.yaw = Math.atan2(wantZ, wantX);
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 3; this.yaw += (Math.random() - 0.5) * 2.5; this.idle = Math.random() < 0.35; }
        if (!this.idle) { wantX = Math.cos(this.yaw); wantZ = Math.sin(this.yaw); }
      }
      const sp = T.speed * (this.hurt > 0 ? 0.3 : 1);
      this.vx += (wantX * sp - this.vx) * Math.min(1, dt * 8);
      this.vz += (wantZ * sp - this.vz) * Math.min(1, dt * 8);
      this.physics(dt, world, true);
    } else if (this.type === 'butterfly') {
      this.wanderT -= dt;
      if (!this.target || this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 4;
        const top = world.topY(Math.floor(this.x), Math.floor(this.z));
        this.target = [this.x + (Math.random() - 0.5) * 10, Math.max(top, this.y - 2) + 1.2 + Math.random() * 3, this.z + (Math.random() - 0.5) * 10];
      }
      const [tx, ty, tz] = this.target;
      const ex = tx - this.x, ey = ty - this.y, ez = tz - this.z;
      const d = Math.hypot(ex, ey, ez) || 1;
      this.yaw = Math.atan2(ez, ex);
      const sp = T.speed;
      this.vx += (ex / d * sp - this.vx) * dt * 2;
      this.vy += (ey / d * sp + Math.sin(this.t * 5) * 1.2 - this.vy) * dt * 3;
      this.vz += (ez / d * sp - this.vz) * dt * 2;
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, nz = this.z + this.vz * dt;
      if (solid(world, nx, ny, nz) || solid(world, nx, ny - 0.3, nz)) { this.target = null; this.vy = 1.5; this.vx *= -0.5; this.vz *= -0.5; }
      else { this.x = nx; this.y = ny; this.z = nz; }
    } else if (this.type === 'jelly') {
      const inW = world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z)) === B.WATER;
      if (inW) {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 3 + Math.random() * 3; this.yaw = Math.random() * 6.28; }
        this.vx = Math.cos(this.yaw) * T.speed; this.vz = Math.sin(this.yaw) * T.speed;
        this.vy = Math.sin(this.t * 1.5) * 0.6;
        const above = world.getBlock(Math.floor(this.x), Math.floor(this.y + 1.1), Math.floor(this.z));
        if (above !== B.WATER && this.vy > 0) this.vy = -0.3;
        this.physics(dt, world, false);
      } else {
        this.vy -= 20 * dt; this.vx *= 0.9; this.vz *= 0.9;
        this.physics(dt, world, false);
      }
    }
    return dist;
  }

  physics(dt, world, canJump) {
    const T = this.T;
    if (this.type === 'spider') {
      const inW = world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.4), Math.floor(this.z)) === B.WATER;
      this.vy -= (inW ? 6 : 25) * dt;
      if (inW) this.vy = Math.min(Math.max(this.vy, -2), 2.5) + dt * 8;
    }
    this.vy = Math.max(this.vy, -40);
    let blocked = false;
    const mv = (axis, d) => {
      const n = Math.max(1, Math.ceil(Math.abs(d) / 0.2));
      const s = d / n;
      for (let i = 0; i < n; i++) {
        const nx = this.x + (axis === 0 ? s : 0), ny = this.y + (axis === 1 ? s : 0), nz = this.z + (axis === 2 ? s : 0);
        if (boxHits(world, nx, ny, nz, T.hw, T.h)) return false;
        this.x = nx; this.y = ny; this.z = nz;
      }
      return true;
    };
    if (!mv(0, this.vx * dt)) { this.vx = 0; blocked = true; }
    if (!mv(2, this.vz * dt)) { this.vz = 0; blocked = true; }
    this.onGround = false;
    if (!mv(1, this.vy * dt)) { if (this.vy < 0) this.onGround = true; this.vy = 0; }
    if (blocked && canJump && this.onGround) this.vy = 8.2;
    if (boxHits(world, this.x, this.y, this.z, T.hw, T.h)) this.y += 0.5; // unstick
  }
}

// Where a sphere crosses the slice plane: returns {u, v, r, w} or null. plane passes through (px,pz), dir (fx,fz)
export function sliceSphere(s, px, pz, fx, fz) {
  const dx = s[0] - px, dz = s[2] - pz;
  const u = dx * fx + dz * fz;
  const w = -dx * fz + dz * fx;
  if (Math.abs(w) >= s[3]) return { u, v: s[1], r: 0, w, R: s[3] };
  return { u, v: s[1], r: Math.sqrt(s[3] * s[3] - w * w), w, R: s[3] };
}
