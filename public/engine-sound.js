// engine-sound.js - procedural engine audio tied to the physics: RPM, throttle load, gear shifts, rev limiter, turbo spool / blow-off,
// supercharger whine, exhaust pops on lift-off, wind and road noise. Each car has its own engine character (snd profile in car-data.js).
// Firing frequency = rpm/60 * cylinders/2 (four-stroke); harmonics shape the timbre (boxer rumble, V8 burble, smooth inline-6, flat-6 rasp, rotary buzz, NA scream).
const HARM = {
  boxer:   [1, 0.5, 0.7, 0.35, 0.32, 0.2, 0.16, 0.1],
  v8:      [1, 0.95, 0.55, 0.7, 0.35, 0.4, 0.22, 0.2, 0.12, 0.1],
  v8sc:    [1, 0.95, 0.6, 0.75, 0.4, 0.42, 0.25, 0.2, 0.14, 0.1],
  v8flat:  [1, 0.5, 0.75, 0.35, 0.55, 0.25, 0.35, 0.18, 0.2, 0.12],
  i6:      [1, 0.45, 0.32, 0.26, 0.16, 0.1, 0.08, 0.05],
  flat6:   [1, 0.62, 0.5, 0.42, 0.3, 0.25, 0.18, 0.12],
  flat6na: [1, 0.7, 0.85, 0.6, 0.55, 0.45, 0.32, 0.26, 0.2, 0.14],
  rotary:  [1, 0.3, 0.95, 0.2, 0.85, 0.15, 0.75, 0.1, 0.6, 0.08],
};
const CHAR = {   // per kind: low-pass base / load gain (Hz), distortion drive, sub-harmonic level, idle lumpiness
  boxer:   { lp: 700, lpLoad: 2600, drive: 2.2, sub: 0.55, lump: 0.05 }, v8: { lp: 520, lpLoad: 2300, drive: 3.0, sub: 0.7, lump: 0.10 }, v8sc: { lp: 520, lpLoad: 2300, drive: 3.0, sub: 0.7, lump: 0.10 },
  v8flat:  { lp: 900, lpLoad: 4200, drive: 2.2, sub: 0.2, lump: 0.03 }, i6: { lp: 750, lpLoad: 3000, drive: 1.8, sub: 0.25, lump: 0.02 }, flat6: { lp: 800, lpLoad: 3400, drive: 2.4, sub: 0.35, lump: 0.05 },
  flat6na: { lp: 1100, lpLoad: 5200, drive: 2.6, sub: 0.15, lump: 0.02 }, rotary: { lp: 1100, lpLoad: 4600, drive: 3.4, sub: 0.0, lump: 0.0 },
};
export class EngineSound {
  constructor(AC, out) {
    this.AC = AC; this.out = out; this.prevThr = 0; this.prevShifts = 0; this.popT = 0; this.lump = 0; this.kind = ''; this.profile = null;
    const n = AC.sampleRate * 2, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf;
    this.bus = AC.createGain(); this.bus.gain.value = 1; this.bus.connect(out);
    // tonal engine core: main + sub oscillator -> shaper -> low-pass -> gain
    this.o1 = AC.createOscillator(); this.o2 = AC.createOscillator(); this.g1 = AC.createGain(); this.g2 = AC.createGain();
    this.shaper = AC.createWaveShaper(); this.lp = AC.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 1.2; this.eng = AC.createGain(); this.eng.gain.value = 0;
    this.o1.connect(this.g1); this.o2.connect(this.g2); this.g1.connect(this.shaper); this.g2.connect(this.shaper); this.shaper.connect(this.lp); this.lp.connect(this.eng); this.eng.connect(this.bus);
    this.o1.start(); this.o2.start();
    this.lfo = AC.createOscillator(); this.lfoG = AC.createGain(); this.lfo.frequency.value = 7.3; this.lfo.connect(this.lfoG); this.lfoG.connect(this.o1.detune); this.lfoG.connect(this.o2.detune); this.lfo.start();   // roughness
    // intake / combustion noise
    const mkNoise = (type, f, q) => { const s = AC.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const flt = AC.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q; const g = AC.createGain(); g.gain.value = 0; s.connect(flt); flt.connect(g); g.connect(this.bus); s.start(); return { s, flt, g }; };
    this.intake = mkNoise('bandpass', 900, 1.2); this.wind = mkNoise('bandpass', 700, 0.5); this.road = mkNoise('lowpass', 160, 0.7); this.sq = mkNoise('bandpass', 1800, 6);
    // per-surface tyre audio (driven by per-wheel slip + surface): sand hiss / crunch, gravel roar, water splash, wooden boardwalk rumble, body scrape, sand patter on the panels
    this.sandH = mkNoise('bandpass', 3800, 0.6); this.sandC = mkNoise('lowpass', 480, 0.8); this.grav = mkNoise('bandpass', 1500, 0.8); this.splash = mkNoise('bandpass', 1700, 0.5); this.woodN = mkNoise('lowpass', 240, 0.7); this.scr = mkNoise('bandpass', 2600, 3);
    this.woodLfo = AC.createOscillator(); this.woodD = AC.createGain(); this.woodD.gain.value = 0; this.woodLfo.type = 'square'; this.woodLfo.frequency.value = 8; this.woodLfo.connect(this.woodD); this.woodD.connect(this.woodN.g.gain); this.woodLfo.start(); this.prevKind = 'road';
    // turbo whistle + supercharger whine + gear whine
    this.tw = AC.createOscillator(); this.twG = AC.createGain(); this.tw.type = 'sine'; this.twG.gain.value = 0; this.tw.connect(this.twG); this.twG.connect(this.bus); this.tw.start();
    this.sc = AC.createOscillator(); this.scG = AC.createGain(); this.sc.type = 'sawtooth'; this.scLp = AC.createBiquadFilter(); this.scLp.type = 'bandpass'; this.scLp.Q.value = 3; this.scG.gain.value = 0; this.sc.connect(this.scLp); this.scLp.connect(this.scG); this.scG.connect(this.bus); this.sc.start();
    this.gw = AC.createOscillator(); this.gwG = AC.createGain(); this.gw.type = 'triangle'; this.gwG.gain.value = 0; this.gw.connect(this.gwG); this.gwG.connect(this.bus); this.gw.start();
  }
  setCar(snd) {
    if (!snd || this.profile === snd) return; this.profile = snd; const k = snd.kind, AC = this.AC, h = HARM[k] || HARM.i6, ch = CHAR[k] || CHAR.i6;
    this.ch = ch; this.cyl = snd.cyl || 6; this.rough = snd.rough || 0.3;
    const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1); h.forEach((a, i) => { im[i + 1] = a; });
    this.o1.setPeriodicWave(AC.createPeriodicWave(re, im)); const im2 = new Float32Array(5); im2[1] = 1; im2[2] = 0.4; im2[3] = 0.25; this.o2.setPeriodicWave(AC.createPeriodicWave(new Float32Array(5), im2));
    const curve = new Float32Array(1024), dr = ch.drive; for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * dr) / Math.tanh(dr); } this.shaper.curve = curve;
    this.lfoG.gain.value = 6 + this.rough * 22;
  }
  burst(freq, dur, gain, q = 1, type = 'bandpass') {   // one-shot noise puff (blow-off valve, exhaust pop, gear clunk)
    const AC = this.AC, t = AC.currentTime, s = AC.createBufferSource(); s.buffer = this.noiseBuf; const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = AC.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  crash(power) { this.burst(90 + Math.random() * 40, 0.35, 0.18 + 0.3 * power, 0.8, 'lowpass'); this.burst(1800 + Math.random() * 1500, 0.22, 0.08 + 0.14 * power, 1.4); if (power > 0.4) this.burst(4200, 0.5, 0.08 * power, 3); }   // thud + metal crunch + glass/scrape
  pop() { this.burst(160 + Math.random() * 220, 0.09, 0.08 + Math.random() * 0.06, 1.5, 'lowpass'); this.burst(900 + Math.random() * 900, 0.05, 0.05, 1.2); }                                  // exhaust backfire bang
  // c: physics car state, S: spec, thr: throttle 0..1, t: time (s), surface: c.kind, slip: tyre squeal level 0..1
  update(c, S, thr, t, squeal) {
    if (!this.profile) return; const AC = this.AC, now = AC.currentTime, n = Math.min(1.1, c.rpm / S.redline), ch = this.ch, snd = this.profile, tc = 0.035;
    const f = Math.max(14, c.rpm / 60 * this.cyl / 2), load = Math.min(1, thr * 0.85 + (c.air ? 0 : Math.min(0.25, Math.abs(c.ax) / 40)) + (c.nitroOn ? 0.15 : 0));
    // idle lumpiness
    this.lump += 0.02; const lump = 1 + (ch.lump || 0) * Math.sin(t * 9 + Math.sin(t * 2.3) * 2) * (1 - n) * 3;
    this.o1.frequency.setTargetAtTime(f * lump, now, tc); this.o2.frequency.setTargetAtTime(f / 2 * lump, now, tc);
    this.g1.gain.setTargetAtTime(0.65, now, tc); this.g2.gain.setTargetAtTime((ch.sub || 0) * (0.5 + 0.5 * (1 - load * 0.5)) * (1 - n * 0.5), now, tc);
    this.lp.frequency.setTargetAtTime(ch.lp + ch.lpLoad * (0.12 + 0.88 * load) * (0.35 + 0.65 * n), now, 0.05);
    // loudness: idle -> redline, louder on throttle, quieter during the shift cut, chopped by the rev limiter
    let gain = 0.1 + 0.2 * load + 0.1 * n; if (c.shiftT > 0) gain *= 0.35; if (c.lim) gain *= Math.sin(t * 95) > 0 ? 1 : 0.15;
    if (thr < 0.05 && n > 0.3) gain *= 0.6 + 0.4 * (1 - n * 0.4);     // lift-off: engine braking is quieter / drier
    this.eng.gain.setTargetAtTime(gain, now, 0.03);
    // intake roar grows with throttle and rpm
    this.intake.g.gain.setTargetAtTime((0.015 + 0.07 * load * n) * (snd.turbo ? 0.8 : 1.2), now, 0.06); this.intake.flt.frequency.setTargetAtTime(500 + n * 1800, now, 0.1);
    // turbo whistle (spool follows the physics boost) and blow-off valve when you lift at boost
    if (snd.turbo) { this.tw.frequency.setTargetAtTime(900 + c.boost * 3600 + n * 700, now, 0.08); this.twG.gain.setTargetAtTime(Math.pow(c.boost, 1.5) * snd.turbo * 0.045 * (thr > 0.1 ? 1 : 0.3), now, 0.1); }
    else this.twG.gain.setTargetAtTime(0, now, 0.1);
    if (snd.whine) { this.sc.frequency.setTargetAtTime(Math.max(80, c.rpm / 60 * 5.2), now, 0.04); this.scLp.frequency.setTargetAtTime(Math.max(300, c.rpm / 60 * 5.2 * 1.5), now, 0.05); this.scG.gain.setTargetAtTime(0.012 + 0.05 * load * n, now, 0.05); } else this.scG.gain.setTargetAtTime(0, now, 0.1);
    this.gw.frequency.setTargetAtTime(Math.max(60, c.kmh * 11), now, 0.05); this.gwG.gain.setTargetAtTime(Math.min(0.02, c.kmh / 160 * 0.02) * (thr > 0.05 ? 0.6 : 1), now, 0.1);
    // events: lift-off from boost -> blow-off + pops; gear changes -> clunk
    if (this.prevThr > 0.6 && thr < 0.15 && n > 0.35) {
      if (snd.turbo && c.boost > 0.35) this.burst(3200, 0.45, 0.07 * snd.turbo, 1.3);
      if (n > 0.5 && snd.kind !== 'i6' || n > 0.65) this.popT = 0.5 + Math.random() * 0.4;
    }
    if (this.popT > 0) { this.popT -= 1 / 60; if (Math.random() < 0.18) this.burst(180 + Math.random() * 260, 0.07, 0.05 + Math.random() * 0.05, 1.5, 'lowpass'); }
    if (c.shifts !== this.prevShifts) { this.prevShifts = c.shifts; this.burst(130, 0.12, 0.05, 2, 'lowpass'); }
    this.prevThr = thr;
    // wind, road/gravel roar, tyre squeal
    const v = c.kmh / 100, rough = c.kind === 'gravel' ? 3.2 : c.kind === 'grass' ? 3.8 : c.kind === 'sand' ? 2.4 : 1;
    this.wind.g.gain.setTargetAtTime(Math.min(0.22, v * v * 0.05), now, 0.1); this.wind.flt.frequency.setTargetAtTime(500 + c.kmh * 5, now, 0.2);
    this.road.g.gain.setTargetAtTime(c.air ? 0 : Math.min(0.2, v * 0.05 * rough), now, 0.1); this.road.flt.frequency.setTargetAtTime(120 + c.kmh * 1.2, now, 0.2);
    this.sq.g.gain.setTargetAtTime(squeal, now, 0.05); this.sq.flt.frequency.setTargetAtTime(1500 + c.kmh * 7 + squeal * 500, now, 0.1);
    if (c.w) this.surfaces(c, now, v);
  }
  surfaces(c, now, v) {                                        // per-wheel surface sounds: each wheel contributes by its own surface, slip speed and load
    let sandH = 0, sandC = 0, grav = 0, splash = 0, wood = 0, slipSand = 0, patter = 0;
    for (const w of c.w) { if (!w.hit) continue; const sl = Math.min(1, (w.slipV || 0) * 0.09), sp = Math.min(1, c.kmh / 120), ld = Math.min(1.3, w.N / 3000);
      if (w.kind === 'sand') { sandH += (0.25 * sp + sl * 0.9) * ld; sandC += (0.2 * sp + 0.6 * sl) * ld; slipSand += sl; }
      else if (w.kind === 'grass') { sandC += (0.15 * sp + 0.35 * sl) * ld; sandH += 0.15 * sl; slipSand += sl * 0.5; }
      else if (w.kind === 'gravel') { grav += (0.45 * sp + 0.7 * sl) * ld; slipSand += sl * 0.6; }
      else if (w.kind === 'water') splash += (0.4 + 0.9 * sp) * Math.min(1, c.kmh / 25 + 0.2);
      else if (w.kind === 'wood') wood += 0.25 * Math.min(1, c.kmh / 20) * ld; }
    const set = (n, g, f) => { n.g.gain.setTargetAtTime(Math.min(0.28, g), now, 0.06); if (f) n.flt.frequency.setTargetAtTime(f, now, 0.1); };
    set(this.sandH, sandH * 0.09, 2600 + c.kmh * 20); set(this.sandC, sandC * 0.1, 260 + c.kmh * 2); set(this.grav, grav * 0.1, 1100 + c.kmh * 8); set(this.splash, splash * 0.075, 1200 + c.kmh * 9);
    this.woodN.g.gain.setTargetAtTime(wood * 0.06, now, 0.05); this.woodLfo.frequency.setTargetAtTime(Math.max(2, c.kmh / 3.6 / 0.45), now, 0.05); this.woodD.gain.setTargetAtTime(wood * 0.05, now, 0.05);       // plank seams every ~0.45 m: thumping rumble
    set(this.scr, c.scrape > 0.04 ? Math.min(0.2, c.scrape * 0.5) : 0, 1800 + Math.min(2500, c.kmh * 20));                                                                                                  // body scraping the ground / a wall
    if (slipSand > 0.6 && Math.random() < Math.min(0.5, slipSand * 0.12)) this.burst(2800 + Math.random() * 2600, 0.03, 0.025 + Math.random() * 0.02, 2.5);                                                    // grains pattering on the body
    if (c.wetT > 0.3 && this.prevKind !== 'deep') { this.burst(500, 0.5, 0.2, 0.6); this.prevKind = 'deep'; } else if (c.wetT <= 0.3) this.prevKind = c.kind;
  }
}

