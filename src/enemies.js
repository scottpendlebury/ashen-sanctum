// Enemy archetypes: ghoul (fast melee lunge), skeletal archer (kiting ranged),
// corrupted knight (slow heavy smash), and the Hollow Sentinel (miniboss).
import * as THREE from 'three';
import { resolve, blocked, rayHit } from './collision.js';
import { audio } from './audio.js';

const GRAV = 16;

function baseMat(color, emissive = 0x000000, ei = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1, emissive, emissiveIntensity: ei });
}

// --- meshes -----------------------------------------------------------------
function ghoulMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 4, 8), baseMat(0x4a4436, 0x1a0808, 0.4));
  body.position.y = 0.75; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), baseMat(0x554d3c));
  head.position.y = 1.35; g.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat);
    eye.position.set(s * 0.07, 1.38, -0.15); g.add(eye);
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 3, 6), baseMat(0x473f31));
    arm.position.set(s * 0.34, 0.85, -0.12); arm.rotation.x = -0.7; g.add(arm);
  }
  g.userData.flash = [body, head];
  return g;
}

function archerMesh() {
  const g = new THREE.Group();
  const ribs = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.45, 4, 8), baseMat(0xb8b2a0, 0x101810, 0.3));
  ribs.position.y = 0.85; g.add(ribs);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), baseMat(0xcfc9b6));
  skull.position.y = 1.4; g.add(skull);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7dff8a });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), eyeMat);
    eye.position.set(s * 0.06, 1.43, -0.14); g.add(eye);
  }
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 5, 12, Math.PI), baseMat(0x2e2418));
  bow.position.set(0.3, 1.0, -0.2); bow.rotation.y = Math.PI / 2; g.add(bow);
  g.userData.flash = [ribs, skull];
  return g;
}

function knightMesh(scale = 1) {
  const g = new THREE.Group();
  const armor = baseMat(0x2c2f36, 0x000000, 0);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38 * scale, 0.7 * scale, 4, 8), armor);
  body.position.y = 0.95 * scale; g.add(body);
  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.2 * scale, 0.42 * scale, 8), baseMat(0x35383f));
  helm.position.y = 1.65 * scale; g.add(helm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26 * scale, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3818 }));
  visor.position.set(0, 1.55 * scale, -0.17 * scale); g.add(visor);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * scale, 0.5 * scale, 3, 6), armor);
    leg.position.set(s * 0.18 * scale, 0.35 * scale, 0); g.add(leg);
  }
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.09 * scale, 1.3 * scale, 0.03 * scale), baseMat(0x4a4a50, 0x0a0a0a, 0.5));
  sword.position.set(0.5 * scale, 0.95 * scale, -0.25 * scale); sword.rotation.x = 0.4; g.add(sword);
  g.userData.flash = [body, helm];
  g.userData.sword = sword;
  return g;
}

// --- enemy classes ------------------------------------------------------------
class Enemy {
  constructor(game, x, z) {
    this.game = game;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.alive = true;
    this.state = 'idle';
    this.stateT = 0;
    this.attackCd = 0;
    this.onGround = false;
    this.hitFlash = 0;
    this.deathT = 0;
    this.wanderTarget = null;
    this.wanderT = 0;
    this.facing = 0;
    this.telegraphing = 0;
    this._c = new THREE.Vector3();
  }

  center(out) {
    const v = out || this._c;
    return v.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  addMesh() {
    this.mesh = this.build();
    this.mesh.position.copy(this.pos);
    this.game.scene.add(this.mesh);
  }

  damage(amount, from) {
    if (!this.alive) return 0;
    this.health -= amount;
    this.hitFlash = 0.15;
    if (from) this.alertTo(from);
    if (this.health <= 0) {
      this.alive = false;
      this.deathT = 0.9;
      audio.enemyDeath();
      this.game.onEnemyDeath(this);
      return Math.max(0, amount + this.health);
    }
    if (this.state === 'idle' || this.state === 'patrol') this.setState('chase');
    return amount;
  }

  alertTo() {
    if (this.state === 'idle' || this.state === 'patrol') this.setState('chase');
  }

  setState(s) { this.state = s; this.stateT = 0; }

  canSeePlayer(px, pz) {
    // simple: line of sight ray + fov-less aggro radius handled by caller
    const c = this.center();
    const dx = px - c.x, dy = (this.game.player.pos.y + 1.2) - c.y, dz = pz - c.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > this.sight) return false;
    const hit = rayHit(c.x, c.y, c.z, dx / d, dy / d, dz / d, d - 0.3, this.game.colliders);
    return !hit;
  }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    let mx = dx / d * speed, mz = dz / d * speed;
    // wall avoidance: if direct blocked, try sliding around
    const probe = 0.6;
    const ahead = blocked(this.pos.x + (mx / speed) * probe, this.pos.z + (mz / speed) * probe, this.pos.y + 0.2, this.pos.y + this.height, this.game.colliders, this.radius);
    if (ahead) {
      // perpendicular slide (pick side that is free)
      const s = ((this.pos.x * 7 + this.pos.z * 13) % 2) > 1 ? 1 : -1;
      const alt = blocked(this.pos.x + mz / d * probe * s, this.pos.z - mx / d * probe * s, this.pos.y + 0.2, this.pos.y + this.height, this.game.colliders, this.radius);
      if (!alt) { const t = mx; mx = mz / d * speed * s; mz = -t / d * speed * s; }
      else { mx = -mx; mz = -mz; }
    }
    this.vel.x = mx; this.vel.z = mz;
    return d;
  }

  physics(dt) {
    this.vel.y -= GRAV * dt;
    this.pos.x += this.vel.x * dt;
    resolve(this.pos, this.pos.y, this.height, this.game.colliders, this.radius);
    this.pos.z += this.vel.z * dt;
    resolve(this.pos, this.pos.y, this.height, this.game.colliders, this.radius);
    this.pos.y += this.vel.y * dt;
    const g = 0;
    if (this.pos.y <= g) { this.pos.y = g; this.vel.y = 0; this.onGround = true; }
  }

  faceToward(x, z, dt, rate = 8) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    let d = want - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * rate);
  }

  updateVisual(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
    this.walkT = (this.walkT || 0) + dt * (moving ? 7 : 1.5);
    this.mesh.rotation.z = Math.sin(this.walkT) * (moving ? 0.06 : 0.015);
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = this.hitFlash > 0;
      for (const m of this.mesh.userData.flash) m.material.emissive.setHex(f ? 0x882222 : this.baseEmissive);
    }
    // telegraph glow
    if (this.telegraphing > 0) {
      this.telegraphing -= dt;
      const pulse = 0.5 + Math.sin(this.stateT * 25) * 0.5;
      for (const m of this.mesh.userData.flash) m.material.emissive.setHex(0xaa2200);
      for (const m of this.mesh.userData.flash) m.material.emissiveIntensity = 0.5 + pulse;
    } else if (this.hitFlash <= 0) {
      for (const m of this.mesh.userData.flash) { m.material.emissive.setHex(this.baseEmissive); m.material.emissiveIntensity = this.baseEI; }
    }
    if (!this.alive) {
      this.deathT -= dt;
      this.mesh.rotation.x = Math.min(Math.PI / 2, (0.9 - Math.max(0, this.deathT)) * 3);
      this.mesh.position.y = this.pos.y - Math.max(0, 0.25 - this.deathT);
      if (this.deathT <= 0 && !this.removed) {
        this.game.scene.remove(this.mesh);
        this.removed = true;
      }
    }
  }
}

class Ghoul extends Enemy {
  constructor(game, x, z) {
    super(game, x, z);
    this.health = 45;
    this.radius = 0.35;
    this.height = 1.5;
    this.speed = 3.4;
    this.sight = 16;
    this.damageAmt = 14;
    this.lungeRange = 6;
    this.build = ghoulMesh;
    this.baseEmissive = 0x1a0808; this.baseEI = 0.4;
    this.telegraphing = 0;
    this.addMesh();
  }

  update(dt, player) {
    if (!this.alive) { this.updateVisual(dt); return; }
    this.stateT += dt;
    this.attackCd -= dt;
    const px = player.pos.x, pz = player.pos.z;
    const dist = Math.hypot(px - this.pos.x, pz - this.pos.z);
    const sees = dist < this.sight && this.canSeePlayer(px, pz);
    if (this.state === 'idle') {
      if (dist < 9 || sees) { audio.enemyHit(); this.setState('chase'); }
      this.vel.x = this.vel.z = 0;
    } else if (this.state === 'chase') {
      if (!sees && dist > 18) this.setState('idle');
      this.faceToward(px, pz, dt);
      this.moveToward(px, pz, this.speed, dt);
      if (dist < this.lungeRange && this.attackCd <= 0 && sees) {
        this.setState('windup'); this.telegraphing = 0.55; this.stateT = 0;
        audio.bossRoar();
      }
    } else if (this.state === 'windup') {
      this.telegraphing = 0.55 - this.stateT;
      this.vel.x = this.vel.z = 0;
      this.faceToward(px, pz, dt, 5);
      if (this.stateT > 0.55) {
        // lunge
        const d = Math.hypot(px - this.pos.x, pz - this.pos.z) || 1;
        this.vel.x = (px - this.pos.x) / d * 11;
        this.vel.z = (pz - this.pos.z) / d * 11;
        this.setState('lunge'); this.stateT = 0;
      }
    } else if (this.state === 'lunge') {
      if (this.stateT > 0.35) this.setState('recover');
      // contact damage during lunge
      const dd = Math.hypot(px - this.pos.x, pz - this.pos.z);
      if (dd < 1.1 && Math.abs(player.pos.y - this.pos.y) < 1.6 && this.attackCd <= 0) {
        player.damage(this.damageAmt);
        this.attackCd = 1.4;
      }
    } else if (this.state === 'recover') {
      this.vel.x *= 0.8; this.vel.z *= 0.8;
      if (this.stateT > 0.4) this.setState('chase');
    }
    this.vel.x *= (1 - Math.min(1, dt * 2));
    this.vel.z *= (1 - Math.min(1, dt * 2));
    this.physics(dt);
    this.updateVisual(dt);
  }
}

class Archer extends Enemy {
  constructor(game, x, z) {
    super(game, x, z);
    this.health = 30;
    this.radius = 0.32;
    this.height = 1.6;
    this.speed = 2.6;
    this.sight = 22;
    this.build = archerMesh;
    this.baseEmissive = 0x101810; this.baseEI = 0.3;
    this.telegraphing = 0;
    this.prefRange = 11;
    this.addMesh();
  }

  update(dt, player) {
    if (!this.alive) { this.updateVisual(dt); return; }
    this.stateT += dt;
    this.attackCd -= dt;
    const px = player.pos.x, pz = player.pos.z;
    const dist = Math.hypot(px - this.pos.x, pz - this.pos.z);
    const sees = dist < this.sight && this.canSeePlayer(px, pz);
    if (this.state === 'idle') {
      if (dist < 14 || sees) this.setState('chase');
      this.vel.x = this.vel.z = 0;
    } else if (this.state === 'chase') {
      if (!sees && dist > 24) { this.setState('idle'); this.vel.x = this.vel.z = 0; }
      this.faceToward(px, pz, dt);
      // keep preferred range: approach or retreat
      if (dist > this.prefRange + 2) this.moveToward(px, pz, this.speed, dt);
      else if (dist < this.prefRange - 2) this.moveToward(2 * this.pos.x - px, 2 * this.pos.z - pz, this.speed, dt);
      else {
        // strafe
        const ang = Math.atan2(px - this.pos.x, pz - this.pos.z) + Math.PI / 2;
        this.vel.x = Math.sin(ang) * this.speed * 0.6;
        this.vel.z = Math.cos(ang) * this.speed * 0.6;
      }
      if (sees && dist < this.sight && this.attackCd <= 0) {
        this.setState('aim'); this.telegraphing = 0.8; this.stateT = 0;
        this.vel.x = this.vel.z = 0;
      }
    } else if (this.state === 'aim') {
      this.telegraphing = 0.8 - this.stateT;
      this.vel.x = this.vel.z = 0;
      this.faceToward(px, pz, dt, 4);
      if (this.stateT > 0.8) {
        this.shoot(player);
        this.attackCd = 2.2 + Math.random() * 1.2;
        this.setState('chase');
      }
    }
    this.vel.x *= (1 - Math.min(1, dt * 3));
    this.vel.z *= (1 - Math.min(1, dt * 3));
    this.physics(dt);
    this.updateVisual(dt);
  }

  shoot(player) {
    const from = this.center().clone();
    from.y += 0.3;
    const target = player.pos.clone(); target.y += player.height * 0.6;
    const dir = target.sub(from).normalize();
    // lead + inaccuracy
    dir.x += (Math.random() - 0.5) * 0.08;
    dir.y += (Math.random() - 0.5) * 0.05;
    dir.z += (Math.random() - 0.5) * 0.08;
    dir.normalize();
    audio.crossbowFire();
    this.game.spawnEnemyArrow(from, dir.multiplyScalar(22), 12);
  }
}

class Knight extends Enemy {
  constructor(game, x, z, boss = false) {
    super(game, x, z);
    this.boss = boss;
    this.health = boss ? 420 : 120;
    this.maxHealth = this.health;
    this.radius = boss ? 0.65 : 0.42;
    this.height = boss ? 2.6 : 2.0;
    this.speed = boss ? 2.2 : 2.0;
    this.sight = 18;
    this.damageAmt = boss ? 30 : 22;
    this.build = () => knightMesh(boss ? 1.5 : 1);
    this.baseEmissive = 0x000000; this.baseEI = 0;
    this.telegraphing = 0;
    this.addMesh();
    if (boss) audio.bossRoar();
  }

  update(dt, player) {
    if (!this.alive) { this.updateVisual(dt); return; }
    this.stateT += dt;
    this.attackCd -= dt;
    const px = player.pos.x, pz = player.pos.z;
    const dist = Math.hypot(px - this.pos.x, pz - this.pos.z);
    const sees = dist < this.sight && this.canSeePlayer(px, pz);
    if (this.state === 'idle') {
      if (dist < 10 || sees) this.setState('chase');
      this.vel.x = this.vel.z = 0;
    } else if (this.state === 'chase') {
      if (!sees && dist > 22) this.setState('idle');
      this.faceToward(px, pz, dt, 4);
      this.moveToward(px, pz, this.speed, dt);
      if (dist < 2.6 && this.attackCd <= 0 && sees) {
        this.setState('windup'); this.telegraphing = 0.9; this.stateT = 0;
        audio.thud();
      }
    } else if (this.state === 'windup') {
      this.telegraphing = 0.9 - this.stateT;
      this.vel.x = this.vel.z = 0;
      this.faceToward(px, pz, dt, 3);
      const sw = this.mesh.userData.sword;
      if (sw) sw.rotation.x = -1.8 * Math.min(1, this.stateT / 0.9);
      if (this.stateT > 0.9) {
        // smash
        if (sw) sw.rotation.x = 0.6;
        audio.thud();
        const dd = Math.hypot(px - this.pos.x, pz - this.pos.z);
        if (dd < 3.2 && Math.abs(player.pos.y - this.pos.y) < 2) player.damage(this.damageAmt);
        this.game.particles.burst(this.pos.x, this.pos.y + 0.1, this.pos.z, 14, 0x777066, 4, 8, 0.5);
        if (this.attackCd <= 0) this.attackCd = 1.8;
        this.setState('recover'); this.stateT = 0;
      }
    } else if (this.state === 'recover') {
      this.vel.x = this.vel.z = 0;
      const sw = this.mesh.userData.sword;
      if (sw) sw.rotation.x = Math.max(0.4, sw.rotation.x - dt * 4);
      if (this.stateT > 0.6) this.setState('chase');
    }
    this.vel.x *= (1 - Math.min(1, dt * 4));
    this.vel.z *= (1 - Math.min(1, dt * 4));
    this.physics(dt);
    this.updateVisual(dt);
  }
}

const TYPES = { ghoul: Ghoul, archer: Archer, knight: Knight };

export function createEnemy(game, type, x, z) {
  if (type === 'sentinel') return new Knight(game, x, z, true);
  return new TYPES[type](game, x, z);
}
