// Lightweight pooled particle bursts (impact, blood, embers, magic).
import * as THREE from 'three';

const MAX = 400;

export class Particles {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, fog: true });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.parts.push({ life: 0 });
    this.cursor = 0;
  }

  burst(x, y, z, n, color, speed = 3, gravity = 6, life = 0.6, spread = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      p.x = x; p.y = y; p.z = z;
      p.vx = (Math.random() - 0.5) * speed * spread;
      p.vy = (Math.random() * 0.8 + 0.2) * speed;
      p.vz = (Math.random() - 0.5) * speed * spread;
      p.g = gravity;
      p.life = life * (0.6 + Math.random() * 0.6);
      p.max = p.life;
      p.r = c.r; p.gc = c.g; p.b = c.b;
    }
  }

  update(dt) {
    const pos = this.pos, col = this.col;
    for (let i = 0; i < MAX; i++) {
      const p = this.parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        const f = Math.max(0, p.life / p.max);
        col[i * 3] = p.r * f; col[i * 3 + 1] = p.gc * f; col[i * 3 + 2] = p.b * f;
      } else {
        pos[i * 3 + 1] = -100;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
