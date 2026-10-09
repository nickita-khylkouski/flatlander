// DOM UI: hotbar, inventory, chest, crafting, tooltips, toasts.
import { ITEMS, RECIPES, GROUPS, itemName, maxStack } from '../world/blocks.js';
import { iconURL } from './icons.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

function slotEl(cls = '') {
  const d = document.createElement('div');
  d.className = 'slot ' + cls;
  d.innerHTML = '<img class="hidden"><span class="cnt"></span>';
  return d;
}
function paintSlot(el, s) {
  const img = el.querySelector('img'), cnt = el.querySelector('.cnt');
  if (!s) { img.classList.add('hidden'); cnt.textContent = ''; return; }
  img.classList.remove('hidden');
  const url = iconURL(s.id);
  if (img.getAttribute('src') !== url) img.src = url;
  cnt.textContent = s.count > 1 ? s.count : '';
}

export class UI {
  constructor(game) {
    this.g = game;
    this.cursor = null;
    this.chest = null; // array of slots when a chest is open
    this.isOpen = false;

    // hotbar
    this.hot = [];
    for (let i = 0; i < 9; i++) {
      const el = slotEl();
      el.insertAdjacentHTML('beforeend', `<span class="num">${i + 1}</span>`);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.g.selectSlot(i); });
      $('hotbar').appendChild(el);
      this.hot.push(el);
    }
    // inventory grids
    this.invEls = [];
    for (let i = 9; i < 36; i++) this.invEls[i] = this.mkSlot($('invgrid'), 'inv', i);
    for (let i = 0; i < 9; i++) this.invEls[i] = this.mkSlot($('hotgrid'), 'inv', i);
    this.chestEls = [];
    for (let i = 0; i < 27; i++) this.chestEls[i] = this.mkSlot($('chestgrid'), 'chest', i);
    $('trash').addEventListener('mousedown', (e) => { e.preventDefault(); if (this.cursor) { this.cursor = null; sfx.click(); this.refresh(); } });

    // recipes
    this.recEls = RECIPES.map((r, ri) => {
      const d = document.createElement('div');
      d.className = 'recipe';
      const ings = r.in.map(([w, n]) => {
        const id = typeof w === 'string' ? GROUPS[w].ids[0] : w;
        const nm = typeof w === 'string' ? GROUPS[w].name : itemName(w);
        return `<span class="ing" title="${nm}"><img src="${iconURL(id)}"><span class="c">${n}</span></span>`;
      }).join('');
      d.innerHTML = `<div class="out"><img src="${iconURL(r.out[0])}"><span>${itemName(r.out[0])}${r.out[1] > 1 ? ' ×' + r.out[1] : ''}</span></div><div class="ings">${ings}</div>`;
      d.querySelector('.ings').style.display = 'flex';
      d.querySelector('.ings').style.gap = '6px';
      d.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const inv = this.g.inv;
        if (!inv.canCraft(r)) return;
        const n = e.shiftKey ? inv.maxCraft(r) : 1;
        let made = 0;
        for (let k = 0; k < n; k++) {
          if (!inv.canFit(r.out[0], r.out[1])) { this.g.toastText('Inventory full'); break; }
          inv.craft(r); made++;
        }
        if (!made) return;
        sfx.craft();
        this.g.onCrafted(r.out[0]);
        this.refresh();
      });
      d.addEventListener('mouseenter', (e) => this.showTip(e, r.out[0]));
      d.addEventListener('mouseleave', () => this.hideTip());
      $('recipes').appendChild(d);
      return d;
    });

    window.addEventListener('mousemove', (e) => {
      const c = $('cursorItem');
      c.style.left = e.clientX - 16 + 'px';
      c.style.top = e.clientY - 16 + 'px';
      const t = $('tooltip');
      t.style.left = e.clientX + 16 + 'px';
      t.style.top = e.clientY + 12 + 'px';
    });
  }

  mkSlot(parent, kind, i) {
    const el = slotEl();
    el.addEventListener('mousedown', (e) => { e.preventDefault(); this.click(kind, i, e); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mouseenter', (e) => { const s = this.arr(kind)[i]; if (s) this.showTip(e, s.id); });
    el.addEventListener('mouseleave', () => this.hideTip());
    parent.appendChild(el);
    return el;
  }

  arr(kind) { return kind === 'chest' ? this.chest : this.g.inv.slots; }

  click(kind, i, e) {
    const a = this.arr(kind);
    if (!a) return;
    const s = a[i];
    sfx.click();
    if (e.shiftKey && e.button === 0 && s) {
      // quick move
      let dest, range;
      if (kind === 'chest') { dest = this.g.inv.slots; range = [...Array(36).keys()]; }
      else if (this.chest) { dest = this.chest; range = [...Array(27).keys()]; }
      else { dest = a; range = i < 9 ? [...Array(27).keys()].map((k) => k + 9) : [...Array(9).keys()]; }
      let left = s.count;
      const ms = maxStack(s.id);
      for (const j of range) { const d = dest[j]; if (left && d && d.id === s.id && d.count < ms) { const n = Math.min(ms - d.count, left); d.count += n; left -= n; } }
      for (const j of range) { if (left && !dest[j]) { const n = Math.min(ms, left); dest[j] = { id: s.id, count: n }; left -= n; } }
      if (left) s.count = left; else a[i] = null;
      this.refresh();
      return;
    }
    const c = this.cursor;
    if (e.button === 2) {
      if (!c && s) { const half = Math.ceil(s.count / 2); this.cursor = { id: s.id, count: half }; s.count -= half; if (!s.count) a[i] = null; }
      else if (c && !s) { a[i] = { id: c.id, count: 1 }; c.count--; }
      else if (c && s && s.id === c.id && s.count < maxStack(s.id)) { s.count++; c.count--; }
      if (this.cursor && this.cursor.count <= 0) this.cursor = null;
    } else {
      if (!c) { this.cursor = s; a[i] = null; }
      else if (!s) { a[i] = c; this.cursor = null; }
      else if (s.id === c.id) {
        const n = Math.min(maxStack(s.id) - s.count, c.count);
        s.count += n; c.count -= n;
        if (!c.count) this.cursor = null;
      } else { a[i] = c; this.cursor = s; }
    }
    this.refresh();
  }

  open(chestSlots = null) {
    this.chest = chestSlots;
    this.isOpen = true;
    $('helpcard').classList.add('hidden');
    $('inv').classList.remove('hidden');
    $('chestbox').classList.toggle('hidden', !chestSlots);
    this.refresh();
  }
  close(force = false) {
    if (this.cursor) { // put the held stack back; never let it vanish
      let left = this.g.inv.add(this.cursor.id, this.cursor.count);
      if (left && this.chest) {
        for (let i = 0; i < this.chest.length && left; i++) if (!this.chest[i]) { this.chest[i] = { id: this.cursor.id, count: left }; left = 0; }
      }
      if (left && !force) { this.cursor.count = left; this.g.toastText('No room for the held item: place it or trash it'); this.refresh(); return false; }
      this.cursor = null;
    }
    this.isOpen = false; this.chest = null;
    $('inv').classList.add('hidden');
    this.hideTip();
    this.refresh();
    return true;
  }

  refresh() {
    const inv = this.g.inv;
    for (let i = 0; i < 9; i++) {
      paintSlot(this.hot[i], inv.slots[i]);
      this.hot[i].classList.toggle('sel', i === this.g.sel);
    }
    if (this.isOpen) {
      for (let i = 0; i < 36; i++) paintSlot(this.invEls[i], inv.slots[i]);
      if (this.chest) for (let i = 0; i < 27; i++) paintSlot(this.chestEls[i], this.chest[i]);
      // craftable recipes float to the top; newly unlocked ones pulse once
      const box = $('recipes');
      const can = RECIPES.map((r) => inv.canCraft(r));
      if (!this.wasCraftable) this.wasCraftable = can.map(() => false);
      const order = [...RECIPES.keys()].sort((a, b) => (can[b] - can[a]) || a - b);
      order.forEach((ri) => box.appendChild(this.recEls[ri]));
      RECIPES.forEach((r, ri) => {
        const el = this.recEls[ri];
        el.classList.toggle('no', !can[ri]);
        if (can[ri] && !this.wasCraftable[ri]) { el.classList.remove('new'); void el.offsetWidth; el.classList.add('new'); }
        this.wasCraftable[ri] = can[ri];
        el.querySelectorAll('.ing').forEach((ie, k) => {
          const ok = inv.ingCount(r.in[k]) >= r.in[k][1];
          ie.querySelector('.c').className = 'c ' + (ok ? 'have' : 'miss');
        });
      });
    }
    const c = $('cursorItem');
    if (this.cursor) { c.classList.remove('hidden'); c.innerHTML = `<img src="${iconURL(this.cursor.id)}"><span>${this.cursor.count > 1 ? this.cursor.count : ''}</span>`; }
    else c.classList.add('hidden');
  }

  showTip(e, id) {
    const it = ITEMS[id];
    if (!it) return;
    const t = $('tooltip');
    let extra = '';
    if (it.tool) extra = `<br><span class="muted">damage ${it.tool.dmg}${it.tool.type === 'pick' || it.tool.type === 'ultra' ? ` · mining tier ${it.tool.tier}` : ''} · speed ×${it.tool.speed}</span>`;
    t.innerHTML = `<b>${it.name}</b>${it.desc ? '<br>' + it.desc : ''}${extra}`;
    t.classList.remove('hidden');
  }
  hideTip() { $('tooltip').classList.add('hidden'); }

  toast(id, n, text) {
    const box = $('toasts');
    const key = id != null ? 'i' + id : 't' + text;
    // stack repeated pickups ("+1 Dirt" ×5 becomes "+5 Dirt") instead of spamming
    const last = box.lastElementChild;
    if (last && last.dataset.key === key && performance.now() - last.dataset.t < 2000) {
      if (id != null) { last.dataset.n = +last.dataset.n + n; last.querySelector('span').innerHTML = `<span class="n">+${last.dataset.n}</span> ${itemName(id)}`; }
      last.dataset.t = performance.now();
      last.style.animation = 'none'; void last.offsetWidth; last.style.animation = '';
      clearTimeout(last._t); last._t = setTimeout(() => last.remove(), 2700);
      return;
    }
    const d = document.createElement('div');
    d.className = 'toast';
    d.dataset.key = key; d.dataset.n = n; d.dataset.t = performance.now();
    d.innerHTML = (id != null ? `<img src="${iconURL(id)}">` : '') + `<span>${text ?? `<span class="n">+${n}</span> ${itemName(id)}`}</span>`;
    box.appendChild(d);
    while (box.children.length > 6) box.removeChild(box.firstChild);
    d._t = setTimeout(() => d.remove(), 2700);
  }
}
