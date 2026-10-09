// HUD widgets drawn on 2D canvases: slice gauge, compass, cartograph minimap + survey map.
import { SEA } from '../world/world.js';
import { B, BLOCKS, I } from '../world/blocks.js';

const $ = (id) => document.getElementById(id);

export function drawGauge(game, g) {
  const th = game.player.theta;
  const r = 30, cx = 54, cy = game.split ? 150 : game.H - 60;
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(cx, cy, r + 8, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); g.lineTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4)); g.stroke(); }
  const off = ((th % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  const aligned = Math.min(off, Math.PI / 2 - off) < 0.01;
  g.strokeStyle = aligned ? '#7f7' : '#ffd84a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx - Math.cos(th) * r, cy - Math.sin(th) * r); g.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r); g.stroke();
  g.fillStyle = '#fff'; g.font = '10px ui-monospace, monospace'; g.textAlign = 'center';
  const deg = Math.round(Math.min(off, Math.PI / 2 - off) * 180 / Math.PI);
  g.fillText(aligned ? 'aligned' : `${deg}° off-axis`, cx, cy + r + 20);
  g.restore();
}

export function drawCompass(game, c) {
  const g = c.getContext('2d'), p = game.player;
  const W = c.width, cx = W / 2, cy = 76, r = 58;
  g.clearRect(0, 0, W, W);
  g.fillStyle = 'rgba(10,8,16,0.75)'; g.beginPath(); g.arc(cx, cy, r + 10, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8a1030'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#ddd'; g.font = 'bold 12px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', cx, cy - r + 4); g.fillText('S', cx, cy + r - 4); g.fillText('E', cx + r - 6, cy); g.fillText('W', cx - r + 6, cy);
  // slice line (x = east, z = south)
  const [fx, fz] = game.dirv;
  g.strokeStyle = '#5af0e0'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx - fx * (r - 14), cy - fz * (r - 14)); g.lineTo(cx + fx * (r - 14), cy + fz * (r - 14)); g.stroke();
  // facing arrow
  const s = p.facing;
  g.fillStyle = '#ffd84a';
  const ax = cx + fx * s * (r - 14), ay = cy + fz * s * (r - 14);
  g.beginPath(); g.arc(ax, ay, 5, 0, Math.PI * 2); g.fill();
  // "into the screen" normal
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + fz * 26, cy - fx * 26); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#fff'; g.font = '11px ui-monospace, monospace';
  g.fillText(`X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}`, cx, 158);
  g.fillText(`Z ${p.z.toFixed(1)}  θ ${(((p.theta * 180 / Math.PI) % 360 + 360) % 360).toFixed(0)}°`, cx, 172);
}

function columnColor(game, x, z) {
  const w = game.world;
  if (!w.hasChunk(x >> 4, z >> 4)) return null;
  const top = w.topY(x, z);
  const wat = w.getBlock(x, SEA, z);
  if (top <= SEA && (wat === B.WATER || wat === B.ICE)) {
    const d = SEA - top;
    return wat === B.ICE ? [200, 225, 250] : [40 - d, 100 - d * 3, 210 - d * 4];
  }
  let id = w.getBlock(x, top - 1, z);
  const abv = w.getBlock(x, top, z);
  if (BLOCKS[abv].leaf) id = abv;
  const b = BLOCKS[id] || BLOCKS[B.STONE];
  const c = (b.pat === 2 || b.leaf) ? b.col2 : b.col;
  const k = 0.6 + (top - 30) / 80;
  return [c[0] * 255 * k, c[1] * 255 * k, c[2] * 255 * k];
}

export function drawMiniMap(game, c) {
  const g = c.getContext('2d'), p = game.player, N = 90;
  const img = g.createImageData(N, N);
  const x0 = Math.floor(p.x) - N / 2, z0 = Math.floor(p.z) - N / 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const col = columnColor(game, x0 + i, z0 + j) || [0, 0, 0];
    const o = (j * N + i) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  if (!game._mmc) { game._mmc = document.createElement('canvas'); game._mmc.width = game._mmc.height = N; }
  game._mmc.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(game._mmc, 0, 0, c.width, c.height);
  mapOverlay(game, g, c.width / N, c.width / 2, c.height / 2, N);
}

export function drawBigMap(game) {
  const c = $('bigmapc'), g = c.getContext('2d'), p = game.player, N = 256;
  const img = g.createImageData(N, N);
  const x0 = Math.floor(p.x) - N / 2, z0 = Math.floor(p.z) - N / 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const col = columnColor(game, x0 + i, z0 + j) || [8, 8, 12];
    const o = (j * N + i) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  if (!game._bmc) { game._bmc = document.createElement('canvas'); game._bmc.width = game._bmc.height = N; }
  game._bmc.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(game._bmc, 0, 0, c.width, c.height);
  mapOverlay(game, g, c.width / N, c.width / 2, c.height / 2, N);
}

function mapOverlay(game, g, k, cx, cy, N) {
  const [fx, fz] = game.dirv, p = game.player;
  const L = N * k;
  g.strokeStyle = '#5af0e0'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - fx * L, cy - fz * L); g.lineTo(cx + fx * L, cy + fz * L); g.stroke();
  // visible part of the slice
  const vu = game.vw / 2 / game.scale;
  g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx - fx * vu * k, cy - fz * vu * k); g.lineTo(cx + fx * vu * k, cy + fz * vu * k); g.stroke();
  g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(cx, cy, Math.max(3, k * 1.5), 0, Math.PI * 2); g.fill();
  // spawn marker
  const sx = cx + (game.spawn[0] - p.x) * k, sz = cy + (game.spawn[2] - p.z) * k;
  g.strokeStyle = '#ff5a6a'; g.lineWidth = 2; g.strokeRect(sx - 3, sz - 3, 6, 6);
  if (game.inv.hasInHotbar(I.GLASSES)) for (const m of game.mobs) {
    g.fillStyle = m.T.hostile ? '#f46' : '#7ff';
    g.fillRect(cx + (m.x - p.x) * k - 1.5, cy + (m.z - p.z) * k - 1.5, 3, 3);
  }
}
