// Procedural canvas textures — no external image assets.
import * as THREE from 'three';

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function noise(ctx, size, alpha, dark = true) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * alpha * 255;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  void dark;
}

function tex(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stone(base = '#4a453e', joint = '#2a2724', blocks = 4, size = 256) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const bh = size / blocks;
  for (let row = 0; row < blocks; row++) {
    const off = (row % 2) * (size / (blocks * 2));
    for (let i = -1; i <= blocks; i++) {
      const bw = size / blocks;
      const x = i * bw + off;
      const y = row * bh;
      ctx.fillStyle = `rgba(${40 + Math.random() * 30},${38 + Math.random() * 26},${34 + Math.random() * 22},0.55)`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  ctx.strokeStyle = joint;
  ctx.lineWidth = 3;
  for (let row = 0; row <= blocks; row++) {
    ctx.beginPath(); ctx.moveTo(0, row * bh); ctx.lineTo(size, row * bh); ctx.stroke();
    const off = (row % 2) * (size / (blocks * 2));
    for (let i = 0; i <= blocks; i++) {
      ctx.beginPath(); ctx.moveTo(i * (size / blocks) + off, row * bh); ctx.lineTo(i * (size / blocks) + off, (row + 1) * bh); ctx.stroke();
    }
  }
  noise(ctx, size, 0.16);
  return tex(c);
}

function flagstone(base = '#3b3833', size = 256) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const n = 4;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
    ctx.fillStyle = `rgba(${44 + Math.random() * 26},${42 + Math.random() * 22},${38 + Math.random() * 20},0.7)`;
    ctx.fillRect(x * (size / n) + 3, y * (size / n) + 3, size / n - 6, size / n - 6);
  }
  // cracks
  ctx.strokeStyle = 'rgba(20,18,16,0.6)';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  noise(ctx, size, 0.18);
  return tex(c);
}

function wood(size = 128) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a2a1c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = `rgba(${20 + Math.random() * 30},${14 + Math.random() * 20},${8 + Math.random() * 14},0.5)`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size / 3, y + (Math.random() - 0.5) * 8, 2 * size / 3, y + (Math.random() - 0.5) * 8, size, y);
    ctx.stroke();
  }
  noise(ctx, size, 0.12);
  return tex(c);
}

// Occult sigil — sickly green on dark stone
function sigil(color = '#5dff9a', size = 128) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#17140f';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  const cx = size / 2, cy = size / 2, r = size * 0.36;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 3) / 7) * Math.PI * 2 - Math.PI / 2;
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
  }
  ctx.stroke();
  noise(ctx, size, 0.1);
  return tex(c);
}

export function createTextures() {
  return {
    wall: stone(),
    wallDark: stone('#38342e', '#201d1a', 5),
    floor: flagstone(),
    wood: wood(),
    sigil: sigil(),
    sigilRed: sigil('#ff5a4a'),
  };
}
