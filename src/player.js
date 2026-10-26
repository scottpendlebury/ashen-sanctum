// First-person player: movement, gravity, crouch, health.
import * as THREE from 'three';
import { resolve, groundAt } from './collision.js';
import { audio } from './audio.js';

const HEIGHT = 1.7, CROUCH_H = 1.1, RADIUS = 0.35;
const SPEED = 4.4, RUN = 7.2, CROUCH_SPEED = 2.2, JUMP_V = 5.2, GRAVITY = 16;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 24);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI; this.pitch = 0;
    this.height = HEIGHT;
    this.onGround = true;
    this.maxHealth = 100;
    this.health = 100;
    this.dead = false;
    this.stepTimer = 0;
    this.crouching = false;
    this.sprinting = false;
    this.hurtCallback = null;
    this.colliders = [];
    this.bobPhase = 0;
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.health = this.maxHealth;
    this.dead = false;
    this.height = HEIGHT;
    this.crouching = false;
  }

  damage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.hurtCallback) this.hurtCallback(amount);
    audio.playerHurt();
    if (this.health <= 0) this.dead = true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  update(dt, input) {
    const md = input.consumeLook();
    this.yaw -= md.dx;
    this.pitch -= md.dy;
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));

    // crouch
    const wantCrouch = input.isDown('ControlLeft') || input.isDown('KeyC') || input.held.crouch;
    if (wantCrouch && !this.crouching) { this.height = CROUCH_H; this.crouching = true; }
    else if (!wantCrouch && this.crouching && !this._blockedAbove()) { this.height = HEIGHT; this.crouching = false; }

    this.sprinting = input.held.sprint && !this.crouching;
    const mv = input.getMove();
    const speed = this.crouching ? CROUCH_SPEED : (this.sprinting ? RUN : SPEED);

    // camera-relative movement
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = mv.x * cos - mv.z * sin;
    const wz = mv.z * cos + mv.x * sin;
    const wl = Math.hypot(wx, wz);
    const targetX = wl > 0 ? (wx / wl) * speed * Math.min(1, wl) : 0;
    const targetZ = wl > 0 ? (wz / wl) * speed * Math.min(1, wl) : 0;

    // accelerate toward target (snappy but slightly smoothed)
    const k = Math.min(1, dt * 12);
    this.vel.x += (targetX - this.vel.x) * k;
    this.vel.z += (targetZ - this.vel.z) * k;

    // gravity + jump
    this.vel.y -= GRAVITY * dt;
    if (input.actions.has('jump') && this.onGround) { this.vel.y = JUMP_V; this.onGround = false; }

    this.pos.x += this.vel.x * dt;
    resolve(this.pos, this.pos.y, this.height, this.colliders);
    this.pos.z += this.vel.z * dt;
    resolve(this.pos, this.pos.y, this.height, this.colliders);
    this.pos.y += this.vel.y * dt;

    const g = groundAt(this.pos.x, this.pos.z, this.pos.y, this.colliders);
    if (this.pos.y <= g) {
      if (!this.onGround && this.vel.y < -6) audio.thud();
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
    } else this.onGround = false;

    // footsteps
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hspeed > 0.8) {
      this.stepTimer -= dt * hspeed;
      this.bobPhase += dt * hspeed * 1.9;
      if (this.stepTimer <= 0) {
        this.stepTimer = 2.1;
        audio.footstep(this.sprinting);
      }
    }

    input.actions.delete('jump');
    this._syncCamera();
  }

  _blockedAbove() {
    // rough check: stand-up blocked if any collider occupies headroom
    for (const c of this.colliders) {
      if (!c) continue;
      if (this.pos.x + RADIUS > c.x1 && this.pos.x - RADIUS < c.x2 &&
          this.pos.z + RADIUS > c.z1 && this.pos.z - RADIUS < c.z2 &&
          c.y2 > this.pos.y + CROUCH_H && c.y1 < this.pos.y + HEIGHT) return true;
    }
    return false;
  }

  _syncCamera() {
    const bob = this.onGround ? Math.sin(this.bobPhase * 2) * 0.03 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / SPEED) : 0;
    const sway = this.onGround ? Math.cos(this.bobPhase) * 0.015 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / SPEED) : 0;
    this.camera.position.set(this.pos.x + sway * Math.cos(this.yaw), this.pos.y + this.height - 0.15 + bob, this.pos.z - sway * Math.sin(this.yaw));
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(sway * 0.4);
  }

  eyePos(out) { return out.set(this.pos.x, this.pos.y + this.height - 0.15, this.pos.z); }
}

export { HEIGHT, CROUCH_H, RADIUS };
