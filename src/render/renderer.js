// WebGL2 renderer: the world lives in a 128^3 toroidal 3D texture around the player.
// Pass 1 draws the 2D slice (what the flatlander sees). Optional passes ray-march the real 3D
// world: the 3D-Glasses cutaway inset and the educational split-screen diorama.
import { BLOCKS, NUM_BLOCK_SLOTS } from '../world/blocks.js';
import { CS, WH } from '../world/world.js';
import { RS, RC, MAX_TORCH, MAX_SPH, VS, SLICE_FS, INSET_FS, DIORAMA_FS, BLIT_FS } from './shaders.js';

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    console.error(log, src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n'));
    throw new Error('Shader compile failed: ' + log);
  }
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
  const uni = new Proxy({}, { get: (o, k) => (k in o ? o[k] : null) });
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    uni[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, uni };
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');
    this.gl = gl;
    this.slice = program(gl, VS, SLICE_FS);
    this.inset = program(gl, VS, INSET_FS);
    this.dio = program(gl, VS, DIORAMA_FS);
    this.blit = program(gl, VS, BLIT_FS);
    this.fbos = {};

    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.voxTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.voxTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8UI, RS, WH, RS, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, p, gl.NEAREST);
    this.hgtTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.hgtTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, RS, RS, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);

    this.slots = new Array(RC * RC).fill(null); // toroidal slot -> {key, version}
    this.org = [0, 0];

    // block tables
    this.bc = new Float32Array(NUM_BLOCK_SLOTS * 3);
    this.bc2 = new Float32Array(NUM_BLOCK_SLOTS * 3);
    this.bp = new Int32Array(NUM_BLOCK_SLOTS);
    for (const b of BLOCKS) {
      if (!b) continue;
      this.bc.set(b.col, b.id * 3); this.bc2.set(b.col2, b.id * 3); this.bp[b.id] = b.pat;
    }
    this.torchBuf = new Float32Array(MAX_TORCH * 4);
    this.sphBuf = new Float32Array(MAX_SPH * 4);
    this.sphCol = new Float32Array(MAX_SPH * 3);
  }

  // Keep the 8x8-chunk region centered on the player uploaded.
  ensureRegion(px, pz) {
    const gl = this.gl;
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const ox = pcx - RC / 2, oz = pcz - RC / 2;
    this.org = [ox * CS, oz * CS];
    let uploads = 0;
    for (let cz = oz; cz < oz + RC; cz++) for (let cx = ox; cx < ox + RC; cx++) {
      const sx = ((cx % RC) + RC) % RC, sz = ((cz % RC) + RC) % RC;
      const s = sz * RC + sx;
      const chunk = this.world.getChunk(cx, cz);
      const cur = this.slots[s];
      if (cur && cur.chunk === chunk && cur.version === chunk.version) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, this.voxTex);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, sx * CS, 0, sz * CS, CS, WH, CS, gl.RED_INTEGER, gl.UNSIGNED_BYTE, chunk.blocks);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.hgtTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * CS, sz * CS, CS, CS, gl.RED_INTEGER, gl.UNSIGNED_BYTE, chunk.height);
      this.slots[s] = { chunk, version: chunk.version };
      uploads++;
    }
    return uploads;
  }

  resize(w, h, dpr) {
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  setCommon(prog, st) {
    const gl = this.gl, u = prog.uni;
    gl.useProgram(prog.p);
    gl.uniform1i(u.uVox, 0);
    gl.uniform1i(u.uHgt, 1);
    gl.uniform2i(u.uOrg, this.org[0], this.org[1]);
    gl.uniform1f(u.uTime, st.time);
    gl.uniform1f(u.uDay, st.daylight);
    gl.uniform3fv(u.uBC, this.bc);
    gl.uniform3fv(u.uBC2, this.bc2);
    gl.uniform1iv(u.uBP, this.bp);
    const tb = this.torchBuf;
    const n = Math.min(MAX_TORCH, st.torches.length);
    for (let i = 0; i < n; i++) { const t = st.torches[i]; tb[i * 4] = t[0] + 0.5; tb[i * 4 + 1] = t[1] + 0.7; tb[i * 4 + 2] = t[2] + 0.5; tb[i * 4 + 3] = 1; }
    gl.uniform4fv(u.uTorch, tb);
    gl.uniform1i(u.uNT, n);
    gl.uniform3f(u.uPlayer, st.player[0], st.player[1], st.player[2]);
  }

  render(st) {
    const gl = this.gl;
    const H = this.canvas.height;
    const W = Math.floor((st.viewW ?? this.canvas.width / this.dpr) * this.dpr);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    const p = this.slice, u = p.uni;
    this.setCommon(p, st);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform3f(u.uCam, st.cam[0], st.cam[1], st.cam[2]);
    gl.uniform2f(u.uDir, st.dir[0], st.dir[1]);
    gl.uniform1f(u.uScale, st.scale * this.dpr);
    gl.uniform1i(u.uHaze, st.haze ? 1 : 0);
    gl.uniform2f(u.uSun, st.sun[0], st.sun[1]);
    gl.uniform1f(u.uSunUp, st.sun[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (st.inset) this.panel('inset', st.inset, Math.min(this.dpr, 1.5), true, (vw, vh) => this.drawInset(st, vw, vh));
    if (st.dio) this.panel('dio', st.dio.rect, Math.min(this.dpr, 1.25), false, (vw, vh) => this.drawDiorama(st, vw, vh));
  }

  // Render a ray-marched view into an offscreen buffer at reduced resolution, then blit it.
  panel(key, r, k, blend, draw) {
    const gl = this.gl, dpr = this.dpr;
    const fw = Math.max(1, Math.floor(r.w * k)), fh = Math.max(1, Math.floor(r.h * k));
    let fbo = this.fbos[key];
    if (!fbo || fbo.w !== fw || fbo.h !== fh) {
      if (fbo) { gl.deleteFramebuffer(fbo.fb); gl.deleteTexture(fbo.tex); }
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      fbo = this.fbos[key] = { fb, tex, w: fw, h: fh };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
    gl.viewport(0, 0, fw, fh);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    draw(fw, fh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const H = this.canvas.height;
    const vx = Math.floor(r.x * dpr), vw = Math.floor(r.w * dpr), vh = Math.floor(r.h * dpr);
    const vy = H - Math.floor((r.y + r.h) * dpr);
    gl.viewport(vx, vy, vw, vh);
    if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
    const b = this.blit;
    gl.useProgram(b.p);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
    gl.uniform1i(b.uni.uTex, 2);
    gl.uniform4f(b.uni.uVP, vx, vy, vw, vh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  setSpheres(u, st) {
    const gl = this.gl;
    const n = Math.min(MAX_SPH, st.spheres.length);
    for (let i = 0; i < n; i++) {
      const s = st.spheres[i];
      this.sphBuf.set([s[0], s[1], s[2], s[3]], i * 4);
      this.sphCol.set(s[4], i * 3);
    }
    gl.uniform4fv(u.uSph, this.sphBuf);
    gl.uniform3fv(u.uSphC, this.sphCol);
    gl.uniform1i(u.uNS, n);
  }

  drawDiorama(st, vw, vh) {
    const gl = this.gl, p = this.dio, u = p.uni, d = st.dio;
    this.setCommon(p, st);
    gl.uniform4f(u.uVP, 0, 0, vw, vh);
    gl.uniform3fv(u.uCamPos, d.cam.pos);
    gl.uniform3fv(u.uCF, d.cam.f);
    gl.uniform3fv(u.uCR, d.cam.r);
    gl.uniform3fv(u.uCU, d.cam.u);
    gl.uniform1f(u.uFov, d.fov);
    gl.uniform1f(u.uShift, d.shift || 0);
    gl.uniform2f(u.uDir, st.dir[0], st.dir[1]);
    gl.uniform3fv(u.uBoxMin, d.boxMin);
    gl.uniform3fv(u.uBoxMax, d.boxMax);
    gl.uniform4fv(u.uPlaneExt, d.planeExt);
    gl.uniform4fv(u.uViewWin, d.viewWin);
    gl.uniform3i(u.uHover, d.hover ? d.hover[0] : 0, d.hover ? d.hover[1] : -999, d.hover ? d.hover[2] : 0);
    gl.uniform1i(u.uHasHover, d.hover ? 1 : 0);
    this.setSpheres(u, st);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  drawInset(st, vw, vh) {
    const gl = this.gl;
    const p = this.inset, u = p.uni;
    this.setCommon(p, st);
    gl.uniform4f(u.uVP, 0, 0, vw, vh);
    const c = st.insetCam;
    gl.uniform3fv(u.uCamPos, c.pos);
    gl.uniform3fv(u.uCF, c.f);
    gl.uniform3fv(u.uCR, c.r);
    gl.uniform3fv(u.uCU, c.u);
    gl.uniform2f(u.uDir, st.dir[0], st.dir[1]);
    this.setSpheres(u, st);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
