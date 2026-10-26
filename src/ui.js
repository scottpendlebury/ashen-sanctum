// HUD, menus and touch controls. All DOM — no framework.
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, input) {
    this.game = game;
    this.input = input;
    this.hud = $('hud');
    this.screens = {
      title: $('screen-title'),
      pause: $('screen-pause'),
      settings: $('screen-settings'),
      death: $('screen-death'),
      victory: $('screen-victory'),
      help: $('screen-help'),
    };
    this.prompt = $('prompt');
    this.objective = $('objective');
    this.damageVignette = $('damage-vignette');
    this.healVignette = $('heal-vignette');
    this.toast = $('toast');
    this.toastT = 0;

    // --- button wiring ---
    const click = (id, fn) => $(id).addEventListener('click', fn);
    click('btn-start', () => game.startNewGame());
    click('btn-help', () => this.show('help'));
    click('btn-help-back', () => this.show(game.state === 'title' ? 'title' : 'pause'));
    click('btn-resume', () => game.resume());
    click('btn-restart', () => game.startNewGame());
    click('btn-quit', () => game.toTitle());
    click('btn-pause-settings', () => this.show('settings'));
    click('btn-title-settings', () => { this._settingsReturn = 'title'; this.show('settings'); });
    click('btn-pause-help', () => this.show('help'));
    click('btn-death-restart', () => game.startNewGame());
    click('btn-death-title', () => game.toTitle());
    click('btn-victory-again', () => game.startNewGame());
    click('btn-victory-title', () => game.toTitle());
    click('btn-settings-back', () => this.show(this._settingsReturn || 'pause'));

    // --- settings controls ---
    const bind = (id, key, scale = 0.01, out = null) => {
      const el = $(id);
      el.addEventListener('input', () => {
        game.settings[key] = scale === 1 ? el.checked : parseFloat(el.value);
        if (out) $(out).textContent = scale === 1 ? '' : Math.round(parseFloat(el.value) * 100) + '%';
        game.applySettings();
      });
    };
    bind('set-mouse', 'mouseSens', 0.05, 'set-mouse-out');
    bind('set-touch', 'touchSens', 0.05, 'set-touch-out');
    bind('set-master', 'volMaster', 0.05, 'set-master-out');
    bind('set-music', 'volMusic', 0.05, 'set-music-out');
    bind('set-sfx', 'volSfx', 0.05, 'set-sfx-out');
    bind('set-invert', 'invertY', 1);
    $('set-mute').addEventListener('change', () => { game.settings.muted = $('set-mute').checked; game.applySettings(); });
    $('set-quality').addEventListener('change', () => { game.settings.quality = $('set-quality').value; game.applySettings(); });

    this._buildTouchControls();
    if (!input.isTouch) $('touch-controls').style.display = 'none';
  }

  syncSettings() {
    const s = this.game.settings;
    $('set-mouse').value = s.mouseSens / 0.05;
    $('set-touch').value = s.touchSens / 0.05;
    $('set-master').value = s.volMaster / 0.05;
    $('set-music').value = s.volMusic / 0.05;
    $('set-sfx').value = s.volSfx / 0.05;
    $('set-mouse-out').textContent = Math.round(s.mouseSens * 100) + '%';
    $('set-touch-out').textContent = Math.round(s.touchSens * 100) + '%';
    $('set-master-out').textContent = Math.round(s.volMaster * 100) + '%';
    $('set-music-out').textContent = Math.round(s.volMusic * 100) + '%';
    $('set-sfx-out').textContent = Math.round(s.volSfx * 100) + '%';
    $('set-invert').checked = s.invertY;
    $('set-mute').checked = s.muted;
    $('set-quality').value = s.quality;
  }

  show(name) {
    for (const [k, el] of Object.entries(this.screens)) {
      el.classList.toggle('visible', k === name);
    }
    this.hud.classList.toggle('hidden', name !== null && name !== 'hud');
    const playing = name === null;
    $('touch-controls').style.display = (playing && this.input.isTouch) ? 'block' : 'none';
  }

  hideAll() { this.show(null); }

  toastMsg(text, dur = 3) {
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    this.toastT = dur;
  }

  setObjective(text) { this.objective.textContent = text; }

  setPrompt(text) {
    if (text) { this.prompt.textContent = text; this.prompt.style.display = 'block'; }
    else this.prompt.style.display = 'none';
  }

  updateHUD(player, weapons) {
    const hp = Math.round(player.health);
    $('health-fill').style.width = hp + '%';
    $('health-text').textContent = hp;
    $('health-fill').classList.toggle('low', hp < 35);
    const w = weapons.def;
    const ammo = weapons.ammo[w.ammoType];
    $('weapon-name').textContent = w.name;
    $('ammo-text').textContent = w.ammoType === 'essence' ? `${ammo}/15` : String(ammo);
    $('ammo-label').textContent = w.ammoType.toUpperCase();
    const slots = ['slot-1', 'slot-2', 'slot-3'];
    slots.forEach((id, i) => $(id).classList.toggle('active', i === weapons.current));
    $('sigils').textContent = `Sigils ${this.game.level.flags.sigils}/2`;
  }

  damageFlash() {
    this.damageVignette.style.opacity = '0.55';
    setTimeout(() => { this.damageVignette.style.opacity = '0'; }, 180);
  }

  healFlash() {
    this.healVignette.style.opacity = '0.4';
    setTimeout(() => { this.healVignette.style.opacity = '0'; }, 250);
  }

  update(dt) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast.style.opacity = '0';
    }
  }

  showVictory(time, best) {
    $('victory-time').textContent = time;
    $('victory-best').textContent = best != null ? `Best: ${best}` : '';
    this.show('victory');
  }

  showDeath() { this.show('death'); }

  // ---- touch controls ----------------------------------------------------
  _buildTouchControls() {
    const tc = $('touch-controls');
    const bindHold = (id, action) => {
      const el = $(id);
      const down = (e) => { e.preventDefault(); el.classList.add('pressed'); this.input.setButton(action, true); };
      const up = (e) => { e.preventDefault(); el.classList.remove('pressed'); this.input.setButton(action, false); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    };
    bindHold('tc-fire', 'fire');
    bindHold('tc-alt', 'alt');
    bindHold('tc-sprint', 'sprint');
    bindHold('tc-jump', 'jump');
    bindHold('tc-reload', 'reload');
    bindHold('tc-interact', 'interact');
    const tap = (id, action) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.setButton(action, true); });
    tap('tc-wnext', 'wnext');
    $('tc-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); this.game.pause(); });
    // joystick visual
    this.joyBase = $('tc-joy');
    this.joyKnob = $('tc-joy-knob');
  }

  updateJoystick(vec) {
    if (!this.joyKnob) return;
    const max = 38;
    this.joyKnob.style.transform = `translate(${vec.x * max}px, ${vec.z * max}px)`;
    this.joyBase.style.opacity = (vec.x || vec.z) ? '0.7' : '0.35';
  }
}
