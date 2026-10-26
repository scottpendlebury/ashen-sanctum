// Game state machine + main loop. Ties together player, level, enemies,
// weapons, particles, audio, UI.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Level } from './level.js';
import { WeaponSystem } from './weapons.js';
import { Particles } from './particles.js';
import { createEnemy } from './enemies.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { loadSettings, saveSettings } from './save.js';
import { rayHit } from './collision.js';

const ENEMY_SPAWNS = [
  ['ghoul', 3, 20], ['ghoul', 0, 4],
  ['ghoul', 10, 2], ['ghoul', 12, 6], ['archer', 12, 0.5],
  ['archer', -12, -6], ['archer', -7, -4], ['ghoul', -10, -8],
  ['knight', -5, -16], ['ghoul', 5, -14], ['ghoul', -4, -20], ['archer', 7, -20],
  ['sentinel', 0, -32], ['ghoul', -4, -28], ['ghoul', 4, -28],
];

export class Game {
  constructor() {
    this.settings = loadSettings();
    this.engine = new Engine(document.getElementById('game-canvas'), this);
    this.scene = this.engine.scene;
    this.camera = this.engine.camera;
    this.onFrame = (dt) => this._frame(dt); // Engine loop calls game.onFrame
    this.input = new Input(document.getElementById('game-canvas'));
    this.ui = new UI(this, this.input);
    this.input.onPointerLockLost = () => { if (this.state === 'playing') this.pause(); };

    this.state = 'title';
    this.level = null;
    this.colliders = null;
    this.player = null;
    this.weapons = null;
    this.particles = null;
    this.enemies = [];
    this.arrows = [];
    this.levelTime = 0;
    this._tmp = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    this.ui.show('title');
    this.ui.syncSettings();
    this.applySettings();
    // menu backdrop: build the level so the title screen has atmosphere
    this.level = new Level(this.scene);
    this.colliders = this.level.colliders;
    this.player = new Player(this.camera);
    this.player.colliders = this.level.colliders;
    this.level.update(0);

    this._clock = new THREE.Clock();
    this.engine.onFrame = (dt) => this._frame(dt);
    this.engine.start();
  }

  applySettings() {
    const s = this.settings;
    this.input.settings = {
      mouseSens: s.mouseSens, touchSens: s.touchSens, invertY: s.invertY,
    };
    audio.setVolumes({ master: s.volMaster, music: s.volMusic, sfx: s.volSfx });
    audio.muted = s.muted;
    audio.applyVolumes();
    this.engine.setQuality(s.quality);
    saveSettings(s);
  }

  // ---- state transitions ----
  startNewGame() {
    audio.unlock();
    this._teardownLevel();
    this.level = new Level(this.scene);
    this.colliders = this.level.colliders;
    this.player = new Player(this.camera);
    this.player.colliders = this.level.colliders;
    this.player.reset(this.level.spawn.x, this.level.spawn.z, this.level.spawn.yaw);
    this.player.hurtCallback = () => this.ui.damageFlash();
    this.weapons = new WeaponSystem(this.scene, this.camera);
    this.weapons.ctx = {
      colliders: this.level.colliders,
      get enemies() { return game.enemies; },
      particles: null,
      player: this.player,
      damageEnemy: (e, d, from) => this.damageEnemy(e, d, from),
    };
    this.weapons.onShake = (a) => { this.shake = Math.max(this.shake || 0, a); };
    // faint lantern glow around the player keeps the world readable in the dark
    this.lantern = new THREE.PointLight(0xffd9a0, 0.55, 9, 1.6);
    this.camera.add(this.lantern);
    this.particles = new Particles(this.scene);
    this.weapons.ctx.particles = this.particles;
    this.enemies = ENEMY_SPAWNS.map(([t, x, z]) => createEnemy(this, t, x, z));
    this.arrows = [];
    this.levelTime = 0;
    this.bossIntroDone = false;
    this._objectives();
    this.state = 'playing';
    this.ui.hideAll();
    this.ui.setPrompt(null);
    if (!this.settings.seenTutorial) {
      this.ui.toastMsg(this.input.isTouch
        ? 'Left side: move. Right side: look. Use the buttons to fight.'
        : 'WASD move, mouse look, LMB fire, R reload, E interact.', 6);
      this.settings.seenTutorial = true;
      saveSettings(this.settings);
    }
    this.input.enabled = true;
    this.input.requestLock();
  }

  _teardownLevel() {
    if (this.level) {
      // dispose geometries of level-owned meshes, then remove only level content
      const keep = new Set([this.camera, ...this.engine.baseLights]);
      for (const child of [...this.scene.children]) {
        if (keep.has(child)) continue;
        child.traverse?.((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
        this.scene.remove(child);
      }
    }
    this.enemies = [];
    this.arrows = [];
    this.player = null;
    this.weapons = null;
    this.particles = null;
    this.level = null;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.releaseLock();
    this.input.held.fire = this.input.held.alt = false;
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hideAll();
    this.input.enabled = true;
    this.input.requestLock();
  }

  toTitle() {
    this.state = 'title';
    this.input.enabled = false;
    this.input.releaseLock();
    this._teardownLevel();
    this.ui.show('title');
  }

  onPlayerDeath() {
    this.state = 'dead';
    audio.death();
    this.input.enabled = false;
    this.input.releaseLock();
    this.ui.showDeath();
  }

  onVictory() {
    this.state = 'won';
    audio.victory();
    this.input.enabled = false;
    this.input.releaseLock();
    const t = this.levelTime;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let best = this.settings.bestTime;
    if (best == null || t < best) { best = t; this.settings.bestTime = t; saveSettings(this.settings); }
    this.ui.showVictory(fmt(t), best != null ? fmt(best) : null);
  }

  // ---- combat plumbing ----
  damageEnemy(enemy, amount, from) {
    const dealt = enemy.damage(amount, from);
    this.particles.burst(enemy.pos.x, enemy.pos.y + enemy.height * 0.6, enemy.pos.z, 8, 0x7a1616, 2.5, 6, 0.5);
    audio.enemyHit();
    return dealt;
  }

  onEnemyDeath(enemy) {
    this.particles.burst(enemy.pos.x, enemy.pos.y + enemy.height * 0.5, enemy.pos.z, 24, 0x5a1010, 3.5, 7, 0.8);
    if (enemy.boss) {
      this.level.flags.bossDead = true;
      this.level.tryOpenDoor(this.level.doors[1]);
      audio.doorOpen();
      this._objectives();
      this.ui.toastMsg('The gate grinds open. Flee the Sanctum.', 5);
    }
  }

  spawnEnemyArrow(from, vel, damage) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x6a5a3a })
    );
    mesh.position.copy(from);
    mesh.lookAt(from.clone().add(vel));
    mesh.rotateX(Math.PI / 2);
    this.scene.add(mesh);
    this.arrows.push({ mesh, vel, damage, life: 3 });
  }

  _updateArrows(dt) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      const step = this._tmp.copy(a.vel).multiplyScalar(dt);
      const dist = step.length();
      const dir = step.clone().normalize();
      const from = a.mesh.position;
      const wall = rayHit(from.x, from.y, from.z, dir.x, dir.y, dir.z, dist, this.level.colliders);
      // player hit (sphere approx)
      let hitPlayer = false;
      const px = this.player.pos.x, py = this.player.pos.y + this.player.height * 0.55, pz = this.player.pos.z;
      const toP = Math.hypot(px - from.x, py - from.y, pz - from.z);
      if (toP < 0.55) hitPlayer = true;
      if (hitPlayer) {
        this.player.damage(a.damage);
        this._removeArrow(i);
        continue;
      }
      if (wall) {
        this.particles.burst(from.x, from.y, from.z, 4, 0x8a7a5a, 1.5, 5, 0.3);
        audio.impact();
        this._removeArrow(i);
        continue;
      }
      from.add(step);
      if (a.life <= 0) this._removeArrow(i);
    }
  }

  _removeArrow(i) {
    const a = this.arrows[i];
    this.scene.remove(a.mesh);
    a.mesh.geometry.dispose();
    a.mesh.material.dispose();
    this.arrows.splice(i, 1);
  }

  _objectives() {
    const f = this.level.flags;
    if (f.bossDead) this.ui.setObjective('Escape through the open gate');
    else if (f.doorOpen) this.ui.setObjective('Slay the Hollow Sentinel');
    else if (f.sigils >= 2) this.ui.setObjective('Open the reliquary door (E)');
    else if (f.doorSeen) this.ui.setObjective(`Find the two sigils (${f.sigils}/2)`);
    else this.ui.setObjective('Descend into the Sanctum');
  }

  // ---- interactions & pickups ----
  _interactions(dt) {
    const p = this.player;
    let prompt = null;

    // pickups (proximity)
    for (const pk of this.level.pickups) {
      if (pk.taken) continue;
      const d = Math.hypot(pk.mesh.position.x - p.pos.x, pk.mesh.position.z - p.pos.z);
      if (d < 1.1 && Math.abs(pk.mesh.position.y - p.pos.y) < 2) {
        let got = false;
        switch (pk.type) {
          case 'bolts': got = this.weapons.addAmmo('bolts', 8); break;
          case 'powder': got = this.weapons.addAmmo('powder', 4); break;
          case 'essence': got = this.weapons.addAmmo('essence', 5); break;
          case 'health':
            if (p.health < p.maxHealth) { p.heal(35); this.ui.healFlash(); got = true; }
            break;
          case 'sigilA': case 'sigilB':
            this.level.flags.sigils++;
            this.ui.toastMsg(this.level.flags.sigils >= 2
              ? 'Both sigils are yours. The reliquary door will answer now.'
              : 'A sigil of the Sanctum. One more remains.', 4.5);
            got = true;
            this._objectives();
            break;
        }
        if (got) {
          pk.taken = true;
          this.scene.remove(pk.mesh);
          audio.pickup();
        }
      }
    }

    // locked door
    const door = this.level.doors[0];
    const dd = Math.hypot(door.x - p.pos.x, door.z - p.pos.z);
    if (!door.opened && dd < 3.5) {
      if (this.level.flags.sigils >= 2) prompt = 'E — Break the seal';
      else prompt = `Sealed by two sigils (${this.level.flags.sigils}/2)`;
      if (!this.level.flags.doorSeen) {
        this.level.flags.doorSeen = true;
        this.ui.toastMsg('The reliquary door is sealed by two sigils.', 4.5);
        this._objectives();
      }
    }

    // exit gate (after boss)
    const gate = this.level.doors[1];
    if (gate.opened) {
      const gx = p.pos.x, gz = p.pos.z;
      const inZone = gx > this.level.exitZone.x1 && gx < this.level.exitZone.x2 && gz > this.level.exitZone.z1 && gz < this.level.exitZone.z2;
      if (inZone) { this.onVictory(); return; }
    }

    // interact action
    if (this.input.actions.has('interact')) {
      if (prompt && prompt.startsWith('E') && this.level.flags.sigils >= 2) {
        if (this.level.tryOpenDoor(door)) {
          this.level.flags.doorOpen = true;
          audio.doorOpen();
          this.ui.toastMsg('The seal shatters. Something stirs beyond...', 4.5);
          this._objectives();
        }
      }
    }
    this.ui.setPrompt(prompt);
  }

  _checkBossIntro() {
    if (this.bossIntroDone) return;
    if (this.player.pos.z < -24.5) {
      this.bossIntroDone = true;
      audio.bossRoar();
      this.ui.toastMsg('THE HOLLOW SENTINEL — first blade of the Ashen Order', 5);
    }
  }

  // ---- main frame ----
  _frame(dt) {
    dt = Math.min(dt, 0.05);
    this.ui.update(dt);

    if (this.state !== 'playing') {
      if (this.state === 'title') {
        // slow menu camera drift
        this._t = (this._t || 0) + dt;
        this.camera.position.set(Math.sin(this._t * 0.1) * 2, 2.4, 26 - Math.sin(this._t * 0.07) * 1.5);
        this.camera.lookAt(0, 2, 18);
        if (this.level) {
          this.level.update(dt);
          this.level.updateLights(this.camera, this.engine.lightPool);
          const fl = this.level._flicker || 1;
          for (const l of this.engine.lightPool) l.intensity = (l.userData.base || 0) * fl;
        }
      }
      if (this.state === 'dead' || this.state === 'won') {
        // brief slow-mo settle: still render scene
        if (this.level) this.level.update(dt);
        if (this.particles) this.particles.update(dt);
        for (const e of this.enemies) e.update(dt, this.player || { pos: { x: 0, y: 0, z: 0 }, height: 1.7 });
      }
      this.engine.render();
      return;
    }

    this.levelTime += dt;
    this.level.update(dt);
    // pooled torch lights follow the player + flicker
    this.level.updateLights(this.camera, this.engine.lightPool);
    const fl = this.level._flicker || 1;
    for (const l of this.engine.lightPool) l.intensity = (l.userData.base || 0) * fl;
    this.player.update(dt, this.input);
    if (this.player.dead) { this.onPlayerDeath(); this.engine.render(); return; }

    // fire direction from camera
    this.player.eyePos(this._origin);
    this.camera.getWorldDirection(this._dir);
    this.weapons.update(dt, this.input, this.player, this._origin, this._dir);

    for (const e of this.enemies) e.update(dt, this.player);
    this._updateArrows(dt);
    this._interactions(dt);
    this._checkBossIntro();
    this.particles.update(dt);

    // screen shake decay
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      this.camera.rotation.z += (Math.random() - 0.5) * this.shake * 0.05;
    }

    this.ui.updateHUD(this.player, this.weapons);
    if (this.input.isTouch) this.ui.updateJoystick(this.input._touchMoveVec);
    this.engine.render();
  }
}

// imported late to avoid cycle at module init
let game;
export function bootstrap() {
  game = new Game();
  window.__ashen = game; // for debugging/testing
  return game;
}
