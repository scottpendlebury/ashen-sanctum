// Unified input: keyboard + mouse (Pointer Lock) + touch (Pointer Events).
// Gameplay code reads only from this abstraction.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;           // gameplay input active?
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };   // accumulated, consumed each frame
    this.move = { x: 0, z: 0 };     // -1..1, from keys or joystick
    this.held = { fire: false, alt: false, sprint: false };
    this.actions = new Set();       // one-shot: jump, reload, interact, wnext, wprev, w1..w3
    this.pointerLocked = false;
    this.onPointerLockLost = null;
    this.settings = { mouseSens: 1.0, touchSens: 1.0, invertY: false };

    this._touchMoveId = null;
    this._touchMoveOrigin = { x: 0, y: 0 };
    this._touchLookId = null;
    this._touchLookLast = { x: 0, y: 0 };
    this._touchMoveVec = { x: 0, z: 0 };
    this.isTouch = matchMedia('(pointer: coarse)').matches;

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      this._keyAction(e.code, true);
      if (['Space', 'KeyE', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.held.fire = this.held.alt = this.held.sprint = false; });

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === c;
      if (!this.pointerLocked && this.enabled && this.onPointerLockLost) this.onPointerLockLost();
    });

    // Mouse look + buttons (desktop)
    c.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      const s = 0.0022 * this.settings.mouseSens;
      this.look.dx += e.movementX * s;
      this.look.dy += e.movementY * s * (this.settings.invertY ? -1 : 1);
    });
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      if (e.button === 0) this.held.fire = true;
      if (e.button === 2) this.held.alt = true;
      if (e.button === 1) { this.actions.add('wnext'); e.preventDefault(); }
    });
    c.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.held.fire = false;
      if (e.button === 2) this.held.alt = false;
    });
    c.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.actions.add(e.deltaY > 0 ? 'wnext' : 'wprev');
      e.preventDefault();
    }, { passive: false });

    // Touch look/move on the canvas — buttons are wired separately by the UI.
    c.addEventListener('pointerdown', (e) => this._touchStart(e));
    c.addEventListener('pointermove', (e) => this._touchMove(e));
    c.addEventListener('pointerup', (e) => this._touchEnd(e));
    c.addEventListener('pointercancel', (e) => this._touchEnd(e));
    document.addEventListener('touchmove', (e) => { if (this.enabled) e.preventDefault(); }, { passive: false });
  }

  _keyAction(code, down) {
    if (down) {
      switch (code) {
        case 'Space': this.actions.add('jump'); break;
        case 'KeyR': this.actions.add('reload'); break;
        case 'KeyE': this.actions.add('interact'); break;
        case 'Digit1': this.actions.add('w1'); break;
        case 'Digit2': this.actions.add('w2'); break;
        case 'Digit3': this.actions.add('w3'); break;
      }
    }
  }

  requestLock() {
    if (this.isTouch) return;
    try { this.canvas.requestPointerLock({ unadjustedMovement: true })?.catch?.(() => this.canvas.requestPointerLock()); }
    catch { try { this.canvas.requestPointerLock(); } catch { /* unsupported */ } }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _touchStart(e) {
    if (!this.enabled || e.pointerType !== 'touch') return;
    const w = window.innerWidth;
    if (e.clientX < w * 0.4 && this._touchMoveId === null) {
      this._touchMoveId = e.pointerId;
      this._touchMoveOrigin = { x: e.clientX, y: e.clientY };
    } else if (this._touchLookId === null) {
      this._touchLookId = e.pointerId;
      this._touchLookLast = { x: e.clientX, y: e.clientY };
      this.held.fire = false; // will be set by fire button, not drag
    }
  }

  _touchMove(e) {
    if (!this.enabled) return;
    if (e.pointerId === this._touchMoveId) {
      const dx = e.clientX - this._touchMoveOrigin.x;
      const dy = e.clientY - this._touchMoveOrigin.y;
      const max = 60;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      this._touchMoveVec.x = (dx * k) / max;
      this._touchMoveVec.z = (dy * k) / max;
    } else if (e.pointerId === this._touchLookId) {
      const s = 0.006 * this.settings.touchSens;
      this.look.dx += (e.clientX - this._touchLookLast.x) * s;
      this.look.dy += (e.clientY - this._touchLookLast.y) * s * (this.settings.invertY ? -1 : 1);
      this._touchLookLast = { x: e.clientX, y: e.clientY };
    }
  }

  _touchEnd(e) {
    if (e.pointerId === this._touchMoveId) {
      this._touchMoveId = null;
      this._touchMoveVec.x = 0; this._touchMoveVec.z = 0;
    } else if (e.pointerId === this._touchLookId) {
      this._touchLookId = null;
    }
  }

  // Called by touch UI buttons.
  setButton(name, down) {
    if (!this.enabled) return;
    if (name === 'fire' || name === 'alt' || name === 'sprint') this.held[name] = down;
    else if (down) this.actions.add(name); // jump, reload, interact, wnext, wprev
  }

  // ---- per-frame read ----------------------------------------------------
  consumeLook() {
    const d = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0; this.look.dy = 0;
    return d;
  }

  consumeActions() {
    const a = [...this.actions];
    this.actions.clear();
    return a;
  }

  getMove() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (x || z) {
      const l = Math.hypot(x, z);
      return { x: x / l, z: z / l };
    }
    return { x: this._touchMoveVec.x, z: this._touchMoveVec.z };
  }

  isDown(code) { return this.keys.has(code); }
}
