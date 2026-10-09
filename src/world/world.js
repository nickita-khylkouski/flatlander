// The 3D voxel world: chunked, infinite in X/Z, 128 tall.
import { Noise, hash3, mulberry32 } from './noise.js';
import { B, BLOCKS } from './blocks.js';

export const CS = 16;          // chunk size (x,z)
export const WH = 128;         // world height
export const SEA = 46;

export const BIOME = { MEADOW: 0, DESERT: 1, TUNDRA: 2, DUSK: 3 };
export const BIOME_NAMES = ['Meadow', 'Desert', 'Tundra', 'Duskwood'];

export const cidx = (x, y, z) => ((z * WH + y) << 4) + x; // layout matches GPU sub-image [z][y][x]
export const ckey = (cx, cz) => cx + ',' + cz;           // save-file key (string)
const nkey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);  // in-memory key (fast)

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CS * WH * CS);
    this.height = new Uint8Array(CS * CS); // [z][x] -> 1 + y of top opaque block
    this.version = 0;
  }
}

export class World {
  constructor(seed) {
    this.seed = seed | 0;
    const s = this.seed;
    this.n = {
      h1: new Noise(s + 1), h2: new Noise(s + 2), h3: new Noise(s + 3), h4: new Noise(s + 4),
      temp: new Noise(s + 5), moist: new Noise(s + 6), mid: new Noise(s + 7),
      c1: new Noise(s + 8), c2: new Noise(s + 9), c3: new Noise(s + 10),
    };
    this.chunks = new Map();
    this.mods = new Map();    // chunkKey -> Map(index -> id)
    this.chests = new Map();  // "x,y,z" -> slots[]
    this.torches = new Map(); // "x,y,z" -> [x,y,z]
    this.onChange = null;     // (chunk, x, y, z) => void
  }

  // ---------- terrain shape ----------
  heightAt(x, z) {
    const n = this.n;
    let h = 52 + n.h1.noise2(x / 230, z / 230) * 15 + n.h2.noise2(x / 70, z / 70) * 6 + n.h3.noise2(x / 24, z / 24) * 2;
    const m = n.h4.noise2(x / 420, z / 420);
    if (m > 0.25) h += (m - 0.25) * 70 * (0.6 + 0.4 * Math.abs(n.h2.noise2(x / 38 + 50, z / 38)));
    return Math.max(6, Math.min(118, Math.floor(h)));
  }

  biomeAt(x, z) {
    const n = this.n;
    const mid = n.mid.noise2(x / 330 - 33, z / 330 + 91);
    if (mid > 0.42) return BIOME.DUSK;
    const t = n.temp.noise2(x / 520, z / 520);
    const m = n.moist.noise2(x / 460 + 77, z / 460);
    if (t > 0.22 && m < 0.15) return BIOME.DESERT;
    if (t < -0.28) return BIOME.TUNDRA;
    return BIOME.MEADOW;
  }

  // ---------- access ----------
  getChunk(cx, cz) {
    const lc = this._last;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const k = nkey(cx, cz);
    let c = this.chunks.get(k);
    if (!c) { c = this.generate(cx, cz); this.chunks.set(k, c); }
    this._last = c;
    return c;
  }
  hasChunk(cx, cz) { return this.chunks.has(nkey(cx, cz)); }

  // Drop chunks far from (pcx,pcz). Safe: edits live in this.mods and are re-applied on regeneration.
  evictFar(pcx, pcz, r) {
    for (const [k, c] of this.chunks) if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > r) this.chunks.delete(k);
    this._last = null;
  }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= WH) return B.AIR;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const c = this.getChunk(x >> 4, z >> 4);
    return c.blocks[cidx(x & 15, y, z & 15)];
  }

  topY(x, z) { // y of first non-opaque cell above ground
    const c = this.getChunk(x >> 4, z >> 4);
    return c.height[((z & 15) << 4) + (x & 15)];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WH) return;
    const cx = x >> 4, cz = z >> 4;
    const c = this.getChunk(cx, cz);
    const lx = x & 15, lz = z & 15;
    const i = cidx(lx, y, lz);
    const old = c.blocks[i];
    if (old === id) return;
    c.blocks[i] = id;
    const k = ckey(cx, cz);
    let m = this.mods.get(k);
    if (!m) { m = new Map(); this.mods.set(k, m); }
    m.set(i, id);
    const pk = x + ',' + y + ',' + z;
    if (old === B.TORCH) this.torches.delete(pk);
    if (id === B.TORCH) this.torches.set(pk, [x, y, z]);
    if (old === B.CHEST && id !== B.CHEST) this.chests.delete(pk);
    this.recomputeHeight(c, lx, lz);
    c.version++;
    if (this.onChange) this.onChange(c, x, y, z);
  }

  recomputeHeight(c, lx, lz) {
    let h = 0;
    for (let y = WH - 1; y >= 0; y--) {
      const id = c.blocks[cidx(lx, y, lz)];
      if (BLOCKS[id].opaque) { h = y + 1; break; }
    }
    c.height[(lz << 4) + lx] = h;
  }

  // ---------- generation ----------
  generate(cx, cz) {
    const c = new Chunk(cx, cz);
    const bl = c.blocks;
    const x0 = cx * CS, z0 = cz * CS;
    const heights = new Int16Array(256), biomes = new Uint8Array(256);

    // columns
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const h = this.heightAt(wx, wz);
      const bio = this.biomeAt(wx, wz);
      heights[(lz << 4) + lx] = h; biomes[(lz << 4) + lx] = bio;
      const beach = h <= SEA + 1 && bio !== BIOME.DUSK;
      for (let y = 0; y <= h; y++) {
        const d = h - y; // depth below surface
        let id = B.STONE;
        if (y === 0 || (y <= 2 && hash3(wx, y, wz, this.seed) < 0.5)) id = B.BEDROCK;
        else if (bio === BIOME.DESERT) id = d < 4 ? B.SAND : d < 9 ? B.SANDSTONE : B.STONE;
        else if (bio === BIOME.DUSK) id = d === 0 ? (h < SEA ? B.DUSK_SOIL : B.DUSK_GRASS) : d < 4 ? B.DUSK_SOIL : d < 10 ? B.DUSK_STONE : B.STONE;
        else if (beach) id = d < 3 ? B.SAND : d < 5 ? B.DIRT : B.STONE;
        else if (bio === BIOME.TUNDRA) id = d === 0 ? B.SNOW : d < 4 ? B.DIRT : B.STONE;
        else id = d === 0 ? B.GRASS : d < 4 ? B.DIRT : B.STONE;
        bl[cidx(lx, y, lz)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) bl[cidx(lx, y, lz)] = (bio === BIOME.TUNDRA && y === SEA) ? B.ICE : B.WATER;
    }

    this.carveCaves(c, heights);
    this.placeOres(c);
    this.placeFlora(c);

    // apply saved modifications
    const m = this.mods.get(ckey(cx, cz));
    if (m) for (const [i, id] of m) bl[i] = id;
    // index torches
    if (m) for (const [i, id] of m) if (id === B.TORCH) {
      const lx = i & 15, y = (i >> 4) % WH, lz = Math.floor((i >> 4) / WH);
      const wx = x0 + lx, wz = z0 + lz;
      this.torches.set(wx + ',' + y + ',' + wz, [wx, y, wz]);
    }
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) this.recomputeHeight(c, lx, lz);
    return c;
  }

  carveCaves(c, heights) {
    const bl = c.blocks, n = this.n;
    const x0 = c.cx * CS, z0 = c.cz * CS;
    // coarse lattice, step 4, trilinear interpolation (fast)
    const NX = 5, NY = WH / 4 + 1, NZ = 5;
    const worm = new Float32Array(NX * NY * NZ), cheese = new Float32Array(NX * NY * NZ);
    for (let iz = 0; iz < NZ; iz++) for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
      const wx = x0 + ix * 4, wy = iy * 4, wz = z0 + iz * 4;
      const a = n.c1.noise3(wx / 42, wy / 26, wz / 42), b = n.c2.noise3(wx / 42, wy / 26, wz / 42);
      const i = (iz * NY + iy) * NX + ix;
      worm[i] = a * a + b * b;
      cheese[i] = n.c3.noise3(wx / 64, wy / 34, wz / 64);
    }
    const lerp = (a, b, t) => a + (b - a) * t;
    const sample = (arr, lx, y, lz) => {
      const fx = lx / 4, fy = y / 4, fz = lz / 4;
      const ix = Math.min(NX - 2, fx | 0), iy = Math.min(NY - 2, fy | 0), iz = Math.min(NZ - 2, fz | 0);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const g = (a, b, c2) => arr[((iz + c2) * NY + (iy + b)) * NX + ix + a];
      return lerp(
        lerp(lerp(g(0, 0, 0), g(1, 0, 0), tx), lerp(g(0, 1, 0), g(1, 1, 0), tx), ty),
        lerp(lerp(g(0, 0, 1), g(1, 0, 1), tx), lerp(g(0, 1, 1), g(1, 1, 1), tx), ty), tz);
    };
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const h = heights[(lz << 4) + lx];
      const underwater = h < SEA + 2;
      const top = underwater ? h - 3 : h;
      for (let y = 3; y <= top; y++) {
        const i = cidx(lx, y, lz);
        const id = bl[i];
        if (id === B.BEDROCK || id === B.WATER) continue;
        const depth = h - y;
        const wv = sample(worm, lx, y, lz);
        const cv = sample(cheese, lx, y, lz);
        const wormT = 0.016 * (depth < 3 ? 0.6 : 1);
        const cheeseT = depth < 8 ? 1 : 0.58 + Math.max(0, (y - 40)) * 0.004;
        if (wv < wormT || cv > cheeseT) bl[i] = y <= 9 ? B.LAVA : B.AIR;
      }
    }
  }

  placeOres(c) {
    const bl = c.blocks;
    const rng = mulberry32(hash3(c.cx, 7, c.cz, this.seed) * 4294967296);
    const vein = (ore, count, size, maxY, minY = 3) => {
      for (let v = 0; v < count; v++) {
        let x = (rng() * 16) | 0, y = minY + ((rng() * (maxY - minY)) | 0), z = (rng() * 16) | 0;
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < WH) {
            const i = cidx(x, y, z);
            if (bl[i] === B.STONE || bl[i] === B.DUSK_STONE) bl[i] = ore;
          }
          const r = rng();
          if (r < 0.33) x += rng() < 0.5 ? -1 : 1; else if (r < 0.66) z += rng() < 0.5 ? -1 : 1; else y += rng() < 0.5 ? -1 : 1;
        }
      }
    };
    vein(B.IRON_ORE, 16, 7, 51);
    vein(B.CRIMSON_ORE, 5, 5, 20);
    vein(B.AZURE_ORE, 2, 4, 12);
  }

  placeFlora(c) {
    const bl = c.blocks;
    const x0 = c.cx * CS, z0 = c.cz * CS;
    const set = (wx, y, wz, id, overwrite) => {
      const lx = wx - x0, lz = wz - z0;
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16 || y <= 0 || y >= WH) return;
      const i = cidx(lx, y, lz);
      const cur = bl[i];
      if (cur === B.AIR || (overwrite && BLOCKS[cur].leaf)) bl[i] = id;
    };
    const G = 6;
    const gx0 = Math.floor((x0 - 4) / G), gx1 = Math.floor((x0 + 20) / G);
    const gz0 = Math.floor((z0 - 4) / G), gz1 = Math.floor((z0 + 20) / G);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const r0 = hash3(gx, 1, gz, this.seed), r1 = hash3(gx, 2, gz, this.seed), r2 = hash3(gx, 3, gz, this.seed);
      const tx = gx * G + ((r1 * G) | 0), tz = gz * G + ((r2 * G) | 0);
      const h = this.heightAt(tx, tz);
      if (h <= SEA) continue;
      const bio = this.biomeAt(tx, tz);
      const r3 = hash3(tx, 4, tz, this.seed);
      const base = h + 1;
      if (bio === BIOME.MEADOW) {
        if (r0 > 0.42) continue;
        const th = 4 + ((r3 * 3) | 0);
        const top = base + th - 1;
        for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const d2 = dx * dx + dy * dy * 1.3 + dz * dz;
          if (d2 > 5.5 || (d2 > 4 && hash3(tx + dx, top + dy, tz + dz, this.seed) < 0.45)) continue;
          set(tx + dx, top + dy, tz + dz, B.EMBERLEAF, false);
        }
        for (let y = base; y <= top; y++) set(tx, y, tz, B.WOOD, true);
      } else if (bio === BIOME.TUNDRA) {
        if (r0 > 0.6) continue;
        const th = 6 + ((r3 * 4) | 0);
        const top = base + th - 1;
        for (let y = base + 2; y <= top + 1; y++) {
          const rr = Math.max(0.6, (top + 1 - y) * 0.42 + ((y - base) % 2) * 0.5);
          const ri = Math.ceil(rr);
          for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++)
            if (dx * dx + dz * dz <= rr * rr) set(tx + dx, y, tz + dz, B.PINE_LEAF, false);
        }
        for (let y = base; y <= top; y++) set(tx, y, tz, B.PINE_WOOD, true);
      } else if (bio === BIOME.DUSK) {
        if (r0 > 0.38) continue;
        const th = 5 + ((r3 * 4) | 0);
        const top = base + th - 1;
        for (let dy = -1; dy <= 1; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const d2 = (dx * dx + dz * dz) / 9 + (dy * dy) / 1.8;
          if (d2 > 1.05) continue;
          if (d2 > 0.75 && hash3(tx + dx, top + dy, tz + dz, this.seed) < 0.4) continue;
          set(tx + dx, top + dy + 1, tz + dz, B.DUSK_LEAF, false);
        }
        for (let y = base; y <= top + 1; y++) set(tx, y, tz, B.DUSK_WOOD, true);
      } else if (bio === BIOME.DESERT) {
        if (r0 > 0.16) continue;
        const th = 2 + ((r3 * 3) | 0);
        for (let y = base; y < base + th; y++) set(tx, y, tz, B.CACTUS, true);
      }
    }
  }

  findSpawn() {
    for (let r = 0; r < 400; r += 4) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a * 0.785) * r), z = Math.round(Math.sin(a * 0.785) * r);
        const h = this.heightAt(x, z);
        if (h > SEA + 2 && this.biomeAt(x, z) === BIOME.MEADOW) {
          // make sure the spawn column is open
          for (let y = h + 1; y < WH - 3; y++) {
            if (!BLOCKS[this.getBlock(x, y, z)].solid && !BLOCKS[this.getBlock(x, y + 1, z)].solid && BLOCKS[this.getBlock(x, y - 1, z)].solid)
              return [x + 0.5, y, z + 0.5];
          }
        }
      }
    }
    return [0.5, 90, 0.5];
  }

  // ---------- persistence ----------
  serialize() {
    const mods = {};
    for (const [k, m] of this.mods) {
      const arr = [];
      for (const [i, id] of m) arr.push(i, id);
      mods[k] = arr;
    }
    const chests = {};
    for (const [k, v] of this.chests) chests[k] = v;
    return { seed: this.seed, mods, chests };
  }
  load(data) {
    for (const k in data.mods) {
      const arr = data.mods[k], m = new Map();
      for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.mods.set(k, m);
    }
    for (const k in data.chests || {}) this.chests.set(k, data.chests[k]);
  }
}

// Amanatides–Woo traversal of the XZ grid along a segment. cb(cx, cz, t0, t1) with t in [0,1].
export function traverseXZ(x0, z0, x1, z1, cb) {
  let cx = Math.floor(x0), cz = Math.floor(z0);
  const ex = Math.floor(x1), ez = Math.floor(z1);
  const dx = x1 - x0, dz = z1 - z0;
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? (cx + 1 - x0) : (x0 - cx)) * tdx : Infinity;
  let tmz = dz !== 0 ? (dz > 0 ? (cz + 1 - z0) : (z0 - cz)) * tdz : Infinity;
  let t = 0;
  for (let guard = 0; guard < 4096; guard++) {
    const tn = Math.min(tmx, tmz, 1);
    if (cb(cx, cz, t, tn) === false) return;
    if (cx === ex && cz === ez) return;
    if (tn >= 1) return;
    if (tmx < tmz) { cx += sx; t = tmx; tmx += tdx; } else { cz += sz; t = tmz; tmz += tdz; }
  }
}
