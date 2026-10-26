// All sound is synthesized with the Web Audio API — zero audio downloads.
// Must be initialised after a user gesture (call unlock() from a click).
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
    this.muted = false;
    this.ambientNodes = [];
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.applyVolumes();
    this.startAmbient();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const m = this.muted ? 0 : this.volumes.master;
    this.master.gain.value = m;
    this.musicGain.gain.value = this.volumes.music * 0.5;
    this.sfxGain.gain.value = this.volumes.sfx;
  }

  startAmbient() {
    if (!this.ctx || this.ambientNodes.length) return;
    const ctx = this.ctx;
    // Deep cathedral drone: two detuned low oscillators + filtered wind noise
    const g = ctx.createGain(); g.gain.value = 0.16; g.connect(this.musicGain);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55.7;
    const o3 = ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110.3;
    const g3 = ctx.createGain(); g3.gain.value = 0.25;
    o1.connect(g); o2.connect(g); o3.connect(g3); g3.connect(g);
    o1.start(); o2.start(); o3.start();
    // wind noise
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.035;
    lfo.connect(lfoG); lfoG.connect(ng.gain); lfo.start();
    src.connect(f); f.connect(ng); ng.connect(this.musicGain);
    src.start();
    this.ambientNodes = [o1, o2, o3, src, lfo];
  }

  setVolumes(v) { Object.assign(this.volumes, v); this.applyVolumes(); }

  // --- SFX helpers -------------------------------------------------------
  env(node, dur, peak = 1, attack = 0.005) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g);
    return g;
  }

  noiseBurst(dur, filterFreq, peak, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    src.connect(f);
    const g = this.env(f, dur, peak);
    g.connect(this.sfxGain);
    src.start();
  }

  tone(freq, dur, peak, type = 'square', slideTo = null) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
    const g = this.env(o, dur, peak);
    g.connect(this.sfxGain);
    o.start(); o.stop(this.ctx.currentTime + dur + 0.05);
  }

  crossbowFire() { this.tone(180, 0.12, 0.5, 'sawtooth', 60); this.noiseBurst(0.1, 2000, 0.3, 'bandpass'); }
  crossbowReload() { this.noiseBurst(0.08, 900, 0.25); setTimeout(() => this.noiseBurst(0.06, 1400, 0.2), 160); }
  cannonFire() { this.noiseBurst(0.5, 500, 1.0); this.tone(70, 0.4, 0.8, 'sine', 30); }
  scourgeFire() { this.tone(320, 0.3, 0.35, 'sine', 90); this.tone(480, 0.2, 0.2, 'triangle', 200); }
  scourgeDrain() { this.tone(140, 0.25, 0.2, 'sine', 400); }
  impact() { this.noiseBurst(0.12, 1200, 0.4); }
  thud() { this.noiseBurst(0.15, 300, 0.5); }
  enemyDeath() { this.tone(160, 0.5, 0.4, 'sawtooth', 40); this.noiseBurst(0.3, 600, 0.3); }
  enemyHit() { this.tone(220, 0.1, 0.3, 'square', 120); this.noiseBurst(0.08, 800, 0.25); }
  playerHurt() { this.tone(110, 0.25, 0.5, 'sawtooth', 55); }
  footstep(run) { this.noiseBurst(run ? 0.07 : 0.1, 400, run ? 0.18 : 0.1); }
  pickup() { this.tone(520, 0.12, 0.3, 'sine', 780); }
  doorOpen() { this.noiseBurst(1.2, 200, 0.5); this.tone(60, 1.0, 0.4, 'sine', 40); }
  lockClick() { this.noiseBurst(0.05, 2500, 0.3, 'highpass'); }
  bossRoar() { this.tone(80, 1.2, 0.6, 'sawtooth', 45); this.noiseBurst(0.8, 350, 0.4); }
  victory() { [220, 277, 330, 440].forEach((f, i) => setTimeout(() => this.tone(f, 0.6, 0.25, 'sine'), i * 220)); }
  death() { this.tone(200, 1.5, 0.5, 'sawtooth', 30); }
}

export const audio = new AudioSys();
