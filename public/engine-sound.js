// engine-sound.js - game audio tied to the physics. The engine itself is synthesised firing by firing in engine-worklet.js; this file feeds it
// RPM and load and adds turbo spool / blow-off, supercharger and gear whine, tyre squeal, wind, road and surface noise and crash sounds.
const loaded = new WeakMap();   // one module load per audio context
export class EngineSound {
  constructor(AC, out) {
    this.AC = AC; this.out = out; this.prevThr = 0; this.prevShifts = 0; this.popT = 0; this.lump = 0; this.kind = ''; this.profile = null;
    const n = AC.sampleRate * 2, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf;
    this.bus = AC.createGain(); this.bus.gain.value = 1; this.bus.connect(out);
    const bn = AC.createBuffer(1, n, AC.sampleRate), bd = bn.getChannelData(0); let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * d[i]) / 1.02; bd[i] = last * 3.5; } this.brown = bn;   // deep noise for road and wind
    this.eng = AC.createGain(); this.eng.gain.value = 0; this.eng.connect(this.bus); this.node = null;
    if (AC.audioWorklet) {
      if (!loaded.has(AC)) loaded.set(AC, AC.audioWorklet.addModule(new URL('./engine-worklet.js', import.meta.url)));
      loaded.get(AC).then(() => { this.node = new AudioWorkletNode(AC, 'engine', { numberOfInputs: 0, outputChannelCount: [1], processorOptions: this.profile ? { kind: this.profile.kind, rough: this.profile.rough } : {} }); this.node.connect(this.eng); this.sendCar(); }).catch(e => console.warn('engine sound unavailable', e));
    }
    // tyre squeal: two wavering tones with some hiss, not plain noise
    this.sqG = AC.createGain(); this.sqG.gain.value = 0; const sqBp = AC.createBiquadFilter(); sqBp.type = 'bandpass'; sqBp.frequency.value = 1300; sqBp.Q.value = 1.1; this.sqG.connect(sqBp); sqBp.connect(this.bus);
    const wob = AC.createBufferSource(); wob.buffer = this.noiseBuf; wob.loop = true; const wobLp = AC.createBiquadFilter(); wobLp.type = 'lowpass'; wobLp.frequency.value = 14; const wobG = AC.createGain(); wobG.gain.value = 2600; wob.connect(wobLp); wobLp.connect(wobG); wob.start();
    this.sqO = [[780, 1], [1175, 0.55], [1580, 0.3]].map(([f, a]) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.value = a * 0.35; wobG.connect(o.detune); o.connect(g); g.connect(this.sqG); o.start(); return { o, f }; });
    // intake / combustion noise
    const mkNoise = (type, f, q, deep) => { const s = AC.createBufferSource(); s.buffer = deep ? this.brown : this.noiseBuf; s.loop = true; const flt = AC.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q; const g = AC.createGain(); g.gain.value = 0; s.connect(flt); flt.connect(g); g.connect(this.bus); s.start(); return { s, flt, g }; };
    this.intake = mkNoise('bandpass', 900, 1.2); this.wind = mkNoise('bandpass', 520, 0.4, true); this.road = mkNoise('lowpass', 220, 0.7, true); this.sq = mkNoise('bandpass', 1800, 6);
    // per-surface tyre audio (driven by per-wheel slip + surface): sand hiss / crunch, gravel roar, water splash, wooden boardwalk rumble, body scrape, sand patter on the panels
    this.sandH = mkNoise('bandpass', 3800, 0.6); this.sandC = mkNoise('lowpass', 480, 0.8); this.grav = mkNoise('bandpass', 1500, 0.8); this.splash = mkNoise('bandpass', 1700, 0.5); this.woodN = mkNoise('lowpass', 240, 0.7); this.scr = mkNoise('bandpass', 2600, 3);
    this.woodLfo = AC.createOscillator(); this.woodD = AC.createGain(); this.woodD.gain.value = 0; this.woodLfo.type = 'square'; this.woodLfo.frequency.value = 8; this.woodLfo.connect(this.woodD); this.woodD.connect(this.woodN.g.gain); this.woodLfo.start(); this.prevKind = 'road';
    // turbo whistle + supercharger whine + gear whine
    this.tw = AC.createOscillator(); this.twG = AC.createGain(); this.tw.type = 'sine'; this.twG.gain.value = 0; this.tw.connect(this.twG); this.twG.connect(this.bus); this.tw.start();
    this.sc = AC.createOscillator(); this.scG = AC.createGain(); this.sc.type = 'sawtooth'; this.scLp = AC.createBiquadFilter(); this.scLp.type = 'bandpass'; this.scLp.Q.value = 3; this.scG.gain.value = 0; this.sc.connect(this.scLp); this.scLp.connect(this.scG); this.scG.connect(this.bus); this.sc.start();
    this.gw = AC.createOscillator(); this.gwG = AC.createGain(); this.gw.type = 'triangle'; this.gwG.gain.value = 0; this.gw.connect(this.gwG); this.gwG.connect(this.bus); this.gw.start();
  }
  setCar(snd) {
    if (!snd || this.profile === snd) return; this.profile = snd; this.sendCar();
  }
  sendCar() { if (this.node && this.profile) this.node.port.postMessage({ kind: this.profile.kind, rough: this.profile.rough }); }
  tone(f0, f1, dur, gain, type = 'sine', delay = 0) {   // short pitched hit (body thump, ringing panel)
    const AC = this.AC, t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(freq, dur, gain, q = 1, type = 'bandpass', delay = 0) {   // one-shot noise puff (blow-off valve, exhaust pop, gear clunk)
    const AC = this.AC, t = AC.currentTime + delay, s = AC.createBufferSource(); s.buffer = this.noiseBuf; const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = AC.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  crash(power) {                                       // body thump, crumpling metal, ringing panels, then glass and loose parts
    const R = Math.random;
    this.tone(130, 38, 0.28, 0.22 + 0.45 * power); this.burst(220, 0.22, 0.2 + 0.4 * power, 0.7, 'lowpass');
    for (let i = 0, n = 3 + Math.round(power * 9); i < n; i++) this.burst(350 + R() * 2600, 0.03 + R() * 0.09, (0.07 + 0.2 * power) * (0.5 + R()), 1.5 + R() * 3, 'bandpass', R() * 0.22 * (0.4 + power));
    for (const f of [310, 523, 787]) this.tone(f * (0.9 + R() * 0.2), f * 0.85, 0.2 + power * 0.35, 0.02 + 0.05 * power, 'triangle', R() * 0.03);
    if (power > 0.35) for (let i = 0, n = Math.round(power * 22); i < n; i++) this.burst(4200 + R() * 5000, 0.02 + R() * 0.07, 0.03 + R() * 0.07 * power, 7, 'bandpass', 0.04 + R() * R() * 0.8);
    if (power > 0.55) for (let i = 0; i < 6; i++) this.burst(700 + R() * 1800, 0.05, 0.05, 4, 'bandpass', 0.3 + R() * 0.9);
  }
  pop() { this.burst(160 + Math.random() * 220, 0.09, 0.08 + Math.random() * 0.06, 1.5, 'lowpass'); this.burst(900 + Math.random() * 900, 0.05, 0.05, 1.2); }                                  // exhaust backfire bang
  // c: physics car state, S: spec, thr: throttle 0..1, t: time (s), surface: c.kind, slip: tyre squeal level 0..1
  update(c, S, thr, t, squeal) {
    if (!this.profile) return; const AC = this.AC, now = AC.currentTime, n = Math.min(1.1, c.rpm / S.redline), snd = this.profile;
    const load = Math.min(1, thr * 0.85 + (c.air ? 0 : Math.min(0.25, Math.abs(c.ax) / 40)) + (c.nitroOn ? 0.15 : 0));
    // the engine: the worklet makes the sound, here it only gets revs, load, limiter and pops
    if (this.node) { const P = this.node.parameters; P.get('rpm').setTargetAtTime(Math.max(300, c.rpm), now, 0.02); P.get('load').setTargetAtTime(Math.max(0, load), now, 0.03); P.get('cut').setValueAtTime(c.lim ? 1 : 0, now); P.get('pop').setValueAtTime(this.popT > 0 && thr < 0.1 ? 1 : 0, now); P.get('on').setValueAtTime(1, now); }
    let gain = 0.34 + 0.3 * load + 0.2 * n; if (c.shiftT > 0) gain *= 0.4;
    if (thr < 0.05 && n > 0.3) gain *= 0.7;          // lift-off: engine braking is quieter
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
      if (snd.kind !== 'diesel' && (n > 0.5 && snd.kind !== 'i6' || n > 0.65)) this.popT = 0.5 + Math.random() * 0.4;
    }
    if (this.popT > 0) this.popT -= 1 / 60;
    if (c.shifts !== this.prevShifts) { this.prevShifts = c.shifts; this.burst(130, 0.12, 0.05, 2, 'lowpass'); }
    this.prevThr = thr;
    // wind, road/gravel roar, tyre squeal
    const v = c.kmh / 100, rough = c.kind === 'gravel' ? 3.2 : c.kind === 'grass' ? 3.8 : c.kind === 'sand' ? 2.4 : 1;
    this.wind.g.gain.setTargetAtTime(Math.min(0.5, v * v * 0.12) * (1 + 0.25 * Math.sin(t * 1.7) * Math.sin(t * 0.63)), now, 0.1); this.wind.flt.frequency.setTargetAtTime(330 + c.kmh * 4.5, now, 0.2);
    this.road.g.gain.setTargetAtTime(c.air ? 0 : Math.min(0.6, v * 0.16 * rough), now, 0.1); this.road.flt.frequency.setTargetAtTime(120 + c.kmh * 1.2, now, 0.2);
    this.sq.g.gain.setTargetAtTime(squeal * 0.3, now, 0.05); this.sq.flt.frequency.setTargetAtTime(1500 + c.kmh * 7 + squeal * 500, now, 0.1);
    this.sqG.gain.setTargetAtTime(squeal * squeal * 0.5, now, squeal > 0.02 ? 0.04 : 0.09); for (const { o, f } of this.sqO) o.frequency.setTargetAtTime(f * (0.9 + Math.min(0.35, c.kmh / 500) + squeal * 0.12), now, 0.08);
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

