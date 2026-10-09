// Tiny synthesized sound effects (WebAudio, no assets).
let ctx = null, master = null;
export let volume = 0.5;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function burst(freq, dur, gain, type = 'bandpass', q = 1.5) {
  const c = ac(); if (!c || !volume) return;
  const s = noise(), f = c.createBiquadFilter(), g = c.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(); s.stop(c.currentTime + dur);
}
function tone(f0, f1, dur, gain, type = 'square') {
  const c = ac(); if (!c || !volume) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(c.currentTime + dur);
}

export const sfx = {
  dig: () => burst(500 + Math.random() * 300, 0.07, 0.25),
  break: () => { burst(300, 0.18, 0.5); burst(1200, 0.08, 0.2); },
  place: () => burst(220, 0.1, 0.45, 'lowpass', 1),
  pickup: () => tone(700, 1400, 0.09, 0.08, 'triangle'),
  hurt: () => { tone(320, 120, 0.2, 0.18, 'sawtooth'); },
  hit: () => { burst(900, 0.08, 0.35); tone(200, 80, 0.1, 0.12); },
  kill: () => { tone(500, 60, 0.3, 0.12, 'square'); burst(600, 0.2, 0.3); },
  jump: () => tone(220, 330, 0.06, 0.04, 'triangle'),
  rotate: () => tone(900, 1300, 0.04, 0.025, 'sine'),
  blocked: () => tone(140, 110, 0.08, 0.08, 'square'),
  craft: () => { tone(500, 900, 0.07, 0.07, 'triangle'); setTimeout(() => tone(800, 1200, 0.08, 0.06, 'triangle'), 70); },
  drink: () => { for (let i = 0; i < 3; i++) setTimeout(() => tone(400 + i * 120, 300, 0.08, 0.08, 'sine'), i * 90); },
  splash: () => burst(800, 0.25, 0.3, 'lowpass', 0.7),
  click: () => tone(1200, 900, 0.03, 0.04, 'square'),
};
