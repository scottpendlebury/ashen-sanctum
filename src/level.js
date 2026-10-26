// "The Ashen Sanctum" — ruined cathedral level. All geometry procedural.
import * as THREE from 'three';
import { createTextures } from './textures.js';

const WALL_H = 4.5;

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.pickups = [];
    this.doors = [];
    this.torchLights = [];
    this.torchPositions = [];
    this.spawn = { x: 0, z: 27, yaw: 0 };
    this.exitZone = { x1: -2.5, x2: 2.5, z1: -40, z2: -37 };
    this.flags = { sigils: 0, bossDead: false };
    this.textures = createTextures();
    this._t = 0;
    this._build();
  }

  _mat(tex, repeatX = 1, repeatY = 1, color = 0xffffff) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(repeatX, repeatY);
    return new THREE.MeshLambertMaterial({ map: t, color });
  }

  // wall centered at (cx,cz), size w (x) x d (z), height h
  wall(cx, cz, w, d, h = WALL_H, y = 0, texKey = 'wall') {
    const repX = Math.max(1, Math.round(Math.max(w, d) / 2.2));
    const repY = Math.max(1, Math.round(h / 2.2));
    const mat = this._mat(this.textures[texKey], repX, repY);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, y + h / 2, cz);
    this.scene.add(mesh);
    this.colliders.push({ x1: cx - w / 2, x2: cx + w / 2, z1: cz - d / 2, z2: cz + d / 2, y1: y, y2: y + h });
    return mesh;
  }

  floor(cx, cz, w, d, texKey = 'floor') {
    const mat = this._mat(this.textures[texKey], w / 2.5, d / 2.5);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0, cz);
    this.scene.add(mesh);
  }

  ceiling(cx, cz, w, d, y = WALL_H) {
    const mat = this._mat(this.textures.wallDark, w / 2.5, d / 2.5, 0x8a8a8a);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(cx, y, cz);
    this.scene.add(mesh);
  }

  column(x, z) {
    const geo = new THREE.CylinderGeometry(0.45, 0.55, WALL_H, 10);
    const mat = this._mat(this.textures.wall, 2, 2, 0xb0aca4);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, WALL_H / 2, z);
    this.scene.add(m);
    this.colliders.push({ x1: x - 0.55, x2: x + 0.55, z1: z - 0.55, z2: z + 0.55, y1: 0, y2: WALL_H });
    // capital
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 1.3), mat);
    cap.position.set(x, WALL_H - 0.17, z);
    this.scene.add(cap);
  }

  torch(x, z, color = 0xff8c3a, intensity = 1.6, dist = 11) {
    // flame
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffc060 })
    );
    flame.position.set(x, 2.1, z);
    this.scene.add(flame);
    const sconce = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.05, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.6, roughness: 0.5 })
    );
    sconce.position.set(x, 1.85, z);
    this.scene.add(sconce);
    // register torch position; actual PointLights come from a shared pool (see engine)
    this.torchPositions.push({ x, y: 2.2, z, color, intensity, dist });
    this.torchLights.push({ light: null, flame, base: intensity, phase: Math.random() * 10 });
    return null;
  }

  // Reassign pooled lights to the torches nearest the listener.
  updateLights(camera, pool) {
    const t = this.torchPositions;
    if (!pool.length || !t.length) return;
    const px = camera.position.x, pz = camera.position.z;
    const sorted = t
      .map((tp) => ({ tp, d: (tp.x - px) ** 2 + (tp.z - pz) ** 2 }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < pool.length; i++) {
      const light = pool[i];
      if (i < sorted.length) {
        const { x, y, z, color, intensity, dist } = sorted[i].tp;
        light.position.set(x, y, z);
        light.color.setHex(color);
        light.distance = dist;
        light.userData.base = intensity;
        light.visible = true;
      } else {
        light.visible = false;
      }
    }
  }

  candleCluster(x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const fx = x + (Math.random() - 0.5) * 1.2, fz = z + (Math.random() - 0.5) * 1.2;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.15, 6), new THREE.MeshLambertMaterial({ color: 0xd8d2be }));
      c.position.set(fx, 0.08, fz);
      this.scene.add(c);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffcc70 }));
      f.position.set(fx, 0.19, fz);
      this.scene.add(f);
      this.torchLights.push({ light: null, flame: f, base: 0, phase: Math.random() * 10 });
    }
  }

  rubble(x, z, s = 1) {
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.4 * s, 0),
      this._mat(this.textures.wall, 1, 1, 0x8f8b84)
    );
    m.position.set(x, 0.25 * s, z);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(m);
    this.colliders.push({ x1: x - 0.45 * s, x2: x + 0.45 * s, z1: z - 0.45 * s, z2: z + 0.45 * s, y1: 0, y2: 0.55 * s });
  }

  pew(x, z, rot = 0) {
    const g = new THREE.Group();
    const mat = this._mat(this.textures.wood, 1, 1);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.5), mat);
    seat.position.y = 0.45; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.08), mat);
    back.position.set(0, 0.75, -0.21); g.add(back);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.45), mat);
      leg.position.set(s * 1.0, 0.22, 0); g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);
    this.colliders.push({ x1: x - 1.15, x2: x + 1.15, z1: z - 0.35, z2: z + 0.35, y1: 0, y2: 1.0, low: true });
  }

  addPickup(type, x, z) {
    const group = new THREE.Group();
    let color = 0xffffff, emissive = 0x000000;
    if (type === 'bolts') { color = 0x8a7a5a; }
    else if (type === 'powder') { color = 0x2a2a2e; }
    else if (type === 'essence') { color = 0x2effa0; emissive = 0x0f9e55; }
    else if (type === 'health') { color = 0x9c1f1f; emissive = 0x400808; }
    else if (type === 'sigilA' || type === 'sigilB') { color = 0x5dff9a; emissive = 0x1e9e5e; }
    if (type === 'bolts') {
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), new THREE.MeshLambertMaterial({ color }));
        b.position.set((i - 1.5) * 0.06, 0.12, 0);
        b.rotation.x = Math.PI / 2;
        group.add(b);
      }
    } else if (type === 'powder') {
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.24, 7), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.6 }));
      group.add(horn);
    } else if (type === 'essence') {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.5 }));
      group.add(c);
    } else if (type === 'health') {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.18), new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.7 }));
      group.add(c);
    } else {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 2, roughness: 0.3 }));
      group.add(s);
      const glow = new THREE.PointLight(0x40ff90, 1.2, 6, 2);
      group.add(glow);
    }
    group.position.set(x, 0.55, z);
    this.scene.add(group);
    this.pickups.push({ type, mesh: group, taken: false, baseY: 0.55 });
  }

  makeLockedDoor() {
    const x = 0, z = -24;
    const mat = this._mat(this.textures.sigilRed, 1, 1);
    const door = new THREE.Mesh(new THREE.BoxGeometry(4.6, 4.5, 0.4), [
      this._mat(this.textures.wall, 2, 2), this._mat(this.textures.wall, 2, 2),
      this._mat(this.textures.wall, 2, 2), this._mat(this.textures.wall, 2, 2),
      mat, this._mat(this.textures.wall, 2, 2),
    ]);
    door.position.set(x, 2.25, z);
    this.scene.add(door);
    const col = { x1: x - 2.3, x2: x + 2.3, z1: z - 0.25, z2: z + 0.25, y1: 0, y2: 4.5 };
    this.colliders.push(col);
    this.doors.push({ mesh: door, collider: col, opened: false, anim: 0, kind: 'sigil', x, z });
    return this.doors[this.doors.length - 1];
  }

  makeExitGate() {
    const x = 0, z = -38.4;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2620, metalness: 0.5, roughness: 0.6 });
    const gate = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.35), mat);
    gate.position.set(x, 2, z);
    this.scene.add(gate);
    const col = { x1: x - 2.5, x2: x + 2.5, z1: z - 0.2, z2: z + 0.2, y1: 0, y2: 4 };
    this.colliders.push(col);
    this.doors.push({ mesh: gate, collider: col, opened: false, anim: 0, kind: 'exit', x, z });
    return this.doors[this.doors.length - 1];
  }

  tryOpenDoor(door) {
    if (door.opened) return false;
    if (door.kind === 'sigil' && this.flags.sigils < 2) return false;
    door.opened = true;
    const i = this.colliders.indexOf(door.collider);
    if (i >= 0) this.colliders.splice(i, 1);
    return true;
  }

  // ---------------- The layout ----------------
  _build() {
    const H = WALL_H;
    // === Outer bounds ===
    // south of nave handled by nave walls; global safety bounds
    this.wall(-17, -4, 0.6, 76, 6); // far west bound
    this.wall(17, -4, 0.6, 76, 6);  // far east bound
    this.wall(0, 33, 36, 0.6, 6);   // far south bound
    this.wall(0, -42, 36, 0.6, 6);  // far north bound

    // === 1. The Broken Nave (start) x[-8,8] z[16,30] ===
    this.floor(0, 23, 16, 14);
    this.wall(-8, 23, 0.5, 14.5, H);
    this.wall(8, 23, 0.5, 14.5, H);
    this.wall(0, 30.2, 16.5, 0.5, H);
    this.wall(-5.5, 16, 5.0, 0.5, H);   // north wall w/ gap x[-3,3]
    this.wall(5.5, 16, 5.0, 0.5, H);
    // shattered rose window landmark (south wall)
    const rose = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.18, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.8 })
    );
    rose.position.set(0, 3.2, 29.9);
    this.scene.add(rose);
    const glowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 24),
      new THREE.MeshBasicMaterial({ color: 0x2a2438, transparent: true, opacity: 0.55 })
    );
    glowDisc.position.set(0, 3.2, 29.85);
    this.scene.add(glowDisc);
    // pews (two rows, some broken)
    for (const zz of [21, 24, 27]) {
      this.pew(-4.5, zz); this.pew(4.5, zz);
    }
    this.rubble(-2, 19, 1.2); this.rubble(3, 25, 0.9); this.rubble(-6, 28, 1);
    this.candleCluster(0, 17.5, 4);
    // broken beams overhead
    const beamMat = this._mat(this.textures.wood, 1, 1, 0x9a8a76);
    for (const bx of [-4, 0, 4]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 13), beamMat);
      beam.position.set(bx, H - 0.2, 23);
      beam.rotation.z = (bx === 0 ? 0.06 : -0.04);
      this.scene.add(beam);
    }
    this.torch(-7.4, 20); this.torch(7.4, 20);

    // === 2. Great Corridor x[-3,3] z[-10,16] ===
    this.floor(0, 3, 6.2, 26);
    this.ceiling(0, 3, 6.2, 26);
    this.wall(-3.2, -9, 0.5, 2, H);    // west wall segments; gap z[-8,-2] for crypt
    this.wall(-3.2, 7, 0.5, 18, H);
    this.wall(3.2, -5, 0.5, 10, H);    // east wall segments; gap z[0,6] for chapel
    this.wall(3.2, 11, 0.5, 10, H);
    for (const cz of [12, 6, 0, -6]) { this.column(-2.6, cz); this.column(2.6, cz); }
    this.torch(2.6, 12); this.torch(-2.6, 6); this.torch(2.6, -2); this.torch(-2.6, -8, 0x8cff9a, 1.2, 8);

    // === 3. East Chapel — Reliquary of Bone x[3,15] z[-2,8] ===
    this.floor(9, 3, 12, 10);
    this.ceiling(9, 3, 12, 10);
    this.wall(15.2, 3, 0.5, 10.5, H);
    this.wall(9, 8.2, 12.5, 0.5, H);
    this.wall(9, -2.2, 12.5, 0.5, H);
    // ossuary niches
    for (let i = 0; i < 5; i++) {
      const bx = 13.5, bz = -1 + i * 2.2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), this._mat(this.textures.wallDark, 1, 1, 0x7a756c));
      box.position.set(bx, 0.4, bz);
      this.scene.add(box);
      this.colliders.push({ x1: bx - 0.4, x2: bx + 0.4, z1: bz - 0.4, z2: bz + 0.4, y1: 0, y2: 0.8, low: true });
    }
    this.candleCluster(10, 1, 5);
    this.torch(14.6, 6, 0x9dffb0, 1.3, 9);
    this.torch(14.6, -0.5, 0x9dffb0, 1.3, 9);

    // === 4. West Crypt x[-15,-3] z[-10,-2] ===
    this.floor(-9, -6, 12, 8);
    this.ceiling(-9, -6, 12, 8, 3.6);
    this.wall(-15.2, -6, 0.5, 8.5, 3.8);
    this.wall(-9, -2.2, 12.5, 0.5, 3.8);
    this.wall(-9, -10.2, 12.5, 0.5, 3.8);
    // sarcophagi
    for (const sx of [-13, -10.5]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.9), this._mat(this.textures.wall, 1, 1, 0x6f6b64));
      s.position.set(sx, 0.45, -8.8);
      this.scene.add(s);
      this.colliders.push({ x1: sx - 0.8, x2: sx + 0.8, z1: -9.4, z2: -8.2, y1: 0, y2: 0.9 });
    }
    this.torch(-14.6, -6, 0x8cff9a, 1.4, 9);
    this.torch(-3.6, -9.4, 0xff8c3a, 1.2, 8);

    // === 5. The Transept / altar hall x[-9,9] z[-24,-10] ===
    this.floor(0, -17, 18, 14);
    this.ceiling(0, -17, 18, 14, 5.2);
    this.wall(-9.2, -17, 0.5, 14.5, 5.2);
    this.wall(9.2, -17, 0.5, 14.5, 5.2);
    this.wall(-6.2, -10, 6, 0.5, 5.2);  // south wall w/ gap x[-3.2,3.2]
    this.wall(6.2, -10, 6, 0.5, 5.2);
    this.wall(-5.7, -24, 6.9, 0.5, H);  // north wall w/ door gap x[-2.3,2.3]
    this.wall(5.7, -24, 6.9, 0.5, H);
    // the high altar
    const altar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.4), this._mat(this.textures.wall, 2, 1, 0x8f8b84));
    altar.position.set(0, 0.55, -20);
    this.scene.add(altar);
    this.colliders.push({ x1: -1.5, x2: 1.5, z1: -20.7, z2: -19.3, y1: 0, y2: 1.1 });
    this.candleCluster(0, -20, 6);
    // broken statue landmark
    const statueMat = this._mat(this.textures.wall, 1, 1, 0x9a968e);
    const statue = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.6), statueMat);
    ped.position.y = 0.4; statue.add(ped);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.7), statueMat);
    torso.position.y = 1.6; torso.rotation.z = 0.12; statue.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), statueMat);
    head.position.set(0.2, 2.6, 0); head.rotation.z = 0.3; statue.add(head);
    statue.position.set(-6.5, 0, -21);
    this.scene.add(statue);
    this.colliders.push({ x1: -7.4, x2: -5.6, z1: -21.9, z2: -20.1, y1: 0, y2: 2.9 });
    for (const cx of [-4, 4]) for (const cz of [-13, -18]) this.column(cx, cz);
    this.torch(-8.6, -14); this.torch(8.6, -14); this.torch(-8.6, -22, 0xff5a4a, 1.3, 9); this.torch(8.6, -22, 0xff5a4a, 1.3, 9);
    this.rubble(3, -12, 1); this.rubble(-2, -22, 0.8);

    // === 6. The Sunken Sanctum (boss) x[-8,8] z[-38,-24] ===
    this.floor(0, -31, 16, 14);
    this.ceiling(0, -31, 16, 14);
    this.wall(-8.2, -31, 0.5, 14.5, H);
    this.wall(8.2, -31, 0.5, 14.5, H);
    this.wall(-5.3, -38, 5.4, 0.5, H);  // north wall w/ gate gap x[-2.5,2.5]
    this.wall(5.3, -38, 5.4, 0.5, H);
    for (const cx of [-5, 5]) for (const cz of [-27, -33]) this.column(cx, cz);
    this.torch(-7.6, -27, 0xff5a4a, 1.5, 10); this.torch(7.6, -27, 0xff5a4a, 1.5, 10);
    this.torch(-7.6, -35, 0xff5a4a, 1.5, 10); this.torch(7.6, -35, 0xff5a4a, 1.5, 10);
    this.rubble(-4, -30, 1.3); this.rubble(4, -33, 1.1);
    this.candleCluster(0, -36, 5);

    // === doors ===
    this.makeLockedDoor();
    this.makeExitGate();

    // === pickups ===
    this.addPickup('bolts', -5, 22); this.addPickup('health', 6, 28);
    this.addPickup('bolts', -2, 9);
    this.addPickup('essence', 6, 6); this.addPickup('bolts', 13, 7); this.addPickup('powder', 8, 3); this.addPickup('health', 14, 1);
    this.addPickup('powder', -13, -4); this.addPickup('bolts', -6, -9); this.addPickup('health', -14, -8); this.addPickup('essence', -10, -3);
    this.addPickup('powder', 7, -22); this.addPickup('bolts', -8, -11.5); this.addPickup('essence', 2.5, -17); this.addPickup('health', 8, -12);
    this.addPickup('health', -6, -26); this.addPickup('bolts', 6, -26); this.addPickup('powder', -6, -36);
    this.addPickup('sigilA', 10, 5);   // chapel — Bone Sigil
    this.addPickup('sigilB', -12, -7); // crypt — Ash Sigil
  }

  update(dt) {
    this._t += dt;
    // torch flicker
    this._flicker = 0.85 + Math.sin(this._t * 9) * 0.1 + Math.sin(this._t * 23) * 0.06;
    for (const t of this.torchLights) {
      t.flame.scale.setScalar(0.9 + this._flicker * 0.25);
    }
    // pickups spin
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = p.baseY + Math.sin(this._t * 2 + p.baseY * 7) * 0.08;
    }
    // door animations (slide into floor)
    for (const d of this.doors) {
      if (d.opened && d.anim < 1) {
        d.anim = Math.min(1, d.anim + dt * 0.5);
        d.mesh.position.y = (d.kind === 'sigil' ? 2.25 : 2) - d.anim * 4.2;
      }
    }
  }
}
