// GLSL sources. All views sample one toroidal 128-wide R8UI 3D texture of block ids around the player.
import { NUM_BLOCK_SLOTS } from '../world/blocks.js';
import { CS, WH } from '../world/world.js';

export const RS = 128;            // region size in x/z (8 chunks)
export const RC = RS / CS;        // region size in chunks
export const MAX_TORCH = 32;
export const MAX_SPH = 48;

export const COMMON = `#version 300 es
precision highp float; precision highp int;
precision highp usampler3D; precision highp usampler2D;
uniform usampler3D uVox;
uniform usampler2D uHgt;
uniform ivec2 uOrg;
uniform float uTime;
uniform float uDay;
uniform vec3 uBC[${NUM_BLOCK_SLOTS}];
uniform vec3 uBC2[${NUM_BLOCK_SLOTS}];
uniform int uBP[${NUM_BLOCK_SLOTS}];
uniform vec4 uTorch[${MAX_TORCH}];
uniform int uNT;
uniform vec3 uPlayer;

int vox(ivec3 p){
  if(p.y < 0) return 22;
  if(p.y >= ${WH}) return 0;
  ivec2 q = p.xz - uOrg;
  if(q.x < 0 || q.y < 0 || q.x >= ${RS} || q.y >= ${RS}) return 0;
  return int(texelFetch(uVox, ivec3((p.x + 1048576) & ${RS - 1}, p.y, (p.z + 1048576) & ${RS - 1}), 0).r);
}
float hgt(ivec2 p){
  ivec2 q = p - uOrg;
  if(q.x < 0 || q.y < 0 || q.x >= ${RS} || q.y >= ${RS}) return 0.0;
  return float(texelFetch(uHgt, ivec2((p.x + 1048576) & ${RS - 1}, (p.y + 1048576) & ${RS - 1}), 0).r);
}
float hi(ivec3 p){
  uint h = uint(p.x) * 73856093u ^ uint(p.y) * 19349663u ^ uint(p.z) * 83492791u;
  h ^= h >> 13; h *= 1274126177u; h ^= h >> 16;
  return float(h & 0xffffu) / 65535.0;
}
float skyAt(vec3 wp){
  ivec2 c = ivec2(floor(wp.xz));
  float best = 0.0;
  for(int dz = -1; dz <= 1; dz++) for(int dx = -1; dx <= 1; dx++){
    float d = hgt(c + ivec2(dx, dz)) - wp.y;
    float pen = float(abs(dx) + abs(dz)) * 0.18;
    best = max(best, clamp(1.0 - max(d, 0.0) * 0.13 - pen, 0.0, 1.0));
  }
  return best;
}
vec3 lightFrom(vec3 wp, float s){
  vec3 L = vec3(max(s * uDay, 0.05));
  L *= mix(vec3(0.55, 0.62, 1.0), vec3(1.0), smoothstep(0.15, 0.6, uDay));
  vec3 warm = vec3(0.0);
  for(int i = 0; i < ${MAX_TORCH}; i++){
    if(i >= uNT) break;
    vec3 dv = wp - uTorch[i].xyz;
    float d2 = dot(dv, dv);
    if(d2 >= 81.0) continue;
    float l = 1.0 - sqrt(d2) / 9.0;
    warm += vec3(1.0, 0.78, 0.5) * l * l * uTorch[i].w;
  }
  float pd = distance(wp, uPlayer + vec3(0.0, 0.9, 0.0));
  warm += vec3(0.42, 0.4, 0.36) * clamp(1.0 - pd / 6.5, 0.0, 1.0);
  return min(L + warm, vec3(1.25));
}
vec3 lightAt(vec3 wp){ return lightFrom(wp, skyAt(wp)); }
// Solid 3D texture for each block type. Returns rgb; alpha in a; emissive in e.
vec3 blockCol(int id, vec3 wp, out float a, out float e){
  a = 1.0; e = 0.0;
  vec3 cell = floor(wp);
  vec3 l = wp - cell;
  ivec3 ci = ivec3(cell);
  ivec3 tx = ivec3(floor(l * 8.0));
  float r = hi(ci * 8 + tx);
  vec3 A = uBC[id], Bc = uBC2[id];
  int pat = uBP[id];
  vec3 col = A;
  if(pat == 1){ // noise
    col = mix(A, Bc, step(0.72, r)) * (0.9 + 0.18 * hi(ci * 8 + tx + 11));
  } else if(pat == 2){ // top layer (grass / snow)
    float edge = 0.74 - 0.13 * hi(ci * 8 + ivec3(tx.x, 0, tx.z));
    col = l.y > edge ? Bc * (0.9 + 0.18 * r) : A * (0.88 + 0.2 * r);
  } else if(pat == 3){ // wood: rings around the log axis
    float d = length(l.xz - 0.5);
    if(d > 0.43) col = Bc * (0.8 + 0.4 * hi(ivec3(ci.x * 8 + tx.x, 0, ci.z * 8 + tx.z)));
    else { float ring = fract(d * 7.0 + 0.15 * r); col = mix(A, A * 0.72, step(0.55, ring)) * (0.95 + 0.1 * r); }
  } else if(pat == 4){ // leaves
    col = mix(A, Bc, r) * (0.85 + 0.25 * hi(ci * 8 + tx + 5));
    if(r < 0.16) a = 0.0;
  } else if(pat == 5){ // ore
    float blob = hi(ci * 4 + tx / 2);
    col = blob > 0.62 ? A * (0.85 + 0.3 * r) : Bc * (0.9 + 0.15 * r);
  } else if(pat == 6){ // water
    float w = 0.5 + 0.5 * sin(uTime * 1.6 + wp.x * 1.3 + wp.z * 1.1 + wp.y * 2.0);
    col = mix(A, Bc, w * 0.35); a = 0.55;
  } else if(pat == 7){ // lava
    float w = 0.5 + 0.5 * sin(uTime * 2.2 + l.x * 6.0 + l.z * 5.0 + l.y * 4.0 + r * 3.0);
    col = mix(A, Bc, w); e = 1.0;
  } else if(pat == 8){ // glass
    float ed = min(min(l.y, 1.0 - l.y), min(min(l.x, 1.0 - l.x), min(l.z, 1.0 - l.z)));
    bool frame = min(l.y, 1.0 - l.y) < 0.07;
    col = A; a = frame ? 0.85 : 0.14;
    if(!frame && abs(fract(l.y * 0.7 + l.x * 0.7) - 0.3) < 0.05) a = 0.45;
  } else if(pat == 9){ // chest
    col = mix(A, Bc, step(0.5, fract(l.y * 4.0))) * (0.92 + 0.12 * r);
    vec3 m = abs(l - 0.5);
    if(max(max(m.x, m.z), m.y) > 0.44) col = Bc * 0.8;
    if(abs(l.y - 0.62) < 0.035) col = Bc * 0.7;
    if(abs(l.y - 0.55) < 0.12 && length(l.xz - 0.5) < 0.12) col = vec3(0.95, 0.8, 0.3);
  } else if(pat == 10){ // torch: only visible where the slice passes near its center
    float d = length(l.xz - 0.5);
    if(d < 0.075 && l.y < 0.62) col = A;
    else if(length(vec3(l.x - 0.5, (l.y - 0.7) * 0.8, l.z - 0.5)) < 0.12 + 0.02 * sin(uTime * 13.0)) { col = mix(Bc, vec3(1.0, 1.0, 0.7), 0.4); e = 1.0; }
    else a = 0.0;
  } else if(pat == 11){ // layered sandstone
    col = mix(A, Bc, step(0.5, fract(l.y * 3.0 + 0.1 * r))) * (0.92 + 0.12 * r);
  } else if(pat == 12){ // cactus: ribs around axis
    float ang = atan(l.z - 0.5, l.x - 0.5);
    float rib = 0.5 + 0.5 * cos(ang * 8.0);
    col = mix(Bc, A, rib) * (0.9 + 0.15 * r);
    if(r > 0.93) col = vec3(0.95, 0.92, 0.7);
  } else if(pat == 13){ // ice
    col = mix(A, Bc, step(0.8, fract((l.x + l.z) * 1.5 + l.y))) ; a = 0.82;
  } else if(pat == 14){ // bedrock
    col = mix(A, Bc, step(0.55, r)) * (0.8 + 0.3 * hi(ci * 8 + tx + 3));
  }
  return col;
}
`;

export const VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const SLICE_FS = COMMON + `
uniform vec2 uRes;
uniform vec3 uCam;
uniform vec2 uDir;
uniform float uScale;
uniform int uHaze;
uniform vec2 uSun;
uniform float uSunUp;
out vec4 outColor;

vec3 skyCol(vec2 sp){
  float hgtN = sp.y / uRes.y;
  vec3 dayTop = vec3(0.36, 0.62, 0.98), dayHor = vec3(0.72, 0.86, 1.0);
  vec3 nTop = vec3(0.015, 0.02, 0.06), nHor = vec3(0.06, 0.08, 0.17);
  vec3 top = mix(nTop, dayTop, uDay), hor = mix(nHor, dayHor, uDay);
  vec3 c = mix(hor, top, smoothstep(0.0, 1.0, hgtN));
  float dusk = clamp(1.0 - abs(uDay - 0.45) * 3.0, 0.0, 1.0);
  c = mix(c, vec3(1.0, 0.55, 0.3), dusk * 0.35 * (1.0 - hgtN));
  // sun + moon
  float ds = distance(sp, uSun * uRes);
  float rad = uRes.y * 0.05;
  if(uSunUp > 0.0){ c += vec3(1.0, 0.95, 0.7) * smoothstep(rad, rad * 0.85, ds); c += vec3(1.0, 0.8, 0.5) * 0.25 * exp(-ds / (rad * 3.0)); }
  else {
    c = mix(c, vec3(0.9, 0.92, 1.0), smoothstep(rad * 0.8, rad * 0.7, ds));
    vec2 g = floor(sp / 3.0);
    float st = hi(ivec3(int(g.x), int(g.y), 7));
    if(st > 0.997) c += vec3(0.8) * (1.0 - uDay) * (0.6 + 0.4 * sin(uTime * 3.0 + st * 100.0));
  }
  return c;
}

void main(){
  vec2 sp = gl_FragCoord.xy;
  float u = (sp.x - uRes.x * 0.5) / uScale;
  float v = (sp.y - uRes.y * 0.5) / uScale;
  vec3 f = vec3(uDir.x, 0.0, uDir.y);
  vec3 wp = uCam + f * u + vec3(0.0, v, 0.0);
  ivec3 c = ivec3(floor(wp));
  int id = vox(c);

  // background: sky above ground, cave behind
  float sk = skyAt(wp);
  vec3 L = lightFrom(wp, sk);
  vec3 bg = skyCol(sp);
  vec3 caveBack = vec3(0.16, 0.13, 0.12) * (0.85 + 0.2 * hi(ivec3(floor(wp * 4.0)))) * L;
  bg = mix(caveBack, bg, smoothstep(0.55, 0.95, sk));
  if(uHaze == 1){
    // peek a little "into the screen" (the flatlander can't, but it helps you think in 3D)
    vec3 nIn = vec3(uDir.y, 0.0, -uDir.x);
    for(int i = 1; i <= 16; i++){
      float t = float(i) * 0.3;
      vec3 q = wp + nIn * t;
      int qid = vox(ivec3(floor(q)));
      if(qid != 0 && uBP[qid] != 6 && uBP[qid] != 10){
        float qa, qe;
        vec3 qc = blockCol(qid, q, qa, qe) * lightAt(q);
        float k = (0.3 - t * 0.055) * qa;
        bg = mix(bg, mix(qc, bg, 0.35) * 0.6, clamp(k, 0.0, 1.0));
        break;
      }
    }
  }

  vec3 col = bg;
  if(id != 0){
    float a, e;
    vec3 bc = blockCol(id, wp, a, e);
    bc = mix(bc * L, bc, e);
    // cell edges: where the cross-section of one voxel meets another
    if(a > 0.0 && uBP[id] != 6){
      float px = 1.25 / uScale;
      float edge = 0.0;
      ivec3 n1 = ivec3(floor(wp + f * px)), n2 = ivec3(floor(wp - f * px));
      ivec3 n3 = ivec3(floor(wp + vec3(0.0, px, 0.0))), n4 = ivec3(floor(wp - vec3(0.0, px, 0.0)));
      if(n1 != c){ int o = vox(n1); edge = max(edge, (o == 0 || uBP[o] == 6) ? 1.0 : (o != id ? 0.6 : 0.3)); }
      if(n2 != c){ int o = vox(n2); edge = max(edge, (o == 0 || uBP[o] == 6) ? 1.0 : (o != id ? 0.6 : 0.3)); }
      if(n3 != c){ int o = vox(n3); edge = max(edge, (o == 0 || uBP[o] == 6) ? 1.0 : (o != id ? 0.6 : 0.3)); }
      if(n4 != c){ int o = vox(n4); edge = max(edge, (o == 0 || uBP[o] == 6) ? 1.0 : (o != id ? 0.6 : 0.3)); }
      bc *= 1.0 - edge * 0.35;
    }
    col = mix(bg, bc, a);
  }
  outColor = vec4(col, 1.0);
}
`;

export const INSET_FS = COMMON + `
uniform vec4 uVP;        // viewport x,y,w,h in device px
uniform vec3 uCamPos, uCF, uCR, uCU;
uniform vec2 uDir;
uniform vec4 uSph[${MAX_SPH}];
uniform vec3 uSphC[${MAX_SPH}];
uniform int uNS;
out vec4 outColor;
const float R = 10.5;

void main(){
  vec2 uv = (gl_FragCoord.xy - uVP.xy) / uVP.zw * 2.0 - 1.0;
  uv.x *= uVP.z / uVP.w;
  vec3 rd = normalize(uCF + uv.x * uCR * 0.62 + uv.y * uCU * 0.62);
  rd += vec3(equal(rd, vec3(0.0))) * 1e-5;
  vec3 ro = uCamPos;
  vec3 f = vec3(uDir.x, 0.0, uDir.y);
  vec3 nOut = vec3(-uDir.y, 0.0, uDir.x);       // toward the viewer of the 2D slice
  vec3 ctr = uPlayer + vec3(0.0, 0.8, 0.0);
  vec3 bgc = mix(vec3(0.05, 0.06, 0.1), vec3(0.11, 0.14, 0.22), uv.y * 0.5 + 0.5);
  outColor = vec4(bgc, 0.92);

  // clip sphere
  vec3 oc = ro - ctr;
  float b = dot(oc, rd), cc = dot(oc, oc) - R * R, disc = b * b - cc;
  if(disc < 0.0) return;
  float sq = sqrt(disc);
  float t0 = -b - sq, t1 = -b + sq;
  // half-space: keep dot(p - player, nOut) <= 0 (the side behind the slice)
  float pn = dot(ro - uPlayer, nOut), dn = dot(rd, nOut);
  float tp = abs(dn) > 1e-5 ? -pn / dn : 1e9;
  bool planeEntry = false;
  if(pn > 0.0){ if(dn >= 0.0) return; if(tp > t0){ t0 = tp; planeEntry = true; } }
  else if(dn > 0.0) t1 = min(t1, tp);
  if(t0 > t1) return;
  t0 = max(t0, 0.0);

  // DDA
  vec3 p = ro + rd * (t0 + 1e-4);
  ivec3 cell = ivec3(floor(p));
  ivec3 st = ivec3(sign(rd));
  vec3 tD = abs(1.0 / rd);
  vec3 tM = (vec3(cell) + max(vec3(st), 0.0) - p) / rd + t0;
  float t = t0;
  int face = -1; // -1 = entry surface
  vec3 hitCol = vec3(0.0); bool hit = false; float hitT = 1e9;
  vec4 water = vec4(0.0);
  for(int i = 0; i < 90; i++){
    if(t > t1) break;
    int id = vox(cell);
    if(id != 0){
      float a, e;
      vec3 hp = ro + rd * (t + 1e-3);
      if(uBP[id] == 6){ water = vec4(uBC[id], min(1.0, water.a + 0.15)); }
      else {
        vec3 bc = blockCol(id, hp, a, e);
        if(a > 0.05){
          vec3 n = face == 0 ? vec3(-float(st.x),0,0) : face == 1 ? vec3(0,-float(st.y),0) : face == 2 ? vec3(0,0,-float(st.z)) : vec3(0.0);
          float sh;
          if(face == -1 && planeEntry){ sh = 1.15; }
          else if(face == -1){ sh = 0.45; }
          else sh = 0.55 + 0.45 * max(0.0, dot(n, normalize(vec3(0.4, 0.9, 0.25)))) + 0.1 * n.y;
          vec3 L = lightAt(hp + n * 0.05);
          hitCol = mix(bc * L, bc, e) * sh;
          if(face == -1 && planeEntry){
            vec3 l = fract(hp);
            float ed = min(min(l.y, 1.0 - l.y), 1.0);
            hitCol = mix(hitCol, vec3(0.3, 1.0, 1.0), 0.18 + (ed < 0.05 ? 0.3 : 0.0));
          }
          hit = true; hitT = t; break;
        }
      }
    }
    if(tM.x < tM.y && tM.x < tM.z){ t = tM.x; tM.x += tD.x; cell.x += st.x; face = 0; }
    else if(tM.y < tM.z){ t = tM.y; tM.y += tD.y; cell.y += st.y; face = 1; }
    else { t = tM.z; tM.z += tD.z; cell.z += st.z; face = 2; }
  }

  // spheres (creatures)
  for(int i = 0; i < ${MAX_SPH}; i++){
    if(i >= uNS) break;
    vec3 so = ro - uSph[i].xyz;
    float sb = dot(so, rd), sc = dot(so, so) - uSph[i].w * uSph[i].w, sd = sb * sb - sc;
    if(sd < 0.0) continue;
    float ts = -sb - sqrt(sd);
    if(ts > 0.0 && ts < hitT && distance(ro + rd * ts, ctr) < R){
      vec3 n = normalize(ro + rd * ts - uSph[i].xyz);
      hitCol = uSphC[i] * (0.45 + 0.65 * max(0.0, dot(n, normalize(vec3(0.4, 0.9, 0.25)))));
      hitT = ts; hit = true;
    }
  }

  // the slice plane + the flatlander on it
  vec3 col = hit ? hitCol : bgc;
  if(tp > 0.0 && tp < hitT){
    vec3 pp = ro + rd * tp;
    if(distance(pp, ctr) < R){
      vec3 d = pp - uPlayer;
      float u = dot(d, f), v = d.y;
      if(abs(u) < 0.3 && v > 0.0 && v < 1.7){ col = vec3(1.0, 0.85, 0.2); hit = true; }
      else {
        col = mix(col, vec3(0.2, 0.9, 1.0), 0.16);
        if(fract(u) < 0.04 || fract(v) < 0.04) col = mix(col, vec3(0.4, 1.0, 1.0), 0.12);
        hit = true;
      }
    }
  }
  col = mix(col, water.rgb, water.a);
  outColor = vec4(col, hit ? 1.0 : 0.92);
}
`;


// Educational split view: a fixed box of the real 3D world 
// the slice drawn as a translucent sheet, and the cut outline where it meets the terrain.
export const DIORAMA_FS = COMMON + `
uniform vec4 uVP;
uniform vec3 uCamPos, uCF, uCR, uCU;
uniform float uFov;
uniform float uShift;
uniform vec2 uDir;
uniform vec3 uBoxMin, uBoxMax;
uniform vec4 uPlaneExt;   // u0 u1 y0 y1
uniform vec4 uViewWin;    // u0 u1 y0 y1 (what the 2D view shows)
uniform ivec3 uHover;
uniform int uHasHover;
uniform vec4 uSph[${MAX_SPH}];
uniform vec3 uSphC[${MAX_SPH}];
uniform int uNS;
out vec4 outColor;

bool solidAt(vec3 p){
  int id = vox(ivec3(floor(p)));
  return id != 0 && uBP[id] != 6 && uBP[id] != 10;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - uVP.xy) / uVP.zw * 2.0 - 1.0;
  uv.x *= uVP.z / uVP.w;
  vec3 rd = normalize(uCF + (uv.x * uCR + (uv.y - uShift) * uCU) * uFov);
  rd += vec3(equal(rd, vec3(0.0))) * 1e-5;
  vec3 ro = uCamPos;
  vec3 f = vec3(uDir.x, 0.0, uDir.y), nOut = vec3(-uDir.y, 0.0, uDir.x);
  float day = max(uDay, 0.55);
  vec3 col = mix(mix(vec3(0.06, 0.08, 0.17), vec3(0.62, 0.78, 0.98), day), mix(vec3(0.015, 0.02, 0.06), vec3(0.32, 0.55, 0.95), day), clamp(uv.y * 0.5 + 0.5, 0.0, 1.0));
  float hitT = 1e9;
  float pxW = 2.0 * uFov / uVP.w;   // tangent size of one pixel

  vec3 inv = 1.0 / rd;
  vec3 ta = (uBoxMin - ro) * inv, tb = (uBoxMax - ro) * inv;
  vec3 tmn = min(ta, tb), tmx = max(ta, tb);
  float t0 = max(max(tmn.x, tmn.y), tmn.z), t1 = min(min(tmx.x, tmx.y), tmx.z);
  vec4 water = vec4(0.0);
  if(t1 > max(t0, 0.0)){
    int face = (tmn.x > tmn.y && tmn.x > tmn.z) ? 0 : (tmn.y > tmn.z ? 1 : 2);
    t0 = max(t0, 0.0);
    vec3 p = ro + rd * (t0 + 1e-4);
    ivec3 cell = ivec3(floor(p));
    ivec3 st = ivec3(sign(rd));
    vec3 tD = abs(inv);
    vec3 tM = (vec3(cell) + max(vec3(st), 0.0) - p) * inv + t0;
    float t = t0;
    for(int i = 0; i < 220; i++){
      if(t > t1) break;
      int id = vox(cell);
      if(id != 0){
        vec3 hp = ro + rd * (t + 1e-3);
        if(uBP[id] == 6){ if(water.a == 0.0) water = vec4(uBC[id], 0.0); water.a = min(0.65, water.a + 0.1); }
        else {
          float a, e;
          vec3 bc = blockCol(id, hp, a, e);
          if(a > 0.05){
            vec3 n = face == 0 ? vec3(-float(st.x), 0, 0) : face == 1 ? vec3(0, -float(st.y), 0) : vec3(0, 0, -float(st.z));
            float sh = 0.6 + 0.4 * max(0.0, dot(n, normalize(vec3(0.35, 0.9, 0.25))));
            if(n.y < -0.5) sh = 0.42;
            vec3 L = max(lightAt(hp + n * 0.05), vec3(0.5));
            col = mix(bc * L, bc, e) * sh;
            vec3 l = hp - vec3(cell);
            vec2 fl = face == 0 ? l.yz : face == 1 ? l.xz : l.xy;
            float ed = min(min(fl.x, 1.0 - fl.x), min(fl.y, 1.0 - fl.y));
            col *= 0.84 + 0.16 * smoothstep(0.0, 0.07, ed);
            if(uHasHover == 1 && cell == uHover){
              col = mix(col, vec3(1.0, 0.85, 0.2), 0.35);
              if(ed < 0.08) col = vec3(1.0, 0.85, 0.2);
            }
            col = mix(col, water.rgb, water.a);
            hitT = t; break;
          }
        }
      }
      if(tM.x < tM.y && tM.x < tM.z){ t = tM.x; tM.x += tD.x; cell.x += st.x; face = 0; }
      else if(tM.y < tM.z){ t = tM.y; tM.y += tD.y; cell.y += st.y; face = 1; }
      else { t = tM.z; tM.z += tD.z; cell.z += st.z; face = 2; }
    }
    if(hitT > 1e8 && water.a > 0.0) col = mix(col, water.rgb, water.a);
  }

  // creatures
  for(int i = 0; i < ${MAX_SPH}; i++){
    if(i >= uNS) break;
    vec3 so = ro - uSph[i].xyz;
    float sb = dot(so, rd), sc = dot(so, so) - uSph[i].w * uSph[i].w, sd = sb * sb - sc;
    if(sd < 0.0) continue;
    float ts = -sb - sqrt(sd);
    if(ts > 0.0 && ts < hitT){
      vec3 n = normalize(ro + rd * ts - uSph[i].xyz);
      col = uSphC[i] * (0.45 + 0.65 * max(0.0, dot(n, normalize(vec3(0.4, 0.9, 0.25)))));
      hitT = ts;
    }
  }

  // the slice plane
  float dn = dot(rd, nOut);
  if(abs(dn) > 1e-5){
    float tp = -dot(ro - uPlayer, nOut) / dn;
    if(tp > 0.0){
      vec3 pp = ro + rd * tp;
      float u = dot(pp - uPlayer, f), v = pp.y;
      if(u > uPlaneExt.x && u < uPlaneExt.y && v > uPlaneExt.z && v < uPlaneExt.w){
        bool front = tp < hitT;
        float pw = tp * pxW * 1.15;
        col = mix(col, vec3(1.0), front ? 0.2 : 0.07);
        bool inBox = all(greaterThan(pp, uBoxMin)) && all(lessThan(pp, uBoxMax));
        if(inBox){
          bool s0 = solidAt(pp);
          bool edge = s0 != solidAt(pp + f * pw) || s0 != solidAt(pp - f * pw) || s0 != solidAt(pp + vec3(0.0, pw, 0.0)) || s0 != solidAt(pp - vec3(0.0, pw, 0.0));
          if(edge) col = mix(col, vec3(1.0), front ? 0.95 : 0.6);
          else if(s0) col = mix(col, vec3(1.0), front ? 0.0 : 0.05);
        }
        float bd = min(min(u - uPlaneExt.x, uPlaneExt.y - u), min(v - uPlaneExt.z, uPlaneExt.w - v));
        if(bd < pw * 1.3) col = mix(col, vec3(1.0), 0.75);
        if(u > uViewWin.x - pw && u < uViewWin.y + pw && v > uViewWin.z - pw && v < uViewWin.w + pw){
          float e2 = min(min(abs(u - uViewWin.x), abs(u - uViewWin.y)), min(abs(v - uViewWin.z), abs(v - uViewWin.w)));
          if(e2 < pw * 1.2) col = mix(col, vec3(1.0, 0.82, 0.25), front ? 0.9 : 0.6);
        }
        float pv = v - uPlayer.y;
        if(abs(u) < 0.3 && pv > 0.0 && pv < 1.7) col = mix(col, vec3(1.0, 0.85, 0.2), front ? 1.0 : 0.75);
      }
    }
  }
  outColor = vec4(col, 1.0);
}
`;

export const BLIT_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec4 uVP;
out vec4 o;
void main(){ o = texture(uTex, (gl_FragCoord.xy - uVP.xy) / uVP.zw); }
`;
