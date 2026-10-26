// Renderer, camera, resize handling, adaptive pixel ratio and quality tiers.
import * as THREE from 'three';

export class Engine {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.frameCount = 0;
    this.fpsAccum = 0;
    this.fpsSamples = 0;
    this.currentDpr = 1;
    this.targetQuality = 'auto';
    this.adaptiveDropped = false;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      this._fatal('WebGL could not be initialised. Your browser or device may not support it.');
      throw e;
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060a);
    this.scene.fog = new THREE.FogExp2(0x07060a, 0.042);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 90);
    this.scene.add(this.camera);

    // base lighting (dark, moody) — tracked so teardown can preserve them
    const hemi = new THREE.HemisphereLight(0x3d4256, 0x14110d, 0.8);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0x26262f, 0.9);
    this.scene.add(amb);
    this.baseLights = [hemi, amb];

    // pooled point lights: only the nearest torches get a real light
    this.lightPool = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xff8c3a, 0, 11, 1.8);
      l.visible = false;
      l.userData.base = 0;
      this.scene.add(l);
      this.lightPool.push(l);
    }

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.state === 'playing') this.game.pause();
    });
    this.resize();
  }

  _fatal(msg) {
    const el = document.getElementById('webgl-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  setQuality(q) {
    this.targetQuality = q;
    if (q === 'low') {
      this.currentDpr = Math.min(window.devicePixelRatio, 1) * 0.75;
      this.renderer.setPixelRatio(this.currentDpr);
    } else {
      this.currentDpr = Math.min(window.devicePixelRatio, 1.75);
      this.renderer.setPixelRatio(this.currentDpr);
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  // Adaptive: drop pixel ratio if fps sags below ~28 for a sustained period.
  _adapt(dt) {
    if (this.targetQuality !== 'auto' || this.adaptiveDropped) return;
    this.frameCount++;
    this.fpsAccum += dt;
    this.fpsSamples++;
    if (this.fpsSamples >= 60) {
      const avg = this.fpsSamples / this.fpsAccum;
      this.fpsAccum = 0; this.fpsSamples = 0;
      if (avg < 26 && this.currentDpr > 0.55) {
        this.currentDpr = Math.max(0.55, this.currentDpr * 0.8);
        this.renderer.setPixelRatio(this.currentDpr);
        this.resize();
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    this._running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      this._adapt(dt);
      this.game.onFrame(dt);
    };
    requestAnimationFrame(loop);
  }
}
