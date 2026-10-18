// Procedural audio (WebAudio): every sound effect is synthesised, plus a small generative lyre score in
// D Dorian that switches to a faster, darker battle pattern while enemies are engaged.
export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.battle = 0;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);
    // shared reverb (generated impulse) for the music and big sounds
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // ambience: wind + distant surf
    const wind = this._noise(true); const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.05;
    wind.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master); wind.start();
    this.glideGain = ctx.createGain(); this.glideGain.gain.value = 0;
    const g2 = this._noise(true); const gf = ctx.createBiquadFilter(); gf.type = 'lowpass'; gf.frequency.value = 900;
    g2.connect(gf); gf.connect(this.glideGain); this.glideGain.connect(this.master); g2.start();
    this._nextNote = ctx.currentTime + 0.5; this._step = 0;
  }

  _noise(loop = false) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; return s; }
  _env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  tone(freq, { type = 'sine', dur = 0.2, vol = 0.3, at = 0, slide = 0, attack = 0.005, verb = 0, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    this._env(g, t, attack, dur, vol);
    o.connect(g); g.connect(dest || this.sfx);
    if (verb) { const v = this.ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verb); }
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, at = 0, freq = 1200, q = 1, type = 'bandpass', sweep = 0, attack = 0.004 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const s = this._noise(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    this._env(g, t, attack, dur, vol);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.1);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'swing': this.noise({ dur: 0.16, vol: 0.25, freq: 900, sweep: 3, q: 2 }); break;
      case 'spin': this.noise({ dur: 0.45, vol: 0.35, freq: 500, sweep: 5, q: 2 }); this.tone(330, { type: 'triangle', dur: 0.4, vol: 0.08, slide: 2 }); break;
      case 'hit': this.noise({ dur: 0.12, vol: 0.5, freq: 400, q: 0.8, type: 'lowpass' }); this.tone(140, { type: 'square', dur: 0.08, vol: 0.12, slide: 0.5 }); break;
      case 'bone': this.noise({ dur: 0.1, vol: 0.4, freq: 2400, q: 3 }); this.tone(600, { type: 'square', dur: 0.05, vol: 0.06, slide: 0.6 }); break;
      case 'block': this.tone(1800, { type: 'triangle', dur: 0.35, vol: 0.15, slide: 0.98 }); this.tone(2650, { type: 'sine', dur: 0.5, vol: 0.08 }); this.noise({ dur: 0.06, vol: 0.3, freq: 3000 }); break;
      case 'parry': this.tone(1500, { dur: 0.6, vol: 0.2, verb: 0.6 }); this.tone(2250, { dur: 0.7, vol: 0.12, at: 0.03, verb: 0.6 }); break;
      case 'hurt': this.tone(220, { type: 'sawtooth', dur: 0.18, vol: 0.18, slide: 0.5 }); this.noise({ dur: 0.15, vol: 0.3, freq: 300, type: 'lowpass' }); break;
      case 'coin': this.tone(1318, { type: 'square', dur: 0.06, vol: 0.06 }); this.tone(1975, { type: 'square', dur: 0.18, vol: 0.06, at: 0.06 }); break;
      case 'heart': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, { type: 'triangle', dur: 0.15, vol: 0.12, at: i * 0.06 })); break;
      case 'jump': this.noise({ dur: 0.12, vol: 0.12, freq: 600, sweep: 1.8 }); break;
      case 'land': this.noise({ dur: 0.12, vol: 0.25, freq: 250, type: 'lowpass' }); break;
      case 'splash': this.noise({ dur: 0.6, vol: 0.4, freq: 1400, sweep: 0.4, q: 0.7 }); break;
      case 'stroke': this.noise({ dur: 0.3, vol: 0.08, freq: 900, sweep: 0.6, q: 0.8 }); break;
      case 'step': this.noise({ dur: 0.05, vol: 0.05, freq: 700, q: 1 }); break;
      case 'pot': this.noise({ dur: 0.25, vol: 0.4, freq: 2000, q: 1.5, sweep: 0.5 }); this.tone(900, { type: 'triangle', dur: 0.1, vol: 0.08, slide: 0.7 }); break;
      case 'die': this.noise({ dur: 0.6, vol: 0.35, freq: 600, sweep: 0.2, type: 'lowpass' }); this.tone(300, { type: 'sawtooth', dur: 0.5, vol: 0.08, slide: 0.3 }); break;
      case 'alert': this.tone(880, { type: 'square', dur: 0.06, vol: 0.06 }); this.tone(1320, { type: 'square', dur: 0.1, vol: 0.06, at: 0.07 }); break;
      case 'glider': this.noise({ dur: 0.3, vol: 0.2, freq: 700, sweep: 0.5 }); break;
      case 'stamina': this.tone(440, { type: 'square', dur: 0.08, vol: 0.05 }); break;
      case 'lock': this.tone(1046, { type: 'sine', dur: 0.12, vol: 0.12 }); break;
      case 'talk': this.tone(700 + Math.random() * 200, { type: 'triangle', dur: 0.04, vol: 0.05 }); break;
      case 'chest': // the classic four-note "item get" rise
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, { type: 'triangle', dur: i === 3 ? 0.8 : 0.16, vol: 0.18, at: i * 0.16, verb: 0.5 }));
        [196, 247, 294, 392].forEach((f, i) => this.tone(f, { type: 'sine', dur: i === 3 ? 0.8 : 0.16, vol: 0.1, at: i * 0.16 })); break;
      case 'relic':
        [587, 740, 880, 1175, 880, 1175, 1480].forEach((f, i) => this.tone(f, { type: 'triangle', dur: i === 6 ? 1.6 : 0.2, vol: 0.16, at: i * 0.14, verb: 0.8 })); break;
      case 'boss': [73, 69, 65].forEach((f, i) => this.tone(f, { type: 'sawtooth', dur: 1.2, vol: 0.2, at: i * 0.9, verb: 0.7 })); this.noise({ dur: 2.5, vol: 0.3, freq: 120, type: 'lowpass' }); break;
      case 'roar': this.tone(90, { type: 'sawtooth', dur: 1.1, vol: 0.3, slide: 0.6, attack: 0.08, verb: 0.5 }); this.noise({ dur: 1.0, vol: 0.4, freq: 300, sweep: 0.5, type: 'lowpass', attack: 0.06 }); break;
      case 'slam': this.tone(55, { type: 'sine', dur: 0.8, vol: 0.6, slide: 0.5 }); this.noise({ dur: 0.7, vol: 0.5, freq: 200, type: 'lowpass' }); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, { type: 'triangle', dur: i === 6 ? 2.2 : 0.22, vol: 0.18, at: i * 0.2, verb: 0.9 })); break;
      case 'gameover': [392, 370, 349, 330].forEach((f, i) => this.tone(f, { type: 'triangle', dur: 0.5, vol: 0.15, at: i * 0.45, verb: 0.8 })); break;
      case 'menu': this.tone(660, { type: 'triangle', dur: 0.08, vol: 0.08 }); break;
    }
  }

  setGlide(on) { if (this.glideGain) this.glideGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.2); }

  /** generative lyre music; call every frame */
  update(battle) {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    this.battle += ((battle ? 1 : 0) - this.battle) * 0.02;
    const fight = this.battle > 0.5;
    const D = 146.83; // D3
    const dorian = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19];
    const prog = fight ? [0, 0, -2, -4] : [0, 3, -2, 0, 5, 3, -4, 0]; // degrees for the drone/bass per bar
    const stepDur = fight ? 0.16 : 0.32;
    while (this._nextNote < ctx.currentTime + 0.3) {
      const t = this._nextNote - ctx.currentTime;
      const s = this._step++;
      const bar = Math.floor(s / 8) % prog.length;
      const root = prog[bar];
      if (s % 8 === 0) { // bass + pad
        const f = D * Math.pow(2, (dorian[(root + 14) % 7] - 12 + (root < 0 ? -12 : 0)) / 12) / (fight ? 1 : 2);
        this.tone(f, { type: fight ? 'sawtooth' : 'sine', dur: stepDur * 7.5, vol: fight ? 0.05 : 0.08, at: t, attack: 0.08, dest: this.music });
        this.tone(f * 1.5, { type: 'sine', dur: stepDur * 7.5, vol: 0.04, at: t, attack: 0.3, dest: this.music });
      }
      // lyre: arpeggio with random leaps, rests
      const pat = fight ? [0, 2, 4, 2, 0, 4, 7, 4] : [0, 4, 2, 7, 4, 9, 7, 4];
      if (Math.random() < (fight ? 0.9 : 0.7)) {
        const deg = root + pat[s % 8] + (Math.random() < 0.15 ? 2 : 0);
        const idx = ((deg % 7) + 7) % 7, oct = Math.floor(deg / 7);
        const f = D * 2 * Math.pow(2, (dorian[idx] + 12 * oct) / 12);
        this.tone(f, { type: 'triangle', dur: fight ? 0.25 : 0.7, vol: fight ? 0.05 : 0.07, at: t, verb: 0.6, dest: this.music });
        this.tone(f * 2.01, { type: 'sine', dur: 0.3, vol: 0.015, at: t, dest: this.music });
      }
      if (fight && s % 2 === 0) { // drum
        const tt = ctx.currentTime + t;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(s % 4 === 0 ? 110 : 160, tt); o.frequency.exponentialRampToValueAtTime(40, tt + 0.12);
        this._env(g, tt, 0.003, 0.15, s % 4 === 0 ? 0.25 : 0.1);
        o.connect(g); g.connect(this.music); o.start(tt); o.stop(tt + 0.2);
      }
      this._nextNote += stepDur;
    }
  }
}
