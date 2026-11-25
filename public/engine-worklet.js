// engine-worklet.js - the engine itself, built sample by sample the way the real sound is made: every cylinder firing sends a pressure
// pulse down an exhaust pipe (a delay line that rings), the pipes resonate through the muffler (formants) and the intake breathes in time.
// Uneven pipe lengths and firing order give each layout its voice (boxer rumble, cross-plane V8 burble, smooth straight six, rotary buzz).
const KINDS = {
  //        firing: which exhaust bank each pulse goes to; pipe: delay per bank (ms); formants: [Hz, Q, level]
  boxer:   { bank: [0, 0, 1, 1], amp: [1, 0.86, 0.74, 0.92], pipe: [8.6, 13.1], decay: 0.55, noise: 0.35, drive: 1.9, formants: [[105, 3, 1.1], [310, 2.5, 0.8], [980, 1.8, 0.35]] },
  v8:      { bank: [0, 1, 0, 0, 1, 0, 1, 1], amp: [1, 0.9, 0.96, 0.84, 1, 0.88, 0.94, 0.86], pipe: [10.8, 13.9], decay: 0.8, noise: 0.3, drive: 2.5, formants: [[72, 3, 1.3], [185, 2.5, 1], [640, 1.8, 0.35]] },
  v8sc:    { bank: [0, 1, 0, 0, 1, 0, 1, 1], amp: [1, 0.92, 0.97, 0.86, 1, 0.9, 0.95, 0.88], pipe: [10.2, 13.2], decay: 0.75, noise: 0.35, drive: 2.9, formants: [[78, 3, 1.3], [210, 2.5, 1], [820, 1.8, 0.45]] },
  v8flat:  { bank: [0, 1, 0, 1, 0, 1, 0, 1], amp: [1, 0.97, 0.99, 0.96], pipe: [6.1, 6.4], decay: 0.42, noise: 0.3, drive: 2.2, formants: [[165, 2, 0.8], [540, 2.5, 0.9], [1750, 2, 0.45]] },
  i6:      { bank: [0, 0, 0, 0, 0, 0], amp: [1, 0.97, 0.98, 0.96, 0.99, 0.97], pipe: [7.4, 7.4], decay: 0.48, noise: 0.22, drive: 1.6, formants: [[128, 3, 0.9], [430, 2.2, 0.8], [1250, 2, 0.35]] },
  flat6:   { bank: [0, 1, 0, 1, 0, 1], amp: [1, 0.93, 0.97, 0.9, 0.98, 0.92], pipe: [6.9, 8.4], decay: 0.45, noise: 0.34, drive: 2.1, formants: [[135, 3, 0.9], [500, 3, 0.85], [1550, 2, 0.45]] },
  flat6na: { bank: [0, 1, 0, 1, 0, 1], amp: [1, 0.95, 0.98, 0.93, 0.99, 0.94], pipe: [5.6, 6.5], decay: 0.34, noise: 0.32, drive: 2.3, formants: [[175, 2, 0.7], [720, 3, 1], [2500, 2.2, 0.65]] },
  rotary:  { bank: [0, 1, 0, 1], amp: [1, 0.9, 0.98, 0.88], pipe: [4.8, 5.3], decay: 0.3, noise: 0.5, drive: 2.8, formants: [[230, 2, 0.7], [920, 3, 1], [2700, 2, 0.7]] },
};
class Pipe { constructor(ms) { this.buf = new Float32Array(2048); this.w = 0; this.lp = 0; this.set(ms); } set(ms) { this.d = Math.max(8, Math.min(2000, Math.round(ms / 1000 * sampleRate))); }
  run(x) { const d = this.buf[(this.w - this.d + 2048) & 2047]; this.lp += (d - this.lp) * 0.42; const y = x - this.lp * 0.62; this.buf[this.w] = y; this.w = (this.w + 1) & 2047; return y; } }
class Band { constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(500, 1); }
  set(f, q) { const w = 2 * Math.PI * Math.min(f, sampleRate * 0.45) / sampleRate, al = Math.sin(w) / (2 * q), a0 = 1 + al; this.b0 = al / a0; this.a1 = -2 * Math.cos(w) / a0; this.a2 = (1 - al) / a0; }
  run(x) { const y = this.b0 * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; } }

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [['rpm', 900, 100, 12000], ['load', 0, 0, 1], ['cut', 0, 0, 1], ['pop', 0, 0, 1], ['on', 0, 0, 1]].map(([name, defaultValue, minValue, maxValue]) => ({ name, defaultValue, minValue, maxValue, automationRate: 'k-rate' })); }
  constructor(options) {
    super();
    this.phase = 0; this.idx = -1; this.cycle = 0; this.rpm = 900; this.load = 0; this.level = 0;
    this.e = [0, 0]; this.f = [0, 0]; this.pipes = [new Pipe(8), new Pipe(9)]; this.bands = [new Band(), new Band(), new Band()]; this.air = new Band(); this.air.set(1100, 0.8);
    this.l1 = this.l2 = 0; this.dcX = this.dcY = 0; this.tick = 0; this.bang = 0; this.seed = 22222;
    this.setup(options?.processorOptions?.kind || 'i6', options?.processorOptions?.rough);
    this.port.onmessage = ev => this.setup(ev.data.kind, ev.data.rough);
  }
  setup(kind, rough) { this.k = KINDS[kind] || KINDS.i6; this.rough = rough ?? 0.3; this.pipes[0].set(this.k.pipe[0]); this.pipes[1].set(this.k.pipe[1]); this.k.formants.forEach(([f, q], i) => this.bands[i].set(f, q)); this.idx = -1; }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 1073741823.5 - 1; }
  process(inputs, outputs, p) {
    const out = outputs[0][0], on = p.on[0];
    if (on < 0.001 && this.level < 0.001) return true;
    const k = this.k, n = k.bank.length, load = p.load[0], cut = p.cut[0] > 0.5, popping = p.pop[0] > 0.5, target = Math.max(200, p.rpm[0]);
    for (let i = 0; i < out.length; i++) {
      this.rpm += (target - this.rpm) * 0.0016; this.load += (load - this.load) * 0.002; this.level += (on - this.level) * 0.002;
      const rpm = this.rpm, ld = this.load, idle = Math.max(0, 1 - (rpm - 800) / 1600);
      this.phase += rpm / 120 / sampleRate; if (this.phase >= 1) { this.phase -= 1; this.cycle++; }
      const idx = (this.phase * n) | 0;
      if (idx !== this.idx) {                                       // a cylinder fires
        this.idx = idx; const bank = k.bank[idx];
        let a = k.amp[idx % k.amp.length] * (1 + this.rnd() * (0.08 + this.rough * 0.14 + idle * this.rough * 0.3)) * (0.42 + 0.58 * ld);
        if (cut && this.rnd() > -0.5) a *= 0.04;                    // rev limiter drops sparks
        if (popping && this.rnd() > 0.82) { this.bang = 1.6 + this.rnd(); a += 1.2; }
        this.e[bank] += a; this.f[bank] += a; this.tick = 0.5;
      }
      const interval = 120 / (rpm * n), tau = Math.max(0.0009, Math.min(0.011, interval * k.decay)), d1 = Math.exp(-1 / (tau * sampleRate)), d2 = Math.exp(-1 / (tau * 0.22 * sampleRate));
      let sum = 0, envSum = 0;
      for (let b = 0; b < 2; b++) { this.e[b] *= d1; this.f[b] *= d2; const pulse = this.e[b] - this.f[b], grit = 1 + this.rnd() * k.noise * (1.2 + idle * 0.4); sum += this.pipes[b].run(pulse * grit); envSum += this.e[b]; }
      if (this.bang > 0.01) { sum += this.rnd() * this.bang; this.bang *= 0.9975; }
      this.tick *= 0.9; const mech = this.rnd() * this.tick * 0.05 * (0.4 + idle);                       // valve train
      let y = sum * 0.28 + this.bands[0].run(sum) * k.formants[0][2] * 3 + this.bands[1].run(sum) * k.formants[1][2] * 2.2 + this.bands[2].run(sum) * k.formants[2][2] * (1.1 + ld * 1.8);
      y += this.air.run(this.rnd()) * envSum * ld * Math.min(1, rpm / 6500) * 0.5;                       // intake
      const cutoff = 700 + ld * 3600 + rpm * 0.32 + (popping ? 2000 : 0), a1 = 1 - Math.exp(-6.2832 * cutoff / sampleRate);
      this.l1 += (y - this.l1) * a1; this.l2 += (this.l1 - this.l2) * a1;
      let s = Math.tanh((this.l2 + mech) * k.drive * (0.55 + 0.45 * ld));
      const dc = s - this.dcX + 0.995 * this.dcY; this.dcX = s; this.dcY = dc;
      out[i] = dc * this.level * 0.5;
    }
    return true;
  }
}
registerProcessor('engine', EngineProcessor);
