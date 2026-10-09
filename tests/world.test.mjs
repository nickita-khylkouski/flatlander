import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, traverseXZ, WH } from '../src/world/world.js';
import { B, I, BLOCKS, RECIPES, mineTime, toolOf, HAND } from '../src/world/blocks.js';
import { Inventory } from '../src/game/inventory.js';
import { Player } from '../src/game/player.js';

test('world generation is deterministic per seed', () => {
  const a = new World(42), b = new World(42), c = new World(43);
  const ca = a.getChunk(3, -2), cb = b.getChunk(3, -2), cc = c.getChunk(3, -2);
  assert.deepEqual(ca.blocks, cb.blocks);
  assert.notDeepEqual(ca.blocks, cc.blocks);
});

test('every column has bedrock at y=0 and air at the top', () => {
  const w = new World(7);
  for (let x = 0; x < 16; x++) {
    assert.equal(w.getBlock(x, 0, 5), B.BEDROCK);
    assert.equal(w.getBlock(x, WH - 1, 5), B.AIR);
  }
});

test('edits survive chunk eviction and regeneration', () => {
  const w = new World(1);
  w.setBlock(5, 70, 5, B.GLASS);
  w.evictFar(100, 100, 2);
  assert.equal(w.chunks.size, 0);
  assert.equal(w.getBlock(5, 70, 5), B.GLASS);
});

test('save + load round-trips edits', () => {
  const w = new World(9);
  w.setBlock(-3, 60, 12, B.TORCH);
  const w2 = new World(9);
  w2.load(JSON.parse(JSON.stringify(w.serialize())));
  assert.equal(w2.getBlock(-3, 60, 12), B.TORCH);
  assert.equal(w2.torches.size, 1);
});

test('traverseXZ visits a contiguous run of cells covering the segment', () => {
  const cells = [];
  traverseXZ(0.5, 0.5, 3.5, 2.5, (cx, cz, t0, t1) => { cells.push([cx, cz, t0, t1]); });
  assert.deepEqual(cells[0].slice(0, 2), [0, 0]);
  assert.deepEqual(cells.at(-1).slice(0, 2), [3, 2]);
  for (let i = 1; i < cells.length; i++) {
    const [ax, az] = cells[i - 1], [bx, bz] = cells[i];
    assert.equal(Math.abs(ax - bx) + Math.abs(az - bz), 1, 'steps are 4-connected');
    assert.equal(cells[i][2], cells[i - 1][3], 'parameter ranges are contiguous');
  }
});

test('tool tiers gate mining', () => {
  assert.equal(mineTime(B.STONE, HAND), Infinity);
  assert.ok(Number.isFinite(mineTime(B.STONE, toolOf(I.HAMMER))));
  assert.equal(mineTime(B.CRIMSON_ORE, toolOf(I.HAMMER)), Infinity);
  assert.ok(Number.isFinite(mineTime(B.CRIMSON_ORE, toolOf(I.IRON_PICK))));
  assert.equal(mineTime(B.BEDROCK, toolOf(I.TITAN_HAMMER)), Infinity);
});

test('every recipe output and ingredient is a known item', () => {
  for (const r of RECIPES) {
    assert.ok(BLOCKS[r.out[0]] || r.out[0] >= 100);
    for (const [what] of r.in) assert.ok(typeof what === 'string' || BLOCKS[what] || what >= 100, `bad ingredient ${what}`);
  }
});

test('crafting consumes ingredients (including groups) and refuses when missing', () => {
  const inv = new Inventory();
  inv.add(B.PINE_WOOD, 1);
  const sticks = RECIPES.find((r) => r.out[0] === I.STICK);
  assert.ok(inv.craft(sticks));
  assert.equal(inv.count(B.PINE_WOOD), 0);
  assert.equal(inv.count(I.STICK), 8);
  assert.equal(inv.craft(sticks), false);
});

test('inventory stacks and reports leftovers when full', () => {
  const inv = new Inventory(2);
  assert.equal(inv.add(B.DIRT, 100), 0);
  assert.equal(inv.add(B.DIRT, 100), 72);
  assert.equal(inv.canFit(B.DIRT, 1), false);
});

test('the flatlander collides with blocks cut by its slice, not ones beside it', () => {
  const w = new World(3);
  // a clear box of air with one stone block just beside the slice line
  for (let x = 0; x < 6; x++) for (let y = 80; y < 84; y++) for (let z = 0; z < 3; z++) w.setBlock(x, y, z, B.AIR);
  w.setBlock(3, 80, 2, B.STONE);
  const p = new Player(3.5, 80, 1.75);
  p.theta = 0;
  assert.equal(p.collides(w, p.x, p.y, p.z), false, 'stone is one block off-slice');
  assert.equal(p.collides(w, p.x, p.y, p.z, Math.PI / 2), true, 'rotating 90° sweeps through it');
});
