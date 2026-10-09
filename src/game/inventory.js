// Inventory model + crafting helpers.
import { maxStack, GROUPS } from '../world/blocks.js';

export const INV_SIZE = 36; // 0-8 hotbar

export class Inventory {
  constructor(size = INV_SIZE) {
    this.slots = new Array(size).fill(null);
    this.onChange = null;
  }
  changed() { if (this.onChange) this.onChange(); }

  add(id, count) {
    const ms = maxStack(id);
    for (const s of this.slots) {
      if (count <= 0) break;
      if (s && s.id === id && s.count < ms) {
        const n = Math.min(ms - s.count, count);
        s.count += n; count -= n;
      }
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(ms, count);
        this.slots[i] = { id, count: n }; count -= n;
      }
    }
    this.changed();
    return count; // leftover
  }

  canFit(id, n) {
    const ms = maxStack(id);
    let room = 0;
    for (const s of this.slots) room += !s ? ms : s.id === id ? ms - s.count : 0;
    return room >= n;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }
  has(id) { return this.count(id) > 0; }
  hasInHotbar(id) { for (let i = 0; i < 9; i++) if (this.slots[i] && this.slots[i].id === id) return true; return false; }

  remove(id, count) {
    for (let i = this.slots.length - 1; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const n = Math.min(s.count, count);
        s.count -= n; count -= n;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.changed();
    return count === 0;
  }

  takeFromSlot(i, n = 1) {
    const s = this.slots[i];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
  }

  // ---- crafting ----
  ingCount(ing) {
    const [what] = ing;
    if (typeof what === 'string') return GROUPS[what].ids.reduce((a, id) => a + this.count(id), 0);
    return this.count(what);
  }
  canCraft(r) { return r.in.every((ing) => this.ingCount(ing) >= ing[1]); }
  maxCraft(r) { return Math.min(...r.in.map((ing) => Math.floor(this.ingCount(ing) / ing[1]))); }
  craft(r) {
    if (!this.canCraft(r)) return false;
    for (const [what, n] of r.in) {
      if (typeof what === 'string') {
        let left = n;
        for (const id of GROUPS[what].ids) {
          const take = Math.min(left, this.count(id));
          if (take > 0) { this.remove(id, take); left -= take; }
          if (!left) break;
        }
      } else this.remove(what, n);
    }
    const left = this.add(r.out[0], r.out[1]);
    return left === 0 ? true : left;
  }

  serialize() { return this.slots.map((s) => (s ? [s.id, s.count] : 0)); }
  load(arr) { this.slots = arr.map((s) => (s ? { id: s[0], count: s[1] } : null)); this.changed(); }
}
