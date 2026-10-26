const KEY = 'ashen-sanctum-v1';

const DEFAULTS = {
  mouseSens: 1.0,
  touchSens: 1.0,
  invertY: false,
  quality: 'auto', // low | auto | high
  volMaster: 0.8,
  volMusic: 0.6,
  volSfx: 0.8,
  muted: false,
  bestTime: null,
  seenTutorial: false,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
