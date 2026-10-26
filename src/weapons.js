// Weapons: crossbow (bolt projectile), hand cannon (hitscan blast),
// soul scourge (slow orb that drains vitality). All viewmodels procedural.
import * as THREE from 'three';
import { rayHit } from './collision.js';
import { audio } from './audio.js';

export const WEAPONS = [
  {
    id: 'crossbow', name: 'Riven Crossbow',
    damage: 55, rate: 0.9, reloadTime: 1.5, mag: 1,
    ammoType: 'bolts', projectile: 'bolt', spread: 0.006, recoil: 0.035,
  },
  {
    id: 'cannon', name: 'Grave Hand-Cannon',
    damage: 80, splash: 45, splashRadius: 2.4, rate: 1.1, reloadTime: 0, mag: Infinity,
    ammoType: 'powder', projectile: 'hitscan', spread: 0.01, recoil: 0.09,
  },
  {
    id: 'scourge', name: 'Soul Scourge',
    damage: 34, drain: 0.5, rate: 0.55, reloadTime: 0, mag: Infinity,
    ammoType: 'essence', regen: 4, projectile: 'orb', spread: 0.004, recoil: 0.03,
  },
];

function metalMat(c = 0x3a3a3e) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.55 }); }
function woodMat() { return new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9, metalness: 0 }); }

function buildViewmodel(id) {
  const g = new THREE.Group();
  if (id === 'crossbow') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.5), woodMat());
    stock.position.set(0, 0, -0.1); g.add(stock);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.05), woodMat());
    bar.position.set(0, 0.02, -0.32); g.add(bar);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.4), metalMat(0x2c2c30));
    rail.position.set(0, 0.05, -0.25); g.add(rail);
    for (const s of [-1, 1]) {
      const limb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.03), metalMat(0x4a4038));
      limb.position.set(s * 0.26, 0.03, -0.32); limb.rotation.z = s * 0.5; g.add(limb);
    }
    g.userData.string = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.005, 0.005), new THREE.MeshBasicMaterial({ color: 0x999488 }));
    g.userData.string.position.set(0, 0.02, -0.32); g.add(g.userData.string);
  } else if (id === 'cannon') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.42, 10), metalMat(0x2e2a26));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.2); g.add(barrel);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.08, 10), metalMat(0x241f1b));
    mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 0.02, -0.4); g.add(mouth);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), woodMat());
    grip.position.set(0, -0.1, 0.02); grip.rotation.x = 0.35; g.add(grip);
    g.userData.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0 }));
    g.userData.muzzle.position.set(0, 0.02, -0.44); g.add(g.userData.muzzle);
  } else {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.5, 7), new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.7 }));
    shaft.rotation.x = Math.PI / 2 - 0.25; shaft.position.set(0, -0.04, -0.18); g.add(shaft);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3affa2, emissive: 0x1e9e5e, emissiveIntensity: 2, roughness: 0.3 }));
    orb.position.set(0, 0.05, -0.4); g.add(orb);
    g.userData.orb = orb;
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 5, 12, Math.PI * 1.2), metalMat(0x27272e));
      claw.position.set(0, 0.05, -0.4); claw.rotation.set(i * 2.1, i * 1.3, 0); g.add(claw);
    }
  }
  return g;
}

export class WeaponSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.ammo = { bolts: 12, powder: 8, essence: 10 };
    this.maxAmmo = { bolts: 40, powder: 16, essence: 15 };
    this.current = 0;
    this.cooldown = 0;
    this.reloading = 0;
    this.switching = 0;
    this.pending = -1;
    this.essenceTimer = 0;
    this.recoilKick = 0;
    this.bobPhase = 0;
    this.ctx = null; // set by game: {colliders, enemies, particles, player, onDamage}

    this.root = new THREE.Group();
    camera.add(this.root);
    this.root.position.set(0.22, -0.2, -0.45);
    this.models = WEAPONS.map((w) => {
      const m = buildViewmodel(w.id);
      m.visible = false;
      this.root.add(m);
      return m;
    });
    this.models[0].visible = true;

    this.flash = new THREE.PointLight(0xffb050, 0, 9, 2);
    camera.add(this.flash);
    this.flash.position.set(0.2, -0.1, -0.8);

    // projectile pools
    this.projectiles = [];
  }

  select(i) {
    if (i === this.current || i < 0 || i >= WEAPONS.length || this.switching > 0) return;
    this.pending = i;
    this.switching = 0.35;
    this.reloading = 0;
    audio.lockClick();
  }

  cycle(dir) { this.select((this.current + dir + WEAPONS.length) % WEAPONS.length); }

  get def() { return WEAPONS[this.current]; }

  reload() {
    const w = this.def;
    if (w.ammoType === 'essence' || w.ammoType === 'powder') return; // auto weapons
    if (this.reloading > 0 || this.ammo[w.ammoType] <= 0) return;
    this.reloading = w.reloadTime;
    audio.crossbowReload();
  }

  addAmmo(type, n) {
    const before = this.ammo[type];
    this.ammo[type] = Math.min(this.maxAmmo[type], this.ammo[type] + n);
    return this.ammo[type] > before;
  }

  update(dt, input, player, fireOrigin, fireDir) {
    const actions = input.consumeActions();
    for (const a of actions) {
      if (a === 'wnext') this.cycle(1);
      else if (a === 'wprev') this.cycle(-1);
      else if (a === 'w1') this.select(0);
      else if (a === 'w2') this.select(1);
      else if (a === 'w3') this.select(2);
      else if (a === 'reload') this.reload();
    }

    if (this.switching > 0) {
      this.switching -= dt;
      if (this.pending >= 0 && this.switching <= 0.17) {
        this.models[this.current].visible = false;
        this.current = this.pending;
        this.pending = -1;
        this.models[this.current].visible = true;
      }
    }

    const w = this.def;
    if (w.regen && w.ammoType === 'essence') {
      this.essenceTimer += dt;
      if (this.essenceTimer >= w.regen && this.ammo.essence < this.maxAmmo.essence) {
        this.essenceTimer = 0;
        this.ammo.essence++;
      }
    }

    this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { audio.lockClick(); }
    }

    const canFire = this.cooldown <= 0 && this.reloading <= 0 && this.switching <= 0;
    if (input.held.fire && canFire) {
      const ammo = this.ammo[w.ammoType];
      if (ammo > 0) this._fire(player, fireOrigin, fireDir);
      else if (w.ammoType === 'bolts') this.reload();
    }
    if (input.held.alt && canFire && this.current !== 0) {
      // alternate use: melee shove with any weapon
      this._melee(player);
    } else if (input.held.alt && canFire && this.current === 0) {
      this._melee(player);
    }

    // recoil recovery + bob
    this.recoilKick = Math.max(0, this.recoilKick - dt * 0.5);
    const hspeed = Math.hypot(player.vel.x, player.vel.z);
    this.bobPhase += dt * (2 + hspeed * 1.6);
    const bob = Math.sin(this.bobPhase * 2) * 0.012 * Math.min(1, hspeed / 4);
    const swayX = Math.cos(this.bobPhase) * 0.008 * Math.min(1, hspeed / 4);
    this.root.position.set(0.22 + swayX, -0.2 + bob - this.recoilKick * 0.3, -0.45 + this.recoilKick * 1.2);
    this.root.rotation.set(this.recoilKick * 1.6, 0, swayX * 0.6);
    if (this.reloading > 0) {
      const t = 1 - this.reloading / w.reloadTime;
      this.root.rotation.x += Math.sin(t * Math.PI) * 0.9;
      this.root.position.y -= Math.sin(t * Math.PI) * 0.12;
    }
    if (this.switching > 0) {
      const t = this.switching / 0.35;
      this.root.position.y -= t * 0.25;
    }

    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 40);
    const muz = this.models[this.current].userData.muzzle;
    if (muz) { muz.material.opacity = Math.max(0, muz.material.opacity - dt * 6); muz.scale.setScalar(1 + muz.material.opacity); }
    const orb = this.models[2].userData.orb;
    if (orb) { orb.material.emissiveIntensity = 1.6 + Math.sin(performance.now() * 0.004) * 0.5; }

    this._updateProjectiles(dt);
  }

  _fire(player, origin, dir) {
    const w = this.def;
    this.cooldown = w.rate;
    this.ammo[w.ammoType]--;
    this.recoilKick = w.recoil;
    this.flash.intensity = 6;
    this.flash.position.set(0.2, -0.1, -0.8);

    if (w.projectile === 'bolt') {
      audio.crossbowFire();
      this._spawnProjectile(origin, dir, w.damage, 42, 0xffe0b0, 0.06, 'bolt');
    } else if (w.projectile === 'hitscan') {
      audio.cannonFire();
      this._hitscan(origin, dir, w);
      this.models[1].userData.muzzle.material.opacity = 1;
      if (this.onShake) this.onShake(0.35);
    } else if (w.projectile === 'orb') {
      audio.scourgeFire();
      this._spawnProjectile(origin, dir, w.damage, 16, 0x3affa2, 0.12, 'orb');
    }
    void player;
  }

  _melee(player) {
    this.cooldown = 0.6;
    this.recoilKick = 0.06;
    audio.thud();
    const origin = new THREE.Vector3();
    player.eyePos(origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const reach = 1.8;
    let hit = null, best = reach;
    for (const e of this.ctx.enemies) {
      if (!e.alive) continue;
      const to = e.center(new THREE.Vector3()).sub(origin);
      const d = to.length();
      if (d < best && to.normalize().dot(dir) > 0.6) { hit = e; best = d; }
    }
    if (hit) { this.ctx.damageEnemy(hit, 30, origin); audio.enemyHit(); }
    void player;
  }

  _spawnProjectile(origin, dir, damage, speed, color, size, kind) {
    const geo = new THREE.SphereGeometry(size, 8, 6);
    const mat = kind === 'orb'
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.5, metalness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    if (kind === 'bolt') mesh.scale.z = 4;
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);
    const light = kind === 'orb' ? new THREE.PointLight(color, 2.2, 6, 2) : null;
    if (light) mesh.add(light);
    this.projectiles.push({
      mesh, vel: dir.clone().multiplyScalar(speed), damage, kind, life: 3, color,
    });
  }

  _updateProjectiles(dt) {
    const ctx = this.ctx;
    const step = new THREE.Vector3();
    const tmpC = new THREE.Vector3();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const from = p.mesh.position.clone();
      p.vel.y -= (p.kind === 'bolt' ? 6 : 0) * dt;
      step.copy(p.vel).multiplyScalar(dt);
      const dist = step.length();
      const dirn = step.clone().normalize();
      // wall hit
      const wall = rayHit(from.x, from.y, from.z, dirn.x, dirn.y, dirn.z, dist + 0.05, ctx.colliders);
      // enemy hit
      let enemyHit = null, eT = Infinity;
      for (const e of ctx.enemies) {
        if (!e.alive) continue;
        const c = e.center(tmpC);
        const toC = c.sub(from);
        const proj = toC.dot(dirn);
        if (proj < 0 || proj > dist + 0.2) continue;
        const perp = Math.sqrt(Math.max(0, toC.lengthSq() - proj * proj));
        if (perp < e.radius + 0.1 && proj < eT) { eT = proj; enemyHit = e; }
      }
      const wallT = wall ? wall.t : Infinity;
      if (enemyHit && eT <= wallT) {
        const at = from.clone().addScaledVector(dirn, eT);
        this._onProjectileHit(p, at, enemyHit);
        this._kill(i); continue;
      }
      if (wall) {
        const at = from.clone().addScaledVector(dirn, wall.t);
        this._onProjectileHit(p, at, null);
        this._kill(i); continue;
      }
      p.mesh.position.add(step);
      if (p.life <= 0 || p.mesh.position.y < -2) { this._kill(i); }
    }
  }

  _onProjectileHit(p, at, enemy) {
    const ctx = this.ctx;
    if (enemy) {
      const dealt = ctx.damageEnemy(enemy, p.damage, at);
      if (p.kind === 'orb') {
        const heal = Math.round(dealt * WEAPONS[2].drain);
        if (heal > 0 && ctx.player.health < ctx.player.maxHealth) {
          ctx.player.heal(heal);
          audio.scourgeDrain();
        }
      }
    } else {
      ctx.particles.burst(at.x, at.y, at.z, p.kind === 'orb' ? 10 : 6, p.color, 2.5, 5, 0.4);
      audio.impact();
    }
  }

  _hitscan(origin, dir, w) {
    const ctx = this.ctx;
    const spreadDir = dir.clone();
    spreadDir.x += (Math.random() - 0.5) * w.spread * 2;
    spreadDir.y += (Math.random() - 0.5) * w.spread * 2;
    spreadDir.normalize();
    const wall = rayHit(origin.x, origin.y, origin.z, spreadDir.x, spreadDir.y, spreadDir.z, 40, ctx.colliders);
    const wallT = wall ? wall.t : 40;
    let enemyHit = null, eT = Infinity;
    const tmp = new THREE.Vector3();
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const toC = e.center(tmp).sub(origin);
      const proj = toC.dot(spreadDir);
      if (proj < 0 || proj > wallT) continue;
      const perp = Math.sqrt(Math.max(0, toC.lengthSq() - proj * proj));
      if (perp < e.radius + 0.15 && proj < eT) { eT = proj; enemyHit = e; }
    }
    const at = origin.clone().addScaledVector(spreadDir, Math.min(eT, wallT));
    ctx.particles.burst(at.x, at.y, at.z, 26, 0xffa040, 5, 8, 0.55);
    if (enemyHit) {
      ctx.damageEnemy(enemyHit, w.damage, at);
    }
    // splash
    if (w.splash) {
      for (const e of ctx.enemies) {
        if (!e.alive || e === enemyHit) continue;
        const d = e.center(tmp).distanceTo(at);
        if (d < w.splashRadius) ctx.damageEnemy(e, w.splash * (1 - d / w.splashRadius), at);
      }
    }
  }

  _kill(i) {
    const p = this.projectiles[i];
    this.scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
    this.projectiles.splice(i, 1);
  }

  reset() {
    this.ammo = { bolts: 12, powder: 8, essence: 10 };
    this.current = 0; this.cooldown = 0; this.reloading = 0; this.switching = 0;
    this.models.forEach((m, i) => { m.visible = i === 0; });
    while (this.projectiles.length) this._kill(0);
  }
}
