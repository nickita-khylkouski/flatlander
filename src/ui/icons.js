// Procedural pixel-art icons for every block and item (16x16, drawn into data URLs).
import { BLOCKS, ITEMS, I, P } from '../world/blocks.js';
import { mulberry32 } from '../world/noise.js';

const cache = new Map();
const css = (c, k = 1) => `rgb(${Math.round(Math.min(1, c[0] * k) * 255)},${Math.round(Math.min(1, c[1] * k) * 255)},${Math.round(Math.min(1, c[2] * k) * 255)})`;

function px(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }

function drawBlock(ctx, b) {
  const rng = mulberry32(b.id * 977);
  // isometric-ish cube: top rhombus + two side faces, pixel by pixel
  const top = (b.pat === P.TOP || b.pat === P.LEAF) ? b.col2 : b.col;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const cx = x - 7.5, cy = y;
    // top face: |cx|/2 + |cy-4| <= 4
    const inTop = Math.abs(cx) / 2 + Math.abs(cy - 4) <= 4.0;
    const edge = 8 - Math.abs(cx) / 2;
    const inSide = !inTop && Math.abs(cx) <= 8 && cy >= edge && cy <= edge + 7.9;
    if (!inTop && !inSide) continue;
    const r = rng();
    let c, k;
    if (inTop) {
      c = top; k = 1.05;
      if (b.pat === P.ORE && r > 0.7) c = b.col; else if (b.pat === P.ORE) c = b.col2;
      if (b.pat === P.WOOD) c = (Math.abs(cx) / 2 + Math.abs(cy - 4) < 2.2) ? b.col : b.col2;
    } else {
      const left = cx < 0;
      k = left ? 0.82 : 0.62;
      c = b.col;
      if (b.pat === P.TOP && cy - edge < 2.2 + (r > 0.6 ? 1 : 0)) c = b.col2;
      if (b.pat === P.ORE) c = r > 0.7 ? b.col : b.col2;
      if (b.pat === P.WOOD) c = b.col2;
      if (b.pat === P.LAYER && (cy % 3 === 0)) c = b.col2;
      if (b.pat === P.LEAF) c = r > 0.5 ? b.col : b.col2;
    }
    if (b.pat === P.NOISE || b.pat === P.BEDROCK) c = r > 0.72 ? b.col2 : b.col;
    if (b.pat === P.LEAF && r < 0.12) continue;
    let alpha = 1;
    if (b.pat === P.WATER) alpha = 0.7;
    if (b.pat === P.GLASS) alpha = (x === 0 || x === 15 || y === 0 || r > 0.85) ? 0.9 : 0.25;
    ctx.globalAlpha = alpha;
    px(ctx, x, y, css(c, k * (0.92 + r * 0.16)));
  }
  ctx.globalAlpha = 1;
  if (b.pat === P.CHEST) { ctx.fillStyle = '#f0c850'; ctx.fillRect(7, 8, 2, 3); }
}

function drawTorch(ctx) {
  ctx.fillStyle = '#7a5232'; ctx.fillRect(7, 6, 2, 9);
  ctx.fillStyle = '#ffd040'; ctx.fillRect(6, 2, 4, 4);
  ctx.fillStyle = '#fff6b0'; ctx.fillRect(7, 3, 2, 2);
}

function line(ctx, x0, y0, x1, y1, col, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  ctx.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    ctx.fillRect(x, y, w, w);
  }
}

const MAT = { iron: ['#d8d8e0', '#8a8a98'], crimson: ['#ff3a62', '#8a1030'], azure: ['#5af0e0', '#108a80'], stone: ['#9a9aa2', '#5a5a64'] };

function drawItem(ctx, id) {
  const handle = (len = 12) => line(ctx, 3, 14, 3 + len * 0.7, 14 - len * 0.7, '#8a5a30', 2);
  switch (id) {
    case I.STICK: line(ctx, 3, 13, 12, 3, '#9a6a3a', 2); px(ctx, 8, 7, '#6a4422'); break;
    case I.ROCK:
      ctx.fillStyle = '#6a6a72'; ctx.fillRect(3, 6, 10, 7); ctx.fillRect(5, 4, 6, 10);
      ctx.fillStyle = '#9a9aa4'; ctx.fillRect(5, 6, 4, 3); break;
    case I.PHASE_SILK:
      for (let k = 0; k < 3; k++) for (let x = 2; x < 14; x++) px(ctx, x, 5 + k * 3 + Math.round(Math.sin(x * 0.9 + k) * 1.2), k === 1 ? '#e0d8ff' : '#ffffff');
      break;
    case I.HAMMER: handle(11); ctx.fillStyle = MAT.stone[1]; ctx.fillRect(7, 1, 7, 6); ctx.fillStyle = MAT.stone[0]; ctx.fillRect(8, 2, 5, 3); line(ctx, 9, 7, 12, 4, '#e8e0ff'); break;
    case I.TITAN_HAMMER: handle(11); ctx.fillStyle = MAT.azure[1]; ctx.fillRect(6, 0, 9, 7); ctx.fillStyle = MAT.crimson[0]; ctx.fillRect(7, 1, 7, 2); ctx.fillStyle = MAT.azure[0]; ctx.fillRect(7, 4, 7, 2); break;
    case I.IRON_INGOT: case I.CRIMSON_INGOT: case I.AZURE_INGOT: {
      const m = MAT[id === I.IRON_INGOT ? 'iron' : id === I.CRIMSON_INGOT ? 'crimson' : 'azure'];
      for (let k = 0; k < 2; k++) {
        const oy = 9 - k * 5, ox = 2 + k * 3;
        ctx.fillStyle = m[1]; ctx.fillRect(ox, oy, 10, 4);
        ctx.fillStyle = m[0]; ctx.fillRect(ox + 1, oy, 8, 2);
      }
      break;
    }
    case I.IRON_PICK: case I.CRIMSON_PICK: {
      const m = MAT[id === I.IRON_PICK ? 'iron' : 'crimson'];
      handle(12);
      for (let i = 0; i < 12; i++) { const a = -0.3 + i * 0.16; px(ctx, Math.round(8 + Math.cos(a + 2.3) * 6 + 4), Math.round(8 - Math.sin(a + 2.3) * 6 - 2), m[0]); }
      line(ctx, 4, 2, 9, 1, m[0], 2); line(ctx, 9, 1, 14, 6, m[1], 2);
      break;
    }
    case I.IRON_AXE: case I.CRIMSON_AXE: {
      const m = MAT[id === I.IRON_AXE ? 'iron' : 'crimson'];
      handle(12);
      ctx.fillStyle = m[1]; ctx.fillRect(9, 1, 5, 7); ctx.fillStyle = m[0]; ctx.fillRect(12, 0, 3, 9);
      break;
    }
    case I.HEALTH_POTION: case I.FLASK: {
      ctx.fillStyle = '#cfe8ff'; ctx.fillRect(6, 1, 4, 4); ctx.fillRect(3, 5, 10, 9); ctx.fillRect(4, 14, 8, 1);
      if (id === I.HEALTH_POTION) { ctx.fillStyle = '#e8203c'; ctx.fillRect(4, 8, 8, 6); ctx.fillStyle = '#ff7080'; ctx.fillRect(5, 8, 2, 2); }
      else { ctx.fillStyle = '#9ac8f0'; line(ctx, 10, 3, 13, 1, '#cfe8ff'); line(ctx, 13, 1, 13, 9, '#cfe8ff'); }
      ctx.fillStyle = '#7a5232'; ctx.fillRect(6, 0, 4, 2);
      break;
    }
    case I.RED_LENS: case I.GREEN_LENS: case I.BLUE_LENS: {
      const c = id === I.RED_LENS ? ['#ff4050', '#ffb0b8'] : id === I.GREEN_LENS ? ['#40e060', '#b8ffc8'] : ['#4080ff', '#b0d0ff'];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d < 6.5) px(ctx, x, y, d > 5.3 ? '#d0c090' : (x < 7 && y < 7 ? c[1] : c[0]));
      }
      break;
    }
    case I.GLASSES: {
      const cs = ['#ff4050', '#40e060', '#4080ff'];
      for (let k = 0; k < 3; k++) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - (3 + k * 5), y - 8);
        if (d < 2.6) px(ctx, x, y, d > 2 ? '#2a2040' : cs[k]);
      }
      line(ctx, 0, 6, 1, 7, '#2a2040'); line(ctx, 15, 6, 14, 7, '#2a2040');
      break;
    }
    case I.COMPASS: {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d < 7) px(ctx, x, y, d > 5.8 ? '#8a1030' : '#e8e4d8');
      }
      line(ctx, 8, 3, 8, 8, '#e8203c', 1); line(ctx, 8, 8, 8, 12, '#404050', 1); px(ctx, 8, 8, '#000');
      line(ctx, 4, 8, 12, 8, '#5af0e0');
      break;
    }
    case I.CARTOGRAPH: {
      ctx.fillStyle = '#c89a40'; ctx.fillRect(1, 9, 14, 3);
      ctx.fillStyle = '#e8c060'; ctx.fillRect(1, 9, 14, 1);
      ctx.fillStyle = '#8a6a20'; ctx.fillRect(2, 3, 2, 6); ctx.fillRect(12, 3, 2, 6);
      px(ctx, 2, 4, '#cfe8ff'); px(ctx, 13, 4, '#cfe8ff');
      for (let x = 3; x < 14; x += 2) px(ctx, x, 11, '#5a4010');
      break;
    }
    default: ctx.fillStyle = '#f0f'; ctx.fillRect(4, 4, 8, 8);
  }
}

export function iconURL(id) {
  if (cache.has(id)) return cache.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  if (BLOCKS[id] && id < 100) {
    if (BLOCKS[id].pat === P.TORCH) drawTorch(ctx); else drawBlock(ctx, BLOCKS[id]);
  } else if (ITEMS[id]) drawItem(ctx, id);
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}

// For canvases (held item rendering)
const imgCache = new Map();
export function iconImage(id) {
  if (imgCache.has(id)) return imgCache.get(id);
  const img = new Image();
  img.src = iconURL(id);
  imgCache.set(id, img);
  return img;
}
