// Flatlander: a 2D being mining a 3D voxel world it can only see one slice of.
import { World, WH, SEA, CS, BIOME, BIOME_NAMES } from './world/world.js';
import { B, I, BLOCKS, ITEMS, toolOf, mineTime, dropsFor, itemName } from './world/blocks.js';
import { Renderer } from './render/renderer.js';
import { Player, PHW, PH, forCells } from './game/player.js';
import { Mob, sliceSphere } from './game/entities.js';
import { Inventory } from './game/inventory.js';
import { UI } from './ui/ui.js';
import { iconImage } from './ui/icons.js';
import { sfx, setVolume } from './ui/audio.js';
import { mulberry32 } from './world/noise.js';
import { Edu } from './ui/edu.js';
import { drawGauge, drawCompass, drawMiniMap, drawBigMap } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'flatlander.save.v1';
const DAY_LEN = 480;
const REACH = 5.2, ATTACK_REACH = 3.6;
const ROT_STEP = Math.PI / 12; // 15° per wheel notch
const DIFF = { peaceful: { spiders: 0.6, dmg: 0 }, normal: { spiders: 1, dmg: 1 }, hard: { spiders: 1.6, dmg: 1.5 } };
const DEMO_SEED = 1234;
const SETTINGS_KEY = 'flatlander.settings.v1';
const QUALITY = { high: 2, medium: 1.25, low: 0.75 }; // max render pixels per CSS pixel

function showError(e) {
  const b = $('errorbox');
  b.textContent = 'Error: ' + (e && e.stack ? e.stack : e);
  b.classList.remove('hidden');
}
window.addEventListener('error', (e) => showError(e.error || e.message));

class Game {
  constructor() {
    this.glc = $('gl'); this.ovc = $('ov');
    this.ov = this.ovc.getContext('2d');
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, l: false, r: false, rPressed: false, lPressed: false };
    this.wheelAcc = 0;
    this.running = false; this.paused = false;
    this.scale = 34;
    this.haze = true; this.debug = false;
    this.showInset = true; this.mapOpen = false;
    this.sel = 0;
    this.rng = mulberry32((Math.random() * 1e9) | 0);
    this.particles = []; this.floaters = [];
    this.hintQueue = []; this.hintTimer = 0; this.hintsShown = {};
    this.fps = 60; this.lastT = performance.now();
    this.inv = new Inventory();
    this.ui = new UI(this);
    this.inv.onChange = () => this.ui.refresh();
    this.opts = { edu: true, difficulty: 'normal' };
    this.splitOn = true;
    this.dioCam = { yaw: 0, pitch: 0.62, zoom: 1, drag: null };
    this.edu = new Edu(this);
    this.settings = { volume: 0.5, haze: true, debug: false, quality: 'auto', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    this.haze = this.settings.haze; this.debug = this.settings.debug;
    setVolume(this.settings.volume);
    this.renderScale = this.qualityScale();
    this.perf = { frames: 0, time: 0, lowered: 0 };
    this.bindInput();
    this.bindMenus();
    this.resize();
    addEventListener('resize', () => this.resize());
    try { this.startDemo(); } catch (e) { showError(e); }
    requestAnimationFrame((t) => this.frame(t));
  }

  qualityScale() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const q = this.settings.quality;
    return Math.min(dpr, QUALITY[q === 'auto' ? 'high' : q] ?? 2);
  }
  saveSettings() {
    this.settings.haze = this.haze; this.settings.debug = this.debug;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }
  // Auto quality: if frames are slow for a few seconds, render fewer pixels (the HUD stays sharp).
  watchPerf(dt) {
    if (this.settings.quality !== 'auto' || this.paused || !this.running) return;
    const pf = this.perf;
    pf.frames++; pf.time += dt;
    if (pf.time < 2.5) return;
    const fps = pf.frames / pf.time;
    pf.frames = 0; pf.time = 0;
    if (fps < 45 && this.renderScale > 0.75) {
      this.renderScale = Math.max(0.75, this.renderScale >= 1.5 ? 1.25 : this.renderScale >= 1.1 ? 1 : 0.75);
      this.renderer.resize(this.W, this.H, this.renderScale);
      if (!pf.lowered++) this.toastText('Lowered render resolution for smoother play (Pause → Quality)');
    }
  }

  // split screen: 2D slice on the left, the real 3D world on the right
  get split() { return this.running ? (this.opts.edu && this.splitOn) : !!this.demo; }
  get vw() { return this.split ? Math.floor(this.W / 2) : this.W; }

  // Title-screen attract mode: a slowly turning slice + the 3D view.
  startDemo() {
    const w = new World(DEMO_SEED);
    const sp = w.findSpawn();
    this.demo = { world: w, x: sp[0], y: sp[1], z: sp[2], theta: 0.3 };
    this.renderer = new Renderer(this.glc, w);
    this.renderer.resize(this.W, this.H, this.renderScale);
    this.renderer.ensureRegion(sp[0], sp[2]);
    this.dioCam.yaw = 0.3 + Math.PI / 2 + 0.6;
  }

  // ------------------------------------------------------------ setup
  resize() {
    this.W = innerWidth; this.H = innerHeight;
    this.dpr = Math.min(2, devicePixelRatio || 1);
    if (this.settings) this.renderScale = Math.min(this.renderScale ?? 2, this.qualityScale());
    this.ovc.width = this.W * this.dpr; this.ovc.height = this.H * this.dpr;
    this.ovc.style.width = this.W + 'px'; this.ovc.style.height = this.H + 'px';
    if (this.renderer) this.renderer.resize(this.W, this.H, this.renderScale);
    this.minScale = Math.max(16, this.W / 92, this.H / 92);
    this.scale = Math.max(this.minScale, this.scale);
    document.body.classList.toggle('split', this.split);
    document.body.style.setProperty('--hb', Math.min(1, (this.vw - 24) / 470).toFixed(3));
  }

  start(seed, save, opts) {
    this.opts = { edu: true, difficulty: 'normal', ...(save ? save.opts : opts) };
    this.splitOn = save ? (save.splitOn ?? true) : true;
    this.hintQueue = []; this.hintTimer = 0;
    $('hint').classList.remove('show');
    this.demo = null;
    this.world = new World(seed);
    if (save) this.world.load(save.world);
    this.world.onChange = () => {};
    if (!this.renderer) this.renderer = new Renderer(this.glc, this.world);
    else { this.renderer.world = this.world; this.renderer.slots.fill(null); }
    this.renderer.resize(this.W, this.H, this.renderScale);
    if (save) {
      const p = save.player;
      this.spawn = save.spawn;
      this.player = new Player(p.x, p.y, p.z);
      this.player.theta = p.theta; this.player.hp = p.hp;
      this.inv.load(save.inv);
      this.time = save.time;
      this.hintsShown = save.hints || {};
      this.sel = save.sel || 0;
      this.stats = { walked: 0, rotated: 0, maxOff: 0, mined: 0, sawMob: false, revealed: false, ...(save.stats || {}) };
      this.edu.load(save.edu);
    } else {
      this.spawn = this.world.findSpawn();
      this.player = new Player(...this.spawn);
      this.inv.load(new Array(36).fill(0));
      this.time = DAY_LEN * 0.08;
      this.hintsShown = {};
      this.sel = 0;
      this.stats = { walked: 0, rotated: 0, maxOff: 0, mined: 0, sawMob: false, revealed: false };
      this.edu.load(null);
    }
    this.dioCam.yaw = this.player.theta + Math.PI / 2 + 0.6;
    this.dioCam.zoom = 1;
    this.dioBox = null; this.dioT = 0;
    this.targetTheta = this.player.theta;
    this.camY = this.player.y + 1;
    this.mobs = [];
    this.particles = []; this.floaters = [];
    this.mine = null;
    this.saveTimer = 0; this.spawnTimer = 0; this.mapTimer = 0;
    this.attackCd = 0; this.useCd = 0; this.swing = 0; this.shake = 0; this.blockedCd = 0;
    this.renderer.ensureRegion(this.player.x, this.player.z);
    this.running = true; this.paused = false;
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('optSplit').checked = this.splitOn;
    $('optSplitRow').classList.toggle('hidden', !this.opts.edu);
    this.resize();
    this.ui.refresh();
    this.selectSlot(this.sel);
    this.queueHint('welcome', 'Welcome, flatlander. <b>A/D</b> to walk, <b>Space</b> to jump.');
    this.queueHint('rotate', '<b>Scroll</b> (or Z/X) to rotate your slice through the 3rd dimension. Watch the world change shape.');
    this.queueHint('sticks', 'Trees are 3D. Hold <b>left mouse</b> on <span style="color:#f66">red leaves</span> to get sticks. Punch wood logs for wood.');
    this.queueHint('craft', 'Press <b>E</b> to craft. A stick digging dirt can turn up <b>rocks</b>. Phase spiders drop <b>phase silk</b>. Rock + silk + stick = <b>Hammer</b>.');
  }

  save(quiet = false) {
    if (!this.running) return;
    const p = this.player;
    const data = {
      v: 1, world: this.world.serialize(),
      player: { x: p.x, y: p.y, z: p.z, theta: p.theta, hp: p.hp },
      inv: this.inv.serialize(), time: this.time, spawn: this.spawn, hints: this.hintsShown, sel: this.sel,
      opts: this.opts, splitOn: this.splitOn, stats: this.stats, edu: this.edu.save(),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); if (!quiet) this.toastText('World saved'); }
    catch (e) { this.toastText('Save failed: ' + e.message); }
  }

  // ------------------------------------------------------------ input
  bindInput() {
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
      if (k === 'f3') e.preventDefault();
      this.keys.add(k);
      if (!this.running) return;
      if (k === 'escape') {
        if (this.ui.isOpen) this.ui.close();
        else if (this.mapOpen) this.toggleMap(false);
        else if (!this.player.dead) this.setPaused(!this.paused);
        return;
      }
      if (this.paused || this.player.dead) return;
      if (k === 'e' || k === 'tab') { if (this.ui.isOpen) this.ui.close(); else this.ui.open(); return; }
      if (this.ui.isOpen) return;
      if (k >= '1' && k <= '9') { this.selectSlot(+k - 1); }
      if (k === 'r') this.snapRotation();
      if (k === 'g') { this.showInset = !this.showInset; }
      if (k === 'm') this.toggleMap();
      if (k === 'f') { this.haze = !this.haze; $('optHaze').checked = this.haze; this.saveSettings(); this.toastText('Depth haze ' + (this.haze ? 'on' : 'off')); }
      if (k === 'h' || k === '?' || k === 'f1') { e.preventDefault(); $('helpcard').classList.toggle('hidden'); }
      if (k === '=' || k === '+') this.scale = Math.min(72, this.scale * 1.15);
      if (k === '-' || k === '_') this.scale = Math.max(this.minScale, this.scale / 1.15);
      if (k === 'f3') { this.debug = !this.debug; $('optFps').checked = this.debug; this.saveSettings(); }
      if (k === 'l' && this.split) this.edu.toggle();
      if (k === 'v' && this.opts.edu) this.setSplit(!this.splitOn);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      const d = this.dioCam.drag;
      if (d) {
        this.dioCam.yaw = d.yaw + (e.clientX - d.x) * 0.008;
        this.dioCam.pitch = Math.max(0.05, Math.min(1.45, d.pitch + (e.clientY - d.y) * 0.006));
      }
    });
    this.glc.addEventListener('mousedown', (e) => {
      if (this.split && e.clientX >= this.vw) { this.dioCam.drag = { x: e.clientX, y: e.clientY, yaw: this.dioCam.yaw, pitch: this.dioCam.pitch }; return; }
      if (!this.running || this.paused) return;
      if (e.button === 0) { this.mouse.l = true; this.mouse.lPressed = true; }
      if (e.button === 2) { this.mouse.r = true; this.mouse.rPressed = true; }
    });
    addEventListener('mouseup', (e) => { this.dioCam.drag = null; if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (this.split && e.clientX >= this.vw) {
        if (e.target !== this.glc) return; // let the lesson card scroll
        e.preventDefault();
        this.dioCam.zoom = Math.max(0.45, Math.min(2.2, this.dioCam.zoom * Math.exp(e.deltaY * 0.0012)));
        return;
      }
      if (!this.running || this.paused || this.ui.isOpen) return;
      e.preventDefault();
      if (e.ctrlKey) { // trackpad pinch / ctrl+wheel: zoom the 2D view
        this.scale = Math.max(this.minScale, Math.min(72, this.scale * Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.006)));
        return;
      }
      const raw = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1);
      const now = performance.now();
      if (now - (this.wheelT || 0) > 250) this.wheelRaw = 0;
      this.wheelT = now;
      this.wheelRaw = (this.wheelRaw || 0) + raw;
      while (Math.abs(this.wheelRaw) >= 90) {
        const d = Math.sign(this.wheelRaw);
        this.wheelRaw -= d * 90;
        if (e.shiftKey) this.selectSlot((this.sel + d + 9) % 9);
        else this.wheelAcc += d;
      }
    }, { passive: false });
  }

  bindMenus() {
    const has = () => !!localStorage.getItem(SAVE_KEY);
    $('btnContinue').classList.toggle('hidden', !has());
    $('btnContinue').onclick = () => {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        this.start(s.world.seed, s);
      } catch (e) { showError(e); }
    };
    $('btnNew').onclick = () => {
      const v = $('seedInput').value.trim();
      const opts = { edu: $('optEdu').checked, difficulty: $('optDiff').value };
      let seed = v ? (/^-?\d+$/.test(v) ? parseInt(v) : [...v].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7)) : (Math.random() * 2e9) | 0;
      if (has() && !confirm('Start a new world? Your saved world will be overwritten when this one saves.')) return;
      this.start(seed, null, opts);
    };
    $('btnHow').onclick = () => $('how').classList.toggle('hidden');
    $('btnResume').onclick = () => this.setPaused(false);
    $('btnSave').onclick = () => this.save();
    $('btnQuit').onclick = () => {
      this.save();
      this.running = false; this.paused = false;
      if (this.ui.isOpen) this.ui.close();
      this.toggleMap(false);
      $('pause').classList.add('hidden'); $('hud').classList.add('hidden');
      $('menu').classList.remove('hidden');
      $('btnContinue').classList.toggle('hidden', !has());
      this.startDemo();
      this.resize();
    };
    $('optSplit').onchange = (e) => this.setSplit(e.target.checked);
    $('btnRespawn').onclick = () => this.respawn();
    $('optHaze').checked = this.haze; $('optFps').checked = this.debug;
    $('optVol').value = this.settings.volume; $('optQuality').value = this.settings.quality;
    $('optHaze').onchange = (e) => { this.haze = e.target.checked; this.saveSettings(); };
    $('optFps').onchange = (e) => { this.debug = e.target.checked; this.saveSettings(); };
    $('optVol').oninput = (e) => { setVolume(+e.target.value); this.settings.volume = +e.target.value; this.saveSettings(); };
    $('optQuality').onchange = (e) => {
      this.settings.quality = e.target.value; this.saveSettings();
      this.renderScale = this.qualityScale();
      this.renderer.resize(this.W, this.H, this.renderScale);
    };
    $('btnHelp').onclick = () => $('helpcard').classList.toggle('hidden');
    // a browser game should stop when you look away
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running && !this.paused && !this.player.dead) this.setPaused(true);
    });
    addEventListener('beforeunload', () => { if (this.running) this.save(); });
  }

  setSplit(on) {
    this.splitOn = on;
    $('optSplit').checked = on;
    this.resize();
  }

  setPaused(p) {
    this.paused = p;
    $('pause').classList.toggle('hidden', !p);
    if (p) { this.mouse.l = this.mouse.r = false; this.save(true); }
  }

  selectSlot(i) {
    this.sel = i;
    this.ui.refresh();
    const s = this.inv.slots[i];
    const hn = $('heldname');
    hn.textContent = s ? itemName(s.id) : '';
    hn.style.opacity = 1;
    clearTimeout(this.hnT);
    this.hnT = setTimeout(() => (hn.style.opacity = 0), 1500);
    this.mine = null;
  }

  toggleMap(v) {
    const want = v ?? !this.mapOpen;
    if (want && !(this.running && this.inv.hasInHotbar(I.CARTOGRAPH))) {
      if (v === false || !this.running) { this.mapOpen = false; $('bigmap').classList.add('hidden'); return; } this.toastText('You need a Cartograph in your hotbar to see the map'); return; }
    this.mapOpen = want;
    $('bigmap').classList.toggle('hidden', !want);
    if (want) drawBigMap(this);
  }

  get held() { return this.inv.slots[this.sel]; }

  // ------------------------------------------------------------ slice math
  get dirv() { return this.player.dir; }
  // screen (css px) -> world point on the slice plane
  screenToWorld(sx, sy) {
    const p = this.player, [fx, fz] = this.dirv;
    const u = (sx - this.vw / 2) / this.scale;
    const y = this.camY - (sy - this.H / 2) / this.scale;
    return { u, y, x: p.x + fx * u, z: p.z + fz * u };
  }
  project(x, y, z) {
    const p = this.player, [fx, fz] = this.dirv;
    const dx = x - p.x, dz = z - p.z;
    const u = dx * fx + dz * fz, w = -dx * fz + dz * fx;
    return { sx: this.vw / 2 + u * this.scale, sy: this.H / 2 - (y - this.camY) * this.scale, u, w };
  }
  // u-interval where the slice line crosses voxel column (cx,cz)
  cellInterval(cx, cz) {
    const p = this.player, [fx, fz] = this.dirv;
    let lo = -Infinity, hi = Infinity;
    const slab = (o, d, c) => {
      if (Math.abs(d) < 1e-9) { if (o < c || o > c + 1) { lo = Infinity; } return; }
      let a = (c - o) / d, b = (c + 1 - o) / d;
      if (a > b) [a, b] = [b, a];
      lo = Math.max(lo, a); hi = Math.min(hi, b);
    };
    slab(p.x, fx, cx); slab(p.z, fz, cz);
    return lo < hi ? [lo, hi] : null;
  }

  // ------------------------------------------------------------ rotation
  snapRotation() {
    const q = Math.PI / 2;
    this.targetTheta = Math.round(this.player.theta / q) * q;
  }
  updateRotation(dt) {
    const p = this.player;
    if (this.wheelAcc) {
      this.targetTheta += this.wheelAcc * ROT_STEP;
      this.wheelAcc = 0;
      this.didRotate = true;
    }
    if (!this.ui.isOpen) {
      if (this.keys.has('z')) this.targetTheta -= 1.6 * dt;
      if (this.keys.has('x')) this.targetTheta += 1.6 * dt;
    }
    let diff = this.targetTheta - p.theta;
    if (Math.abs(diff) < 1e-5) return;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 7 * dt);
    const th = p.theta + step;
    let ok = p.tryRotate(this.world, th);
    if (!ok) ok = this.nudgeRotate(th);
    if (!ok) {
      this.targetTheta = p.theta;
      if (this.blockedCd <= 0) { sfx.blocked(); this.blockedCd = 0.6; this.shake = 0.15; this.toastText('Can\'t rotate here: a block would cut through you'); }
      return;
    }
    if (Math.abs(step) > 0.02 && Math.random() < 0.3) sfx.rotate();
    this.stats.rotated += Math.abs(step);
    const q = Math.PI / 2, m = ((p.theta % q) + q) % q;
    this.stats.maxOff = Math.max(this.stats.maxOff, Math.min(m, q - m));
    this.rotatedThisFrame = true;
  }

  // In a tight tunnel the player is often off-center sideways (in the hidden direction), so turning
  // clips a wall. Slide up to half a block along the slice normal to make room, as a human would.
  nudgeRotate(th) {
    const p = this.player, w = this.world;
    const nx = -Math.sin(p.theta), nz = Math.cos(p.theta);
    for (let k = 1; k <= 10; k++) for (const sgn of [1, -1]) {
      const d = sgn * k * 0.05;
      const x = p.x + nx * d, z = p.z + nz * d;
      if (!p.collides(w, x, p.y, z, p.theta) && !p.collides(w, x, p.y, z, th)) {
        p.x = x; p.z = z; p.theta = th;
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ main loop
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    try {
      if (!this.running) { if (this.demo) this.drawDemo(dt); return; }
      this.watchPerf(dt);
      if (!this.paused && !this.player.dead) this.update(dt);
      if (this.player.dead && $('death').classList.contains('hidden')) this.die('You were flattened.');
      this.draw(dt);
    } catch (e) { showError(e); this.running = false; this.demo = null; }
  }

  update(dt) {
    const p = this.player, w = this.world;
    this.time += dt;
    this.blockedCd -= dt; this.attackCd -= dt; this.useCd -= dt; this.shake = Math.max(0, this.shake - dt);
    this.swing = Math.max(0, this.swing - dt * 4);
    this.updateRotation(dt);

    const k = this.keys, ui = this.ui.isOpen;
    const input = {
      move: ui ? 0 : ((k.has('d') || k.has('arrowright')) ? 1 : 0) - ((k.has('a') || k.has('arrowleft')) ? 1 : 0),
      jump: !ui && (k.has(' ') || k.has('w') || k.has('arrowup')),
      down: !ui && (k.has('s') || k.has('arrowdown')),
      sprint: k.has('shift'),
    };
    const events = [];
    const wasWater = p.inWater;
    const ox = p.x, oz = p.z;
    this.rotatedThisFrame = false;
    p.update(dt, w, input, events);
    this.stats.walked += Math.hypot(p.x - ox, p.z - oz);
    if (events.includes('hurt')) { sfx.hurt(); this.shake = 0.2; }
    if (events.includes('jump')) sfx.jump();
    if (!wasWater && p.inWater && p.vy < -4) sfx.splash();
    if (p.dead) return this.die('You fell or burned.');
    this.camY += (p.y + 1 - this.camY) * Math.min(1, dt * 7);

    if (!ui) this.handleMouse(dt); else this.mine = null;
    this.mouse.lPressed = this.mouse.rPressed = false;

    this.updateMobs(dt);
    if (p.dead) return this.die('A phase spider got you.');
    this.updateParticles(dt);

    // world streaming
    this.pregen();
    this.renderer.ensureRegion(p.x, p.z);

    this.saveTimer += dt;
    if (this.saveTimer > 45) { this.saveTimer = 0; this.save(true); }
    this.updateHints(dt);
    this.edu.update(dt);
  }

  pregen() {
    const p = this.player;
    const pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS);
    // forget far-away chunks (edits live in world.mods, so they regenerate exactly)
    this.evictT = (this.evictT || 0) + 1;
    if (this.evictT > 120) {
      this.evictT = 0;
      this.world.evictFar(pcx, pcz, 14);
    }
    let made = 0;
    for (let r = 0; r <= 6 && made < 2; r++) {
      for (let dz = -r; dz <= r && made < 2; dz++) for (let dx = -r; dx <= r && made < 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!this.world.hasChunk(pcx + dx, pcz + dz)) { this.world.getChunk(pcx + dx, pcz + dz); made++; }
      }
    }
  }

  // ------------------------------------------------------------ interaction
  cursorTarget() {
    const wp = this.screenToWorld(this.mouse.x, this.mouse.y);
    const p = this.player;
    const reach = Math.hypot(wp.u, wp.y - (p.y + 1.4));
    const bx = Math.floor(wp.x), by = Math.floor(wp.y), bz = Math.floor(wp.z);
    return { wp, reach, bx, by, bz, id: by >= 0 && by < WH ? this.world.getBlock(bx, by, bz) : 0 };
  }

  mobUnderCursor(wp) {
    const p = this.player, [fx, fz] = this.dirv;
    let best = null, bd = Infinity;
    for (const m of this.mobs) {
      for (const s of m.parts()) {
        const c = sliceSphere(s, p.x, p.z, fx, fz);
        if (c.r <= 0) continue;
        const d = Math.hypot(c.u - wp.u, c.v - wp.y);
        if (d < c.r + 0.08 && d < bd) { bd = d; best = { m, c }; }
      }
    }
    return best;
  }

  get mouseInView() { return this.mouse.x < this.vw; }

  handleMouse(dt) {
    if (!this.mouseInView) { this.target = null; this.mine = null; return; }
    const t = this.cursorTarget();
    const prev = this.target;
    if (prev && this.rotatedThisFrame && prev.id === 0 && t.id !== 0 && BLOCKS[t.id].solid && Math.abs(prev.wp.u - t.wp.u) < 0.01) this.stats.revealed = true;
    this.target = t;
    const held = this.held;
    const tool = toolOf(held && held.id);

    // attack / mine
    if (this.mouse.l) {
      const mob = this.mobUnderCursor(t.wp);
      if (mob && t.reach <= ATTACK_REACH) {
        this.mine = null;
        if (this.attackCd <= 0) {
          this.attackCd = 0.38; this.swing = 1;
          const [fx, fz] = this.dirv;
          const s = Math.sign(mob.c.u) || 1;
          mob.m.hit(tool.dmg, fx * s, fz * s);
          sfx.hit();
          this.floater(mob.m.x, mob.c.v + 0.6, mob.m.z, '-' + tool.dmg, '#ff8080');
          if (mob.m.dead) this.killMob(mob.m);
        }
      } else if (BLOCKS[t.id].target && t.reach <= REACH) {
        const key = t.bx + ',' + t.by + ',' + t.bz;
        const time = mineTime(t.id, tool);
        if (!this.mine || this.mine.key !== key) this.mine = { key, x: t.bx, y: t.by, z: t.bz, id: t.id, prog: 0, sound: 0 };
        if (time === Infinity) {
          this.mine.cant = true;
          if (this.mouse.lPressed) this.toastText(t.id === B.BEDROCK ? 'Bedrock is unbreakable' : `${BLOCKS[t.id].name} needs a stronger tool`);
        } else {
          this.mine.cant = false;
          this.mine.prog += dt / time;
          this.mine.sound -= dt;
          if (this.mine.sound <= 0) { sfx.dig(); this.mine.sound = 0.22; this.swing = 1; this.chips(t.bx, t.by, t.bz, 2); }
          if (this.mine.prog >= 1) this.breakBlock(t.bx, t.by, t.bz, t.id);
        }
      } else this.mine = null;
    } else this.mine = null;

    // use / place
    if (this.mouse.r && (this.mouse.rPressed || this.useCd <= 0)) {
      this.useCd = 0.22;
      this.useItem(t);
    }
  }

  breakBlock(x, y, z, id) {
    const held = this.held;
    const drops = dropsFor(id, held && held.id, this.rng);
    if (id === B.CHEST) {
      const c = this.world.chests.get(x + ',' + y + ',' + z);
      if (c) for (const s of c) if (s) drops.push([s.id, s.count]);
    }
    this.world.setBlock(x, y, z, B.AIR);
    for (const [did, n] of drops) this.give(did, n);
    this.chips(x, y, z, 14, id);
    sfx.break();
    this.mine = null;
    this.stats.mined++;
    if (id === B.STONE || id === B.DUSK_STONE) this.queueHint('rocks', 'Craft stone into 5 rocks, or keep it for building.');
    if (id === B.IRON_ORE) this.queueHint('iron', 'Iron ore + wood = iron ingot. Ingots make an Iron Pick, which can mine <span style="color:#f46">Crimsonite Ore</span> (deeper than y=20).');
  }

  give(id, n) {
    const left = this.inv.add(id, n);
    if (n - left > 0) { this.ui.toast(id, n - left); sfx.pickup(); }
    if (left > 0) this.toastText('Inventory full');
    if (id === I.STICK) this.queueHint('stick', 'Got a stick! Hold it in your hand (1-9) and dig dirt for a chance at <b>rocks</b>.');
    if (id === I.PHASE_SILK) this.queueHint('silk', 'Phase silk! Craft a <b>Hammer</b> (rock + silk + stick) to mine stone and iron.');
    if (id >= I.RED_LENS && id <= I.BLUE_LENS) this.queueHint('lens', 'A lens! Collect red, green and blue + 2 Dusk Wood to craft <b>3D Glasses</b>.');
  }

  onCrafted(id) {
    if (id === I.HAMMER) this.queueHint('hammer', 'Hammer crafted. Dig down and look for iron ore (tan spots in stone).');
    if (id === I.COMPASS) this.queueHint('compass', 'Compass in your hotbar shows your 3D position and the direction of your slice.');
    if (id === I.CARTOGRAPH) this.queueHint('cartograph', 'A Cartograph in your hotbar shows a top-down map. Press M for the big map.');
    if (id === I.GLASSES) this.queueHint('glasses', '3D Glasses in your hotbar: see creatures and chests outside your slice, plus a 3D cutaway view (G).');
  }

  useItem(t) {
    const held = this.held, p = this.player;
    if (held && held.id === I.HEALTH_POTION) {
      if (p.hp >= p.maxHp) { this.toastText('Already at full health'); return; }
      p.hp = Math.min(p.maxHp, p.hp + 30);
      this.inv.takeFromSlot(this.sel);
      this.give(I.FLASK, 1);
      sfx.drink();
      return;
    }
    if (t.reach > REACH) return;
    if (t.id === B.CHEST && !(held && ITEMS[held.id].block && this.keys.has('shift'))) {
      const key = t.bx + ',' + t.by + ',' + t.bz;
      if (!this.world.chests.has(key)) this.world.chests.set(key, new Array(27).fill(null));
      this.mouse.r = false;
      this.ui.open(this.world.chests.get(key));
      return;
    }
    if (!held || !ITEMS[held.id].block || !BLOCKS[held.id].placeable) return;
    const cur = t.id;
    if (!(cur === B.AIR || cur === B.WATER || cur === B.LAVA)) return;
    if (t.by <= 0 || t.by >= WH) return;
    // must touch something in 3D
    const w = this.world;
    const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    if (!nb.some(([dx, dy, dz]) => { const id = w.getBlock(t.bx + dx, t.by + dy, t.bz + dz); return id !== B.AIR && id !== B.WATER && id !== B.LAVA; })) return;
    // not inside the player
    if (BLOCKS[held.id].solid) {
      let inside = false;
      forCells(w, p.x, p.y, p.z, p.theta, PHW, PH, (cx, cy, cz) => { if (cx === t.bx && cy === t.by && cz === t.bz) { inside = true; return false; } });
      if (inside) return;
      for (const m of this.mobs) {
        if (t.bx + 1 > m.x - m.T.hw && t.bx < m.x + m.T.hw && t.bz + 1 > m.z - m.T.hw && t.bz < m.z + m.T.hw && t.by + 1 > m.y && t.by < m.y + m.T.h) return;
      }
    }
    w.setBlock(t.bx, t.by, t.bz, held.id);
    if (held.id === B.CHEST) w.chests.set(t.bx + ',' + t.by + ',' + t.bz, new Array(27).fill(null));
    this.inv.takeFromSlot(this.sel);
    sfx.place();
    this.swing = 1;
  }

  // ------------------------------------------------------------ mobs
  killMob(m) {
    sfx.kill();
    for (const [id, n] of m.drops(this.rng)) this.give(id, n);
    const c = m.type === 'spider' ? '#5a2a78' : m.type === 'jelly' ? '#ff88cc' : { red: '#ff4050', green: '#40e060', blue: '#4080ff' }[m.color];
    for (let i = 0; i < 16; i++) this.particle(m.x, m.y + 0.5, m.z, c);
  }

  updateMobs(dt) {
    const p = this.player, w = this.world, [fx, fz] = this.dirv;
    const daylight = this.daylight;
    for (const m of this.mobs) {
      const dist = m.update(dt, w, p, daylight);
      if (m.dead) continue;
      if (dist > 64) { m.dead = true; m.despawn = true; continue; }
      if (m.type === 'spider' && daylight > 0.7 && dist > 18 && m.y >= w.topY(Math.floor(m.x), Math.floor(m.z)) - 1) { m.dead = true; m.despawn = true; continue; }
      if (m.y < -10) { m.dead = true; m.despawn = true; continue; }
      // contact damage where the body crosses the slice
      if (m.T.dmg && m.attackCd <= 0 && !p.dead) {
        const parts = m.parts().slice(0, m.type === 'spider' ? 3 : 1);
        for (const s of parts) {
          const c = sliceSphere(s, p.x, p.z, fx, fz);
          if (c.r <= 0) continue;
          const nu = Math.max(-PHW, Math.min(PHW, c.u)), nv = Math.max(p.y, Math.min(p.y + PH, c.v));
          if (Math.hypot(c.u - nu, c.v - nv) < c.r) {
            m.attackCd = m.type === 'jelly' ? 1.5 : 1.0;
            const kb = c.u > 0 ? -7 : 7;
            const dmg = Math.round(m.T.dmg * DIFF[this.opts.difficulty].dmg);
            if (dmg > 0 && p.damage(dmg, kb)) { sfx.hurt(); this.shake = 0.25; this.floater(p.x, p.y + 2, p.z, '-' + dmg, '#ff4040'); }
            break;
          }
        }
      }
    }
    this.mobs = this.mobs.filter((m) => !m.dead);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 0.6; this.trySpawn(); }
  }

  trySpawn() {
    const p = this.player, w = this.world, r = this.rng, [fx, fz] = this.dirv;
    const count = (t) => this.mobs.filter((m) => m.type === t).length;
    const night = this.daylight < 0.35;
    // phase spiders: on the surface at night, in dark caves anytime
    const sm = DIFF[this.opts.difficulty].spiders;
    if (count('spider') < Math.round((night ? 6 : 3) * sm)) {
      const a = r() * Math.PI * 2, d = 14 + r() * 18;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      const top = w.topY(x, z);
      let y = -1;
      if (night && r() < 0.6) y = top;
      else {
        const y0 = Math.floor(p.y) + Math.floor((r() - 0.5) * 16);
        for (let yy = y0; yy > Math.max(2, y0 - 12); yy--) {
          if (yy < top - 4 && !BLOCKS[w.getBlock(x, yy, z)].solid && !BLOCKS[w.getBlock(x, yy + 1, z)].solid && BLOCKS[w.getBlock(x, yy - 1, z)].solid && w.getBlock(x, yy, z) === B.AIR) { y = yy; break; }
        }
      }
      if (y > 0 && w.getBlock(x, y, z) === B.AIR && w.getBlock(x, y + 1, z) === B.AIR && !this.nearTorch(x, y, z, 9))
        { const m = new Mob('spider', x + 0.5, y, z + 0.5); m.passive = this.opts.difficulty === 'peaceful'; this.mobs.push(m); }
    }
    // butterflies: daytime, near the slice so you can actually catch one
    if (!night && count('butterfly') < 7) {
      const u = (r() - 0.5) * 50, wo = (r() - 0.5) * 8;
      const x = p.x + fx * u - fz * wo, z = p.z + fz * u + fx * wo;
      const bio = w.biomeAt(Math.floor(x), Math.floor(z));
      if (bio !== BIOME.DESERT) {
        const top = w.topY(Math.floor(x), Math.floor(z));
        const y = Math.max(top, SEA) + 1.5 + r() * 3;
        const roll = r();
        const color = bio === BIOME.DUSK ? (roll < 0.6 ? 'blue' : roll < 0.8 ? 'red' : 'green')
          : bio === BIOME.TUNDRA ? (roll < 0.6 ? 'green' : roll < 0.8 ? 'red' : 'blue')
            : (roll < 0.55 ? 'red' : roll < 0.8 ? 'green' : 'blue');
        if (!BLOCKS[w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))].solid) this.mobs.push(new Mob('butterfly', x, y, z, { color }));
      }
    }
    // jellyfish in water
    if (count('jelly') < 3) {
      const a = r() * Math.PI * 2, d = 8 + r() * 20;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      const y = SEA - 2 - Math.floor(r() * 4);
      if (w.getBlock(x, y, z) === B.WATER && w.getBlock(x, y + 1, z) === B.WATER) this.mobs.push(new Mob('jelly', x + 0.5, y, z + 0.5));
    }
  }

  nearTorch(x, y, z, r) {
    for (const t of this.world.torches.values()) if (Math.abs(t[0] - x) < r && Math.abs(t[1] - y) < r && Math.abs(t[2] - z) < r) return true;
    return false;
  }

  die(msg) {
    this.player.dead = true;
    $('deathmsg').textContent = msg;
    $('death').classList.remove('hidden');
    this.mouse.l = this.mouse.r = false;
    if (this.ui.isOpen) this.ui.close();
  }
  respawn() {
    const p = this.player;
    p.x = this.spawn[0]; p.y = this.spawn[1]; p.z = this.spawn[2];
    p.hp = p.maxHp; p.dead = false; p.vu = p.vy = 0;
    this.camY = p.y + 1;
    this.mobs = this.mobs.filter((m) => m.type !== 'spider');
    // make sure the spawn is still open
    for (let k = 0; k < 64 && p.collides(this.world, p.x, p.y, p.z); k++) p.y += 1;
    $('death').classList.add('hidden');
  }

  // ------------------------------------------------------------ effects
  particle(x, y, z, col, vu, vy) {
    const [fx, fz] = this.dirv;
    const u = vu ?? (this.rng() - 0.5) * 5;
    this.particles.push({ x, y, z, vx: fx * u, vz: fz * u, vy: vy ?? 2 + this.rng() * 4, life: 0.5 + this.rng() * 0.5, col });
  }
  chips(bx, by, bz, n, id) {
    id = id ?? this.world.getBlock(bx, by, bz);
    const b = BLOCKS[id];
    const iv = this.cellInterval(bx, bz);
    const [fx, fz] = this.dirv, p = this.player;
    const um = iv ? (Math.max(iv[0], -50) + Math.min(iv[1], 50)) / 2 : 0;
    for (let i = 0; i < n; i++) {
      const c = this.rng() < 0.5 ? b.col : b.col2;
      const col = `rgb(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0})`;
      this.particle(p.x + fx * um, by + 0.5, p.z + fz * um, col);
    }
  }
  floater(x, y, z, text, col) { this.floaters.push({ x, y, z, text, col, life: 1 }); }
  updateParticles(dt) {
    for (const q of this.particles) { q.vy -= 22 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.life -= dt; }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const f of this.floaters) { f.y += dt * 1.2; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  toastText(t) { this.ui.toast(null, 0, t); }

  queueHint(key, html) {
    if (this.hintsShown[key]) return;
    this.hintsShown[key] = true;
    this.hintQueue.push(html);
  }
  updateHints(dt) {
    this.hintTimer -= dt;
    const h = $('hint');
    if (this.hintTimer <= 0) {
      if (this.hintQueue.length) { h.innerHTML = this.hintQueue.shift(); h.classList.add('show'); this.hintTimer = 7; }
      else h.classList.remove('show');
    }
    if (this.daylight < 0.3) this.queueHint('night', 'Night falls. <b>Phase spiders</b> are coming, maybe from outside your slice. Watch for shapes that grow out of nowhere.');
    if (this.player.y < SEA - 10) this.queueHint('dark', 'It\'s dark down here. Craft <b>torches</b> (stick + wood) and place them with right-click.');
  }

  // ------------------------------------------------------------ time
  get dayFrac() { return (this.time / DAY_LEN) % 1; }
  get daylight() {
    const t = this.dayFrac;
    const d = t < 0.62 ? Math.min(1, Math.sin(Math.PI * t / 0.62) * 2.6) : 0;
    return Math.max(0.2, d);
  }
  sunInfo() {
    const t = this.dayFrac;
    if (t < 0.62) { const k = t / 0.62; return [0.92 - 0.84 * k, 0.5 + 0.42 * Math.sin(Math.PI * k), 1]; }
    const k = (t - 0.62) / 0.38; return [0.92 - 0.84 * k, 0.5 + 0.4 * Math.sin(Math.PI * k), 0];
  }

  // ------------------------------------------------------------ drawing
  draw(dt) {
    const p = this.player, [fx, fz] = this.dirv;
    const glasses = this.inv.hasInHotbar(I.GLASSES);
    const compass = this.inv.hasInHotbar(I.COMPASS);
    const cartograph = this.inv.hasInHotbar(I.CARTOGRAPH);
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.6 : 0;

    // Only torches whose 9-block light radius can reach something we draw: near the slice plane
    // (or inside the 3D box in split view). Closest first; the shader takes 32.
    const torches = [];
    const hu = this.vw / 2 / this.scale + 9, hv = this.H / 2 / this.scale + 9;
    for (const t of this.world.torches.values()) {
      const dx = t[0] + 0.5 - p.x, dz = t[2] + 0.5 - p.z, dy = t[1] - this.camY;
      const u = dx * fx + dz * fz, w = -dx * fz + dz * fx;
      const nearSlice = Math.abs(w) < (this.haze ? 14 : 9) && Math.abs(u) < hu && Math.abs(dy) < hv;
      const inBox = this.split && Math.abs(dx) < 22 && Math.abs(dz) < 22;
      if (nearSlice || inBox) torches.push([t[0], t[1], t[2], Math.abs(w) + Math.abs(u) * 0.2]);
    }
    if (torches.length > 32) torches.sort((a, b) => a[3] - b[3]);

    const insetW = Math.min(360, this.W * 0.3), insetH = insetW * 0.66;
    const insetRect = { x: this.W - insetW - 12 - (cartograph ? 196 : 0), y: 12, w: insetW, h: insetH };
    let insetCam = null, spheres = [];
    const split = this.split;
    if (glasses && this.showInset && !split) {
      const a = 0.62 + Math.sin(this.time * 0.25) * 0.25, e = 0.48;
      const nOut = [-fz, 0, fx], f = [fx, 0, fz];
      const off = [(nOut[0] * Math.cos(a) - f[0] * Math.sin(a)) * Math.cos(e), Math.sin(e), (nOut[2] * Math.cos(a) - f[2] * Math.sin(a)) * Math.cos(e)];
      const tgt = [p.x, p.y + 0.8, p.z];
      const D = 21;
      const pos = [tgt[0] + off[0] * D, tgt[1] + off[1] * D, tgt[2] + off[2] * D];
      const cf = norm([tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]);
      const cr = norm(cross(cf, [0, 1, 0]));
      const cu = cross(cr, cf);
      insetCam = { pos, f: cf, r: cr, u: cu };
      for (const m of this.mobs) {
        if (Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z) > 14) continue;
        for (const s of m.parts()) if (s[3] >= 0.07) spheres.push(s);
      }
    }

    let dio = null;
    if (split) {
      const t = this.target;
      const hover = t && t.id !== 0 && this.mouseInView ? [t.bx, t.by, t.bz] : null;
      dio = this.dioState(p.x, p.y, p.z, this.world, this.camY, hover, dt);
      for (const m of this.mobs) {
        if (m.x < dio.boxMin[0] - 1 || m.x > dio.boxMax[0] + 1 || m.z < dio.boxMin[2] - 1 || m.z > dio.boxMax[2] + 1) continue;
        for (const s of m.parts()) if (s[3] >= 0.06) spheres.push(s);
      }
    }

    this.renderer.render({
      time: this.time, daylight: this.daylight, torches,
      player: [p.x, p.y, p.z], cam: [p.x, this.camY + sh, p.z], dir: [fx, fz], scale: this.scale,
      haze: this.haze, sun: this.sunInfo(), viewW: this.vw,
      inset: insetCam ? insetRect : null, insetCam, spheres, dio,
    });

    this.drawOverlay(glasses, insetCam ? insetRect : null, sh);
    this.drawHUD(compass, cartograph, dt);
  }

  // Camera + box for the educational 3D view (right half).
  dioState(px, py, pz, world, camY, hover, dt) {
    const R = 12;
    const cx = Math.floor(px), cz = Math.floor(pz), pyI = Math.floor(py);
    this.dioT = (this.dioT || 0) - dt;
    let b = this.dioBox;
    if (!b || this.dioT <= 0 || b.cx !== cx || b.cz !== cz || b.py !== pyI) {
      let mx = 0, mn = 999;
      for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
        const t = world.topY(x, z); if (t > mx) mx = t; if (t < mn) mn = t;
      }
      const y0 = Math.max(0, Math.min(pyI, mn) - 9);
      let y1 = Math.min(WH, Math.max(mx, pyI + 3));
      if (y1 - y0 > 46) y1 = y0 + 46;
      b = this.dioBox = { cx, cz, py: pyI, min: [cx - R, y0, cz - R], max: [cx + R + 1, y1, cz + R + 1] };
      this.dioT = 0.5;
    }
    const ctr = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    const { yaw, pitch, zoom } = this.dioCam;
    const shift = this.running && !$('lesson').classList.contains('hidden') ? Math.min(0.5, ($('lesson').offsetHeight + 10) / this.H) : 0;
    const dist = size * 1.9 * zoom / (1 - shift);
    const dir = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)];
    const pos = [ctr[0] + dir[0] * dist, ctr[1] + dir[1] * dist, ctr[2] + dir[2] * dist];
    const f = norm([ctr[0] - pos[0], ctr[1] - pos[1], ctr[2] - pos[2]]);
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    const vw = this.vw, hu = vw / 2 / this.scale, hv = this.H / 2 / this.scale;
    return {
      rect: { x: vw, y: 0, w: this.W - vw, h: this.H }, cam: { pos, f, r, u }, fov: 0.5,
      boxMin: b.min, boxMax: b.max,
      planeExt: [-R - 4, R + 4, b.min[1] - 1, b.max[1] + 3],
      viewWin: [-hu, hu, camY - hv, camY + hv], hover,
      shift,
    };
  }

  drawDemo(dt) {
    const d = this.demo;
    d.theta += dt * 0.12;
    const fx = Math.cos(d.theta), fz = Math.sin(d.theta);
    const t = performance.now() / 1000;
    const camY = d.y + 1;
    const saveP = this.player;
    this.player = { x: d.x, y: d.y, z: d.z, theta: d.theta, dir: [fx, fz] };
    const dio = this.dioState(d.x, d.y, d.z, d.world, camY, null, dt);
    this.dioCam.yaw += dt * 0.05;
    this.renderer.render({
      time: t, daylight: 1, torches: [], player: [d.x, d.y, d.z], cam: [d.x, camY, d.z], dir: [fx, fz],
      scale: this.scale, haze: true, sun: [0.75, 0.8, 1], viewW: this.vw, inset: null, spheres: [], dio,
    });
    const g = this.ov;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    const toS = (u, y) => [this.vw / 2 + u * this.scale, this.H / 2 - (y - camY) * this.scale];
    this.drawPlayer(g, toS, { ...this.player, facing: 1, walk: 0, vu: 0, hurtTimer: 0 }, null);
    this.drawSplitChrome(g);
    this.player = saveP;
  }

  drawSplitChrome(g) {
    if (!this.split) return;
    const vw = this.vw;
    g.fillStyle = '#000'; g.fillRect(vw - 2, 0, 4, this.H);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(vw - 0.5, 0, 1, this.H);
    g.font = 'bold 12px ui-monospace, monospace'; g.textAlign = 'center';
    const lab = (txt, x, col) => {
      const w = g.measureText(txt).width + 16;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - w / 2, 8, w, 20);
      g.fillStyle = col; g.fillText(txt, x, 22);
    };
    lab('WHAT YOU SEE · a 2D slice', vw / 2, '#ffd84a');
    lab('THE REAL 3D WORLD · drag to orbit · scroll to zoom', vw + (this.W - vw) / 2, '#9fe8ff');
    g.textAlign = 'left';
  }

  drawOverlay(glasses, insetRect, sh) {
    const g = this.ov, S = this.scale, p = this.player, [fx, fz] = this.dirv;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    const cy = this.camY + sh;
    const vw = this.vw;
    const toS = (u, y) => [vw / 2 + u * S, this.H / 2 - (y - cy) * S];
    g.save();
    g.beginPath(); g.rect(0, 0, vw, this.H); g.clip();

    // 3D glasses: outlines of things outside the slice
    if (glasses) {
      g.save();
      g.setLineDash([5, 4]);
      g.lineWidth = 1.5;
      for (const m of this.mobs) {
        const s = m.parts()[m.type === 'spider' ? 1 : 0];
        const c = sliceSphere(s, p.x, p.z, fx, fz);
        if (Math.abs(c.w) < 0.05 || Math.abs(c.w) > 28) continue;
        const a = Math.max(0.15, 1 - Math.abs(c.w) / 28);
        const [sx, sy] = toS(c.u, c.v);
        g.strokeStyle = m.T.hostile ? `rgba(255,80,110,${a})` : `rgba(120,255,240,${a})`;
        g.beginPath(); g.arc(sx, sy, Math.max(4, (m.type === 'spider' ? 1.0 : 0.5) * S), 0, Math.PI * 2); g.stroke();
        g.fillStyle = g.strokeStyle;
        g.font = '10px ui-monospace, monospace';
        g.fillText((c.w > 0 ? '▲' : '▼') + Math.abs(c.w).toFixed(1), sx + 8, sy - 8);
      }
      for (const [k] of this.world.chests) {
        const [x, y, z] = k.split(',').map(Number);
        const pr = this.project(x + 0.5, y, z + 0.5);
        if (Math.abs(pr.w) < 0.5 || Math.abs(pr.w) > 28 || Math.abs(pr.u) > 60) continue;
        const a = Math.max(0.2, 1 - Math.abs(pr.w) / 28);
        const [sx, sy] = toS(pr.u, y + 1);
        g.strokeStyle = `rgba(255,216,74,${a})`;
        g.strokeRect(sx - S / 2, sy, S, S);
      }
      g.restore();
    }

    // mobs: true cross-sections of their 3D bodies
    let near = null;
    for (const m of this.mobs) {
      const parts = m.parts();
      const main = sliceSphere(parts[m.type === 'spider' ? 0 : 0], p.x, p.z, fx, fz);
      const dist = Math.hypot(main.u, main.v - p.y);
      if (main.r > 0 && dist < 20 && (!near || dist < near.dist)) near = { name: m.T.name + (m.type === 'spider' ? ' abdomen' : m.type === 'jelly' ? ' bell' : ' body'), R: main.R, w: main.w, r: main.r, dist };
      for (const s of parts) {
        const c = sliceSphere(s, p.x, p.z, fx, fz);
        if (c.r <= 0) continue;
        const [sx, sy] = toS(c.u, c.v);
        const rr = c.r * S;
        const col = s[4];
        const grd = g.createRadialGradient(sx - rr * 0.3, sy - rr * 0.3, rr * 0.1, sx, sy, rr);
        grd.addColorStop(0, rgb(col, 1.35)); grd.addColorStop(1, rgb(col, 0.7));
        g.fillStyle = grd;
        g.beginPath(); g.arc(sx, sy, rr, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.stroke();
      }
    }

    // target block outline + cracks
    const t = this.target;
    if (t && !this.ui.isOpen && BLOCKS[t.id] && BLOCKS[t.id].target) {
      const iv = this.cellInterval(t.bx, t.bz);
      if (iv) {
        const [x0, y0] = toS(iv[0], t.by + 1), [x1, y1] = toS(iv[1], t.by);
        const inReach = t.reach <= REACH;
        g.lineWidth = 2;
        g.strokeStyle = !inReach ? 'rgba(255,255,255,0.18)' : (this.mine && this.mine.cant) ? 'rgba(255,60,60,0.9)' : 'rgba(255,255,255,0.85)';
        g.strokeRect(x0, y0, x1 - x0, y1 - y0);
        if (this.mine && !this.mine.cant && this.mine.prog > 0) {
          g.save();
          g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
          g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 2;
          const n = Math.floor(this.mine.prog * 8);
          const rr = mulberry32(t.bx * 31 + t.by * 17 + t.bz);
          const cx = (x0 + x1) / 2, cy2 = (y0 + y1) / 2;
          for (let i = 0; i < n; i++) {
            const a = rr() * Math.PI * 2, l = S * (0.2 + rr() * 0.5);
            g.beginPath(); g.moveTo(cx, cy2);
            g.lineTo(cx + Math.cos(a) * l * 0.5 + (rr() - 0.5) * 6, cy2 + Math.sin(a) * l * 0.5);
            g.lineTo(cx + Math.cos(a) * l, cy2 + Math.sin(a) * l);
            g.stroke();
          }
          g.fillStyle = `rgba(0,0,0,${this.mine.prog * 0.25})`;
          g.fillRect(x0, y0, x1 - x0, y1 - y0);
          g.restore();
        }
      }
    }

    this.nearestSliceMob = near;
    if (near) this.stats.sawMob = true;

    this.drawPlayer(g, toS);
    this.drawCursorLabel(g, toS);

    // particles + floaters
    for (const q of this.particles) {
      const pr = this.project(q.x, q.y, q.z);
      const [sx, sy] = toS(pr.u, q.y);
      g.fillStyle = q.col; g.globalAlpha = Math.min(1, q.life * 2);
      g.fillRect(sx - 2, sy - 2, Math.max(3, S * 0.12), Math.max(3, S * 0.12));
    }
    g.globalAlpha = 1;
    g.font = 'bold 14px ui-monospace, monospace'; g.textAlign = 'center';
    for (const f of this.floaters) {
      const pr = this.project(f.x, f.y, f.z);
      const [sx, sy] = toS(pr.u, f.y);
      g.globalAlpha = Math.min(1, f.life * 2);
      g.fillStyle = '#000'; g.fillText(f.text, sx + 1, sy + 1);
      g.fillStyle = f.col; g.fillText(f.text, sx, sy);
    }
    g.globalAlpha = 1; g.textAlign = 'left';

    // screen effects
    if (p.headInWater) { g.fillStyle = 'rgba(30,80,200,0.22)'; g.fillRect(0, 0, vw, this.H); }
    if (p.hurtTimer > 0) {
      const v = g.createRadialGradient(vw / 2, this.H / 2, this.H * 0.3, vw / 2, this.H / 2, this.H * 0.8);
      v.addColorStop(0, 'rgba(255,0,0,0)'); v.addColorStop(1, `rgba(255,0,0,${p.hurtTimer * 1.2})`);
      g.fillStyle = v; g.fillRect(0, 0, vw, this.H);
    }
    g.restore();
    this.drawSplitChrome(g);

    // inset frame
    const lab = $('insetLabel');
    if (insetRect) {
      g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(insetRect.x, insetRect.y, insetRect.w, insetRect.h);
      g.strokeStyle = '#5ff'; g.lineWidth = 1; g.strokeRect(insetRect.x - 1.5, insetRect.y - 1.5, insetRect.w + 3, insetRect.h + 3);
      lab.classList.remove('hidden');
      lab.style.left = insetRect.x + 'px'; lab.style.top = insetRect.y + insetRect.h + 6 + 'px';
    } else lab.classList.add('hidden');

    // slice alignment gauge (bottom-left)
    drawGauge(this, g);
  }

  // Hover label: what's under the cursor and whether you can break it
  drawCursorLabel(g, toS) {
    const t = this.target;
    if (!t || this.ui.isOpen || !this.mouseInView) return;
    let txt = null, col = '#fff';
    const mob = this.mobUnderCursor(t.wp);
    if (mob) { txt = `${mob.m.T.name}  ${Math.max(0, Math.ceil(mob.m.hp))}/${mob.m.T.hp}`; col = mob.m.T.hostile ? '#ff8a9a' : '#9ff'; }
    else if (t.id !== 0 && BLOCKS[t.id].target) {
      const tool = toolOf(this.held && this.held.id);
      const time = mineTime(t.id, tool);
      txt = BLOCKS[t.id].name;
      if (time === Infinity) { const tier = BLOCKS[t.id].tier; txt += tier >= 99 ? ' · unbreakable' : ` · needs ${['', 'Hammer', 'Iron Pick', 'Crimsonite Pick'][tier] || 'better tool'}`; col = '#ff8a8a'; }
      else if (t.reach > REACH) { txt += ' · too far'; col = '#aaa'; }
    }
    if (!txt) return;
    g.font = '12px ui-monospace, monospace';
    const w = g.measureText(txt).width + 10;
    const x = Math.min(this.mouse.x + 16, this.vw - w - 4), y = this.mouse.y + 22;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x, y - 13, w, 18);
    g.fillStyle = col; g.fillText(txt, x + 5, y);
  }

  drawPlayer(g, toS, p = this.player, held = this.held) {
    const S = this.scale;
    const [sx, sy] = toS(0, p.y);
    const w = PHW * 2 * S, h = PH * S;
    const f = p.facing;
    g.save();
    g.translate(sx, sy);
    if (p.hurtTimer > 0) g.globalAlpha = 0.6 + 0.4 * Math.sin(p.hurtTimer * 60);
    const leg = Math.sin(p.walk * 3) * 0.12 * S * (Math.abs(p.vu) > 0.3 ? 1 : 0);
    // legs
    g.fillStyle = '#2a3a8a';
    g.fillRect(-w * 0.45, -h * 0.38 + 0, w * 0.4, h * 0.38 + Math.min(0, leg));
    g.fillRect(w * 0.05, -h * 0.38, w * 0.4, h * 0.38 + Math.min(0, -leg));
    // torso
    g.fillStyle = '#1fb5a8'; g.fillRect(-w / 2, -h * 0.74, w, h * 0.38);
    g.fillStyle = '#17887e'; g.fillRect(-w / 2, -h * 0.42, w, h * 0.05);
    // head
    g.fillStyle = '#f2c9a0'; g.fillRect(-w * 0.46, -h, w * 0.92, h * 0.27);
    g.fillStyle = '#5a3a22'; g.fillRect(-w * 0.5, -h - 1, w, h * 0.07);
    g.fillStyle = '#111'; g.fillRect(f * w * 0.18 - 2, -h * 0.9, Math.max(2, S * 0.08), Math.max(2, S * 0.1));
    // held item
    if (held) {
      const img = iconImage(held.id);
      if (img.complete) {
        g.save();
        g.translate(f * w * 0.45, -h * 0.55);
        g.rotate(f * (-0.4 + this.swing * 1.4));
        g.scale(f, 1);
        g.imageSmoothingEnabled = false;
        const s = S * 0.6;
        g.drawImage(img, 0, -s, s, s);
        g.restore();
      }
    }
    g.restore();
  }

  drawHUD(compass, cartograph, dt) {
    const p = this.player;
    $('healthfill').style.width = (p.hp / p.maxHp * 100) + '%';
    $('healthtxt').textContent = Math.ceil(p.hp);
    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    $('biome').textContent = BIOME_NAMES[this.world.biomeAt(bx, bz)] + (this.daylight < 0.35 ? ' · night' : '');

    // compass
    const cc = $('compass');
    cc.classList.toggle('hidden', !compass);
    if (compass) drawCompass(this, cc);
    // cartograph minimap
    const mm = $('minimap');
    mm.classList.toggle('hidden', !cartograph);
    if (cartograph) {
      this.mapTimer -= dt;
      if (this.mapTimer <= 0) { this.mapTimer = 0.4; drawMiniMap(this, mm); }
    }
    if (this.mapOpen && !cartograph) this.toggleMap(false);
    if (this.mapOpen) { this.bigMapT = (this.bigMapT || 0) - dt; if (this.bigMapT <= 0) { this.bigMapT = 1; drawBigMap(this); } }

    const dbg = $('debug');
    dbg.classList.toggle('hidden', !this.debug);
    if (this.debug) {
      dbg.textContent = `fps ${this.fps.toFixed(0)}\nxyz ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}\nθ ${(p.theta * 180 / Math.PI).toFixed(1)}°\nchunks ${this.world.chunks.size} mobs ${this.mobs.length}\nday ${(this.dayFrac * 100).toFixed(0)}% light ${this.daylight.toFixed(2)}\nseed ${this.world.seed}`;
    }
  }

}

function rgb(c, k = 1) { return `rgb(${Math.min(255, c[0] * 255 * k) | 0},${Math.min(255, c[1] * 255 * k) | 0},${Math.min(255, c[2] * 255 * k) | 0})`; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

try { window.game = new Game(); } catch (e) { showError(e); }
