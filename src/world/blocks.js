// Block + item definitions, tools and recipes.

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, EMBERLEAF: 5, IRON_ORE: 6, CRIMSON_ORE: 7,
  AZURE_ORE: 8, SAND: 9, SANDSTONE: 10, DUSK_GRASS: 11, DUSK_SOIL: 12, DUSK_STONE: 13,
  DUSK_WOOD: 14, DUSK_LEAF: 15, SNOW: 16, PINE_WOOD: 17, PINE_LEAF: 18, ICE: 19, WATER: 20,
  LAVA: 21, BEDROCK: 22, CHEST: 23, GLASS: 24, TORCH: 25, CACTUS: 26,
};

// Shader texture patterns
export const P = {
  NONE: 0, NOISE: 1, TOP: 2, WOOD: 3, LEAF: 4, ORE: 5, WATER: 6, LAVA: 7, GLASS: 8,
  CHEST: 9, TORCH: 10, LAYER: 11, CACTUS: 12, ICE: 13, BEDROCK: 14,
};

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// tool: which tool class mines it fast. tier: minimum pick tier needed (0 = anything).
function blk(id, name, c1, c2, pat, o = {}) {
  return {
    id, name, col: hex(c1), col2: hex(c2), pat,
    solid: o.solid ?? true,
    opaque: o.opaque ?? true,
    hardness: o.hardness ?? 1,
    tier: o.tier ?? 0,
    tool: o.tool ?? 'shovel',
    drop: o.drop ?? id,
    placeable: o.placeable ?? true,
    target: o.target ?? true,
    leaf: o.leaf ?? false,
    light: o.light ?? 0,
  };
}

export const BLOCKS = [];
const add = (b) => (BLOCKS[b.id] = b);
add(blk(B.AIR, 'Air', 0x000000, 0x000000, P.NONE, { solid: false, opaque: false, target: false }));
add(blk(B.GRASS, 'Grass', 0x7a5232, 0x5fae3c, P.TOP, { hardness: 0.9, drop: B.DIRT }));
add(blk(B.DIRT, 'Dirt', 0x7a5232, 0x5e3d24, P.NOISE, { hardness: 0.8 }));
add(blk(B.STONE, 'Stone', 0x7d7d84, 0x5d5d66, P.NOISE, { hardness: 6, tier: 1, tool: 'pick' }));
add(blk(B.WOOD, 'Wood', 0xb07a45, 0x5a3a1e, P.WOOD, { hardness: 3, tool: 'axe' }));
add(blk(B.EMBERLEAF, 'Emberleaf', 0xc8302c, 0x8a1a22, P.LEAF, { hardness: 0.25, solid: false, opaque: false, tool: 'axe', leaf: true, drop: 0 }));
add(blk(B.IRON_ORE, 'Iron Ore', 0xd9a77a, 0x7d7d84, P.ORE, { hardness: 8, tier: 1, tool: 'pick' }));
add(blk(B.CRIMSON_ORE, 'Crimsonite Ore', 0xe0204a, 0x5d5d66, P.ORE, { hardness: 12, tier: 2, tool: 'pick' }));
add(blk(B.AZURE_ORE, 'Azurite Ore', 0x28e0d0, 0x4d4d58, P.ORE, { hardness: 16, tier: 3, tool: 'pick' }));
add(blk(B.SAND, 'Sand', 0xe6d494, 0xc9b471, P.NOISE, { hardness: 0.7 }));
add(blk(B.SANDSTONE, 'Sandstone', 0xd8c07e, 0xb89c5c, P.LAYER, { hardness: 4, tier: 1, tool: 'pick' }));
add(blk(B.DUSK_GRASS, 'Dusk Grass', 0x2a2440, 0x6b3fd1, P.TOP, { hardness: 1, drop: B.DUSK_SOIL }));
add(blk(B.DUSK_SOIL, 'Dusk Soil', 0x2a2440, 0x1c1830, P.NOISE, { hardness: 0.9 }));
add(blk(B.DUSK_STONE, 'Dusk Stone', 0x3a3550, 0x24203a, P.NOISE, { hardness: 7, tier: 1, tool: 'pick' }));
add(blk(B.DUSK_WOOD, 'Dusk Wood', 0x4a3a6a, 0x1e1630, P.WOOD, { hardness: 3.5, tool: 'axe' }));
add(blk(B.DUSK_LEAF, 'Dusk Leaf', 0x3ad0ff, 0x2a50c8, P.LEAF, { hardness: 0.25, solid: false, opaque: false, tool: 'axe', leaf: true, drop: 0 }));
add(blk(B.SNOW, 'Snowy Grass', 0x7a5232, 0xf2f6ff, P.TOP, { hardness: 0.8, drop: B.DIRT }));
add(blk(B.PINE_WOOD, 'Pine Wood', 0x8a5e3a, 0x3e2a18, P.WOOD, { hardness: 3, tool: 'axe' }));
add(blk(B.PINE_LEAF, 'Pine Needles', 0x2e6b48, 0x1c4a32, P.LEAF, { hardness: 0.25, solid: false, opaque: false, tool: 'axe', leaf: true, drop: 0 }));
add(blk(B.ICE, 'Ice', 0xa8d8ff, 0xe0f2ff, P.ICE, { hardness: 2, tier: 1, tool: 'pick', opaque: false }));
add(blk(B.WATER, 'Water', 0x2a6fd6, 0x5a9af0, P.WATER, { solid: false, opaque: false, target: false, placeable: false }));
add(blk(B.LAVA, 'Lava', 0xff5a10, 0xffc020, P.LAVA, { solid: false, opaque: false, target: false, placeable: false, light: 1 }));
add(blk(B.BEDROCK, 'Bedrock', 0x2a2a2e, 0x55555c, P.BEDROCK, { hardness: Infinity, tier: 99, tool: 'pick' }));
add(blk(B.CHEST, 'Chest', 0xa8743e, 0x6a4422, P.CHEST, { hardness: 2, tool: 'axe' }));
add(blk(B.GLASS, 'Glass', 0xd8f0ff, 0xffffff, P.GLASS, { hardness: 0.5, opaque: false }));
add(blk(B.TORCH, 'Torch', 0x8a5e3a, 0xffc040, P.TORCH, { hardness: 0.05, solid: false, opaque: false, light: 1 }));
add(blk(B.CACTUS, 'Cactus', 0x3e9a40, 0x2a6e2c, P.CACTUS, { hardness: 0.6, opaque: true }));

export const NUM_BLOCK_SLOTS = 32;

export const isSolid = (id) => BLOCKS[id].solid;
export const isOpaque = (id) => BLOCKS[id].opaque;

// ---------------- Items ----------------
export const I = {
  STICK: 100, ROCK: 101, PHASE_SILK: 102, HAMMER: 103, IRON_INGOT: 104, CRIMSON_INGOT: 105,
  AZURE_INGOT: 106, IRON_PICK: 107, IRON_AXE: 108, CRIMSON_PICK: 109, CRIMSON_AXE: 110,
  TITAN_HAMMER: 111, HEALTH_POTION: 112, FLASK: 113, RED_LENS: 114, GREEN_LENS: 115,
  BLUE_LENS: 116, GLASSES: 117, COMPASS: 118, CARTOGRAPH: 119,
};

export const ITEMS = {};
const item = (id, name, o = {}) => (ITEMS[id] = { id, name, stack: o.stack ?? 64, desc: o.desc ?? '', ...o });

item(I.STICK, 'Stick', { tool: { type: 'stick', tier: 0, speed: 1, dmg: 4 }, desc: 'Weak weapon. Digging dirt with it can turn up rocks.' });
item(I.ROCK, 'Rock', { desc: 'A hammer head, waiting to happen.' });
item(I.PHASE_SILK, 'Phase Silk', { desc: 'Spun by spiders that live between slices.' });
item(I.HAMMER, 'Hammer', { stack: 1, tool: { type: 'pick', tier: 1, speed: 3, dmg: 7 }, desc: 'Breaks stone and iron ore.' });
item(I.IRON_INGOT, 'Iron Ingot');
item(I.CRIMSON_INGOT, 'Crimsonite Ingot');
item(I.AZURE_INGOT, 'Azurite Ingot');
item(I.IRON_PICK, 'Iron Pick', { stack: 1, tool: { type: 'pick', tier: 2, speed: 5, dmg: 9 }, desc: 'Can mine Crimsonite Ore.' });
item(I.IRON_AXE, 'Iron Axe', { stack: 1, tool: { type: 'axe', tier: 0, speed: 6, dmg: 10 } });
item(I.CRIMSON_PICK, 'Crimsonite Pick', { stack: 1, tool: { type: 'pick', tier: 3, speed: 8, dmg: 13 }, desc: 'Can mine Azurite Ore.' });
item(I.CRIMSON_AXE, 'Crimsonite Axe', { stack: 1, tool: { type: 'axe', tier: 0, speed: 10, dmg: 15 } });
item(I.TITAN_HAMMER, 'Titan Hammer', { stack: 1, tool: { type: 'ultra', tier: 4, speed: 13, dmg: 22 }, desc: 'Breaks everything fast.' });
item(I.HEALTH_POTION, 'Health Potion', { stack: 16, desc: 'Right-click to restore 30 health.' });
item(I.FLASK, 'Flask', { stack: 16, desc: 'An empty flask. Fill it with cactus juice.' });
item(I.RED_LENS, 'Red Lens', { desc: 'Dropped by red butterflies.' });
item(I.GREEN_LENS, 'Green Lens', { desc: 'Dropped by green butterflies.' });
item(I.BLUE_LENS, 'Blue Lens', { desc: 'Dropped by blue butterflies.' });
item(I.GLASSES, '3D Glasses', { stack: 1, gadget: true, desc: 'In your hotbar: see things outside your slice + a 3D cutaway view (G).' });
item(I.COMPASS, 'Compass', { stack: 1, gadget: true, desc: 'In your hotbar: shows your X/Y/Z and which way your slice faces.' });
item(I.CARTOGRAPH, 'Cartograph', { stack: 1, gadget: true, desc: 'In your hotbar: a top-down survey map (M for big map).' });

for (const b of BLOCKS) {
  if (b && b.id !== B.AIR) ITEMS[b.id] = { id: b.id, name: b.name, stack: 64, block: true, desc: '' };
}

export const itemName = (id) => (ITEMS[id] ? ITEMS[id].name : '?');
export const maxStack = (id) => (ITEMS[id] ? ITEMS[id].stack : 64);

export const HAND = { type: 'hand', tier: 0, speed: 1, dmg: 2 };
export const toolOf = (id) => (id != null && ITEMS[id] && ITEMS[id].tool) || HAND;

// Mining time in seconds, or Infinity if this tool can't break it.
export function mineTime(blockId, tool) {
  const b = BLOCKS[blockId];
  if (!b || !b.target) return Infinity;
  if (b.tier > 0) {
    const pickTier = tool.type === 'pick' || tool.type === 'ultra' ? tool.tier : 0;
    if (pickTier < b.tier) return Infinity;
  }
  let mult = 1;
  if (tool.type === 'ultra') mult = tool.speed;
  else if (b.tool === tool.type) mult = tool.speed;
  else if (b.tool === 'shovel' && tool.type === 'pick') mult = tool.speed * 0.6;
  return b.hardness / mult;
}

// Recipes: ingredients are [id|group, count]
export const GROUPS = {
  wood: { name: 'Any Wood', ids: [B.WOOD, B.DUSK_WOOD, B.PINE_WOOD] },
  stone: { name: 'Any Stone', ids: [B.STONE, B.DUSK_STONE] },
};

export const RECIPES = [
  { out: [I.STICK, 8], in: [['wood', 1]] },
  { out: [I.ROCK, 5], in: [['stone', 1]] },
  { out: [I.HAMMER, 1], in: [[I.ROCK, 1], [I.PHASE_SILK, 1], [I.STICK, 1]] },
  { out: [B.TORCH, 4], in: [[I.STICK, 1], ['wood', 1]] },
  { out: [B.CHEST, 1], in: [['wood', 4]] },
  { out: [B.GLASS, 2], in: [[B.SAND, 2], ['wood', 1]] },
  { out: [B.SANDSTONE, 1], in: [[B.SAND, 4]] },
  { out: [I.IRON_INGOT, 1], in: [[B.IRON_ORE, 1], ['wood', 1]] },
  { out: [I.CRIMSON_INGOT, 1], in: [[B.CRIMSON_ORE, 1], ['wood', 1]] },
  { out: [I.AZURE_INGOT, 1], in: [[B.AZURE_ORE, 1], ['wood', 1]] },
  { out: [I.IRON_PICK, 1], in: [[I.STICK, 1], [I.IRON_INGOT, 2]] },
  { out: [I.IRON_AXE, 1], in: [[I.STICK, 1], [I.IRON_INGOT, 3]] },
  { out: [I.CRIMSON_PICK, 1], in: [[I.STICK, 1], [I.CRIMSON_INGOT, 2]] },
  { out: [I.CRIMSON_AXE, 1], in: [[I.STICK, 1], [I.CRIMSON_INGOT, 3]] },
  { out: [I.TITAN_HAMMER, 1], in: [[I.HAMMER, 1], [I.CRIMSON_INGOT, 3], [I.AZURE_INGOT, 3]] },
  { out: [I.COMPASS, 1], in: [[I.IRON_INGOT, 3], [I.CRIMSON_INGOT, 1]] },
  { out: [I.CARTOGRAPH, 1], in: [[I.IRON_INGOT, 2], [B.GLASS, 1], [I.STICK, 1]] },
  { out: [I.GLASSES, 1], in: [[I.RED_LENS, 1], [I.GREEN_LENS, 1], [I.BLUE_LENS, 1], [B.DUSK_WOOD, 2]] },
  { out: [I.FLASK, 1], in: [[B.GLASS, 2]] },
  { out: [I.HEALTH_POTION, 1], in: [[I.FLASK, 1], [B.CACTUS, 2]] },
];

// Drops for breaking a block with a given held item id. Returns [[id,count],...]
export function dropsFor(blockId, heldId, rng) {
  const b = BLOCKS[blockId];
  const dirtLike = blockId === B.GRASS || blockId === B.DIRT || blockId === B.DUSK_GRASS || blockId === B.DUSK_SOIL || blockId === B.SNOW;
  if (heldId === I.STICK && dirtLike) return rng() < 0.5 ? [[I.ROCK, 1]] : [];
  if (b.leaf) return rng() < 0.35 ? [[I.STICK, 1 + (rng() < 0.3 ? 1 : 0)]] : [];
  if (!b.drop) return [];
  return [[b.drop, 1]];
}
