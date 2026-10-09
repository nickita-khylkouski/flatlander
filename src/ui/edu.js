// Educational mode: lessons with small tasks, plus a live "what the math says" readout.
import { BLOCKS } from '../world/blocks.js';

const deg = (r) => r * 180 / Math.PI;
const offAxis = (th) => { const q = Math.PI / 2; const m = ((th % q) + q) % q; return Math.min(m, q - m); };

// Each lesson: shown in order once its `when` is true. `task` returns [current, goal, label] or null.
export const LESSONS = [
  {
    id: 'flat', title: 'You are flat',
    text: 'You are a flatlander, a 2D being. The <b>left</b> side is everything you can perceive: one vertical slice of the world. The <b>right</b> side is the real 3D world. The white sheet is your slice. The white outline is where it cuts the terrain, and that outline is exactly the shape you see on the left. The yellow box is your screen.',
    task: (g) => [Math.min(1, g.stats.walked / 6), 1, 'walk a few blocks (A/D)'],
  },
  {
    id: 'rotate', title: 'Turning through the 3rd dimension',
    text: 'Scroll to rotate your slice around the vertical line through you. On the right the sheet turns. On the left the terrain reshapes. <b>Nothing moved.</b> You are just cutting the same world at a new angle. A 3D creature could explore a 4D world the same way: by turning its 3D slice through the 4th dimension.',
    task: (g) => [Math.min(90, Math.round(deg(g.stats.rotated))), 90, 'rotate a total of 90° (scroll)'],
  },
  {
    id: 'width', title: 'Why blocks get wider',
    text: 'Every block is a 1×1×1 cube. Lined up with an axis, your slice cuts each one into a 1×1 square. At an angle θ, the line crosses each block\'s square footprint along a chord up to <b>1 / max(|cos θ|, |sin θ|)</b> long. That\'s √2 ≈ 1.41 at 45°. Near a corner the chord gets very thin. Hover blocks and watch the <b>cut width</b> readout.',
    task: (g) => [Math.min(40, Math.round(deg(g.stats.maxOff))), 40, 'turn to at least 40° off-axis'],
  },
  {
    id: 'hidden', title: 'Right next to you, invisible',
    text: 'A cave can be half a block beside your slice and you would never know. On the right, look for tunnels and ore that the sheet doesn\'t touch. Turn a little and they appear out of "nowhere". That\'s the 3rd dimension: a direction you can\'t look in, only turn into.',
    task: (g) => [g.stats.revealed ? 1 : 0, 1, 'rotate until a new block appears under your cursor'],
  },
  {
    id: 'mine', title: 'You removed a whole cube',
    text: 'Mining deletes the <b>entire 3D cube</b>, not just the strip you saw. On the right, the hole goes all the way through. Rotate: from every angle whose slice passes through that cube, the hole is still there.',
    task: (g) => [Math.min(1, g.stats.mined), 1, 'mine any block (hold left mouse)'],
  },
  {
    id: 'sphere', title: 'Circles from spheres',
    text: 'Creatures are 3D bodies made of spheres. A sphere of radius <b>r</b> whose center is a distance <b>d</b> from your plane shows up as a circle of radius <b>√(r² − d²)</b>. It starts as a dot, peaks when d = 0, then shrinks to nothing. A 3D being would see a 4D "hypersphere" pass through its space the same way, as a ball that grows and shrinks.',
    when: (g) => g.stats.sawMob,
    task: (g) => [g.stats.sawMob ? 1 : 0, 1, 'see a creature cross your slice'],
  },
  {
    id: 'rings', title: 'Reading 3D from 2D cuts',
    text: 'Logs have growth rings. Your slice cuts them, so you see stripes whose spacing changes as you turn. Doctors read CT scans this way, and geologists read rock layers this way: they rebuild 3D shapes from 2D cuts. With practice your brain starts doing it too.',
    when: (g) => g.stats.mined >= 2 || g.time > 200,
    task: null,
  },
  {
    id: 'flatland', title: 'Flatland',
    text: 'In Edwin Abbott\'s 1884 novel <i>Flatland</i>, a Square is visited by a Sphere. All the Square sees is a circle that appears, grows, shrinks and vanishes. You are the Square. A 3D being meeting a 4D one would be stuck the same way, and could only use the same tricks: rotate, compare, rebuild.',
    when: (g) => g.time > 300 || g.stats.rotated > Math.PI * 4,
    task: null,
  },
];

export class Edu {
  constructor(game) {
    this.g = game;
    this.card = document.getElementById('lesson');
    this.math = document.getElementById('edumath');
    this.idx = 0;
    this.dismissed = false;
    this.mathT = 0;
    this.card.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target.closest('button')) e.preventDefault(); }); // buttons must not keep focus (Space would press them)
    this.math.addEventListener('mousedown', (e) => { e.stopPropagation(); this.math.classList.toggle('min'); });
    this.card.querySelector('.next').addEventListener('click', () => this.next());
    this.card.querySelector('.skip').addEventListener('click', () => this.toggle());
    this.userHidden = false;
  }

  toggle() {
    this.userHidden = !this.userHidden;
    this.render(true);
    if (this.userHidden) this.g.toastText('Lessons hidden · press L to bring them back');
  }

  load(state) { this.idx = state?.idx ?? 0; this.userHidden = !!state?.hidden; this.render(true); }
  save() { return { idx: this.idx, hidden: this.userHidden }; }

  get lesson() { return LESSONS[this.idx]; }

  next() {
    if (this.idx < LESSONS.length) this.idx++;
    this.render(true);
  }

  render(force) {
    const L = this.lesson;
    const show = this.g.split && !this.userHidden && !this.g.ui.isOpen && L && (!L.when || L.when(this.g));
    this.card.classList.toggle('hidden', !show);
    if (!show) return;
    if (force || this.shownId !== L.id) {
      this.shownId = L.id; force = true;
      this.card.querySelector('.ltitle').innerHTML = `<span class="lnum">Lesson ${this.idx + 1}/${LESSONS.length}</span> ${L.title}`;
      this.card.querySelector('.ltext').innerHTML = L.text;
    }
    const tEl = this.card.querySelector('.ltask');
    const btn = this.card.querySelector('.next');
    if (L.task) {
      const [cur, goal, label] = L.task(this.g);
      const done = cur >= goal;
      const html = `${done ? '✔' : '▸'} <b>Try it:</b> ${label} <span class="lprog">${goal > 1 ? `${Math.min(cur, goal)}/${goal}` : ''}</span>`;
      if (html !== this.taskHtml || force) { // runs every frame: only touch the DOM when something changed
        this.taskHtml = html;
        tEl.innerHTML = html;
        tEl.classList.toggle('done', done);
        btn.textContent = done ? 'Next lesson →' : 'Next →';
        btn.classList.toggle('ready', done);
      }
    } else if (force || this.taskHtml !== '') {
      this.taskHtml = '';
      tEl.innerHTML = '';
      btn.textContent = this.idx + 1 >= LESSONS.length ? 'Finish ✔' : 'Next lesson →';
      btn.classList.add('ready');
    }
  }

  update(dt) {
    if (!this.g.split) { this.card.classList.add('hidden'); this.math.classList.add('hidden'); return; }
    this.render(false);
    this.mathT -= dt;
    if (this.mathT > 0) return;
    this.mathT = 0.1;
    this.math.classList.remove('hidden');
    const g = this.g, p = g.player, [fx, fz] = g.dirv;
    const th = ((deg(p.theta) % 360) + 360) % 360;
    const c = -fz * p.x + fx * p.z;
    const maxW = 1 / Math.max(Math.abs(fx), Math.abs(fz));
    let html = `<div class="mt">THE MATH OF YOUR SLICE</div>`;
    html += `<div>angle&nbsp; θ = <b>${th.toFixed(1)}°</b> <span class="dim">(${deg(offAxis(p.theta)).toFixed(0)}° off-axis)</span></div>`;
    html += `<div>plane&nbsp; <b>${fmt(-fz)}·x ${sgn(fx)} ${fmt(Math.abs(fx))}·z = ${c.toFixed(2)}</b></div>`;
    html += `<div>widest block cut&nbsp; 1/max(|cos θ|,|sin θ|) = <b>${maxW.toFixed(3)}</b></div>`;
    const t = g.target;
    if (t && g.mouseInView && BLOCKS[t.id] && t.id !== 0) {
      const iv = g.cellInterval(t.bx, t.bz);
      const w = iv ? iv[1] - iv[0] : 0;
      html += `<div class="hov">hover&nbsp; <b>${BLOCKS[t.id].name}</b> at (${t.bx}, ${t.by}, ${t.bz})<br>cut width <b>${w.toFixed(3)}</b> of max ${maxW.toFixed(3)} <span class="bar"><span style="width:${Math.round(w / maxW * 100)}%"></span></span></div>`;
    }
    const m = g.nearestSliceMob;
    if (m) {
      html += `<div class="hov">${m.name}: sphere r = ${m.R.toFixed(2)}, d = ${Math.abs(m.w).toFixed(2)}<br>circle you see: √(r² − d²) = <b>${m.r.toFixed(2)}</b></div>`;
    }
    if (html !== this.mathHtml) this.math.innerHTML = this.mathHtml = html;
  }
}

function fmt(v) { return (v < 0 ? '−' : '') + Math.abs(v).toFixed(2); }
function sgn(v) { return v < 0 ? '−' : '+'; }
