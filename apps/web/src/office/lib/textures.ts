import * as THREE from 'three';

/**
 * Procedurally painted canvas textures (screens, boards, fabrics, signage). Generated once per key
 * in the browser, so the office needs no external image assets and no licensing questions.
 */
const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  cache.set(key, t);
  return t;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// Deterministic pseudo-random so textures are stable between renders.
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export type ScreenKind = 'code' | 'design' | 'chart' | 'dashboard' | 'campaign' | 'sheet' | 'kanban' | 'docs' | 'video';

export function screenTexture(kind: ScreenKind, accent = '#8fb3e8', seed = 1) {
  return make(`screen|${kind}|${accent}|${seed}`, 256, 160, (g, w, h) => {
    const r = rng(seed * 97 + kind.length);
    const dark = kind === 'code';
    g.fillStyle = dark ? '#1d2233' : '#f7f8fb';
    g.fillRect(0, 0, w, h);
    // window chrome
    g.fillStyle = dark ? '#262c40' : '#eceff5';
    g.fillRect(0, 0, w, 16);
    ['#f28b82', '#fbd36b', '#8fd19e'].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(10 + i * 10, 8, 3, 0, Math.PI * 2);
      g.fill();
    });
    if (kind === 'code') {
      const cols = ['#8fb3e8', '#c3a6f0', '#9fd8b5', '#f3c18b', '#e9eef7'];
      for (let y = 26; y < h - 8; y += 11) {
        let x = 10 + Math.floor(r() * 4) * 10;
        const n = 1 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) {
          const len = 14 + r() * 50;
          g.fillStyle = cols[Math.floor(r() * cols.length)];
          rr(g, x, y, len, 5, 2.5);
          g.fill();
          x += len + 6;
          if (x > w - 20) break;
        }
      }
    } else if (kind === 'chart' || kind === 'dashboard' || kind === 'sheet') {
      // sidebar + cards + bars
      g.fillStyle = '#eef0f6';
      g.fillRect(0, 16, 40, h);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i === 1 ? accent : '#d9dde8';
        rr(g, 8, 26 + i * 14, 24, 6, 3);
        g.fill();
      }
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#ffffff';
        rr(g, 48 + i * 68, 24, 60, 30, 5);
        g.fill();
        g.fillStyle = ['#8fb3e8', '#9fd8b5', '#f3b8c8'][i];
        rr(g, 54 + i * 68, 30, 22, 5, 2.5);
        g.fill();
        g.fillStyle = '#3a3f55';
        rr(g, 54 + i * 68, 40, 34, 8, 3);
        g.fill();
      }
      g.fillStyle = '#ffffff';
      rr(g, 48, 62, 196, 88, 6);
      g.fill();
      if (kind === 'sheet') {
        g.strokeStyle = '#e1e4ec';
        for (let y = 72; y < 146; y += 10) {
          g.beginPath();
          g.moveTo(54, y);
          g.lineTo(238, y);
          g.stroke();
        }
        for (let x = 54; x < 238; x += 36) {
          g.beginPath();
          g.moveTo(x, 70);
          g.lineTo(x, 146);
          g.stroke();
        }
      } else {
        for (let i = 0; i < 12; i++) {
          const bh = 12 + r() * 58;
          g.fillStyle = i % 3 === 0 ? accent : i % 3 === 1 ? '#c8d6f2' : '#b5e2c7';
          rr(g, 58 + i * 15, 142 - bh, 9, bh, 3);
          g.fill();
        }
        g.strokeStyle = '#c3a6f0';
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < 12; i++) g.lineTo(62 + i * 15, 100 - r() * 30);
        g.stroke();
      }
    } else if (kind === 'design') {
      g.fillStyle = '#f1edf7';
      g.fillRect(0, 16, 36, h);
      g.fillStyle = '#ffffff';
      rr(g, 52, 26, 150, 120, 8);
      g.fill();
      g.fillStyle = '#f6c7d6';
      rr(g, 62, 36, 130, 46, 8);
      g.fill();
      g.fillStyle = '#c7b9ee';
      g.beginPath();
      g.arc(92, 110, 18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b8dccb';
      rr(g, 122, 94, 60, 12, 6);
      g.fill();
      g.fillStyle = '#dfe3ee';
      rr(g, 122, 112, 44, 10, 5);
      g.fill();
      ['#f3a6bd', '#a99be6', '#8fd1b4', '#f5c08b', '#8fb6f0'].forEach((c, i) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(222, 40 + i * 20, 7, 0, Math.PI * 2);
        g.fill();
      });
    } else if (kind === 'campaign') {
      g.fillStyle = '#fff4ea';
      g.fillRect(0, 16, w, h);
      g.fillStyle = '#f6b98d';
      rr(g, 14, 26, 110, 70, 8);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 18px sans-serif';
      g.fillText('Q4', 28, 66);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ['#f3c3d0', '#c8d6f2', '#cfe8d6', '#f9df9e'][i];
        rr(g, 134 + (i % 2) * 58, 26 + Math.floor(i / 2) * 38, 50, 32, 6);
        g.fill();
      }
      g.fillStyle = '#e9d9cb';
      for (let i = 0; i < 4; i++) {
        rr(g, 14, 106 + i * 11, 100 + r() * 120, 5, 2.5);
        g.fill();
      }
    } else if (kind === 'kanban') {
      for (let c = 0; c < 4; c++) {
        g.fillStyle = '#eef0f6';
        rr(g, 8 + c * 62, 22, 56, 132, 6);
        g.fill();
        const n = 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          g.fillStyle = ['#ffffff', '#fbe6ec', '#e3edfb', '#e2f0e6'][c];
          rr(g, 12 + c * 62, 30 + i * 28, 48, 22, 4);
          g.fill();
        }
      }
    } else if (kind === 'docs') {
      g.fillStyle = '#ffffff';
      rr(g, 40, 22, 176, 134, 4);
      g.fill();
      g.fillStyle = '#3a3f55';
      rr(g, 54, 34, 90, 8, 3);
      g.fill();
      g.fillStyle = '#d5d9e4';
      for (let y = 52; y < 150; y += 9) {
        rr(g, 54, y, 80 + r() * 70, 4, 2);
        g.fill();
      }
    } else {
      g.fillStyle = '#d6e4f5';
      g.fillRect(0, 16, w, h);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = '#ffffff';
        rr(g, 10 + (i % 3) * 82, 24 + Math.floor(i / 3) * 66, 74, 58, 6);
        g.fill();
        g.fillStyle = ['#f3c3d0', '#c8d6f2', '#cfe8d6'][i % 3];
        g.beginPath();
        g.arc(47 + (i % 3) * 82, 50 + Math.floor(i / 3) * 66, 12, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** Cork / felt board with notes and photos. */
export function boardTexture(kind: 'mood' | 'sticky' | 'roadmap' | 'people' | 'finance', seed = 3) {
  return make(`board|${kind}|${seed}`, 320, 200, (g, w, h) => {
    const r = rng(seed * 31 + kind.length);
    g.fillStyle = kind === 'mood' ? '#fbf3f5' : '#ffffff';
    g.fillRect(0, 0, w, h);
    if (kind === 'sticky' || kind === 'roadmap') {
      if (kind === 'roadmap') {
        g.strokeStyle = '#e3e5ee';
        g.lineWidth = 2;
        for (let c = 1; c < 4; c++) {
          g.beginPath();
          g.moveTo((c * w) / 4, 12);
          g.lineTo((c * w) / 4, h - 12);
          g.stroke();
        }
      }
      const cols = ['#fde68a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#fed7aa', '#ddd6fe'];
      for (let i = 0; i < 16; i++) {
        const x = 14 + (i % 6) * 50 + r() * 6;
        const y = 16 + Math.floor(i / 6) * 60 + r() * 8;
        g.save();
        g.translate(x + 20, y + 20);
        g.rotate((r() - 0.5) * 0.18);
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.fillRect(-20, -20, 40, 40);
        g.fillStyle = 'rgba(60,60,80,0.35)';
        g.fillRect(-14, -10, 26, 3);
        g.fillRect(-14, -3, 20, 3);
        g.restore();
      }
    } else if (kind === 'mood') {
      const cols = ['#f6c7d6', '#d9cdf3', '#c8e3d6', '#f8dcc3', '#c9d9f3', '#efe2cf'];
      for (let i = 0; i < 9; i++) {
        const x = 12 + (i % 3) * 102;
        const y = 12 + Math.floor(i / 3) * 62;
        g.fillStyle = '#ffffff';
        g.fillRect(x, y, 94, 54);
        g.fillStyle = cols[i % cols.length];
        g.fillRect(x + 4, y + 4, 86, 46);
        if (i % 2) {
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.beginPath();
          g.arc(x + 30, y + 28, 12, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (kind === 'people') {
      for (let i = 0; i < 8; i++) {
        const x = 20 + (i % 4) * 75;
        const y = 24 + Math.floor(i / 4) * 86;
        g.fillStyle = ['#fbe6ec', '#e3edfb', '#e2f0e6', '#fdeadb'][i % 4];
        rr(g, x, y, 60, 70, 8);
        g.fill();
        g.fillStyle = '#e8c7ad';
        g.beginPath();
        g.arc(x + 30, y + 26, 13, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#cfc6d6';
        rr(g, x + 12, y + 48, 36, 6, 3);
        g.fill();
      }
    } else {
      g.fillStyle = '#f5f7fa';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) {
        const bh = 20 + r() * 120;
        g.fillStyle = i % 2 ? '#9cc4a8' : '#cfe3d4';
        rr(g, 20 + i * 21, h - 20 - bh, 14, bh, 3);
        g.fill();
      }
    }
  });
}

/** Red-and-white (or plain white) shemagh fabric. */
export function shemaghTexture(red = true) {
  return make(`shemagh2|${red}`, 128, 128, (g, w, h) => {
    g.fillStyle = '#fbf8f4';
    g.fillRect(0, 0, w, h);
    if (!red) {
      g.strokeStyle = 'rgba(200,195,185,0.35)';
      for (let i = 0; i < w; i += 8) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, h);
        g.stroke();
      }
      return;
    }
    g.fillStyle = '#c8303c';
    const s = 16;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) if (((x + y) / s) % 2 === 0) g.fillRect(x + 1, y + 1, s - 2, s - 2);
    g.fillStyle = '#d4505a';
    for (let y = 0; y < h; y += s * 2) for (let x = s / 2; x < w; x += s * 2) g.fillRect(x - 2, y + s / 2 - 2, 4, 4);
  }, [2, 1.4]);
}

/** Subtle embroidery band (gold motif on dark) for abaya trims. */
export function embroideryTexture(base = '#1c1b20') {
  return make(`embroidery|${base}`, 64, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a86a';
    g.lineWidth = 3;
    for (let y = 8; y < h; y += 28) {
      g.beginPath();
      g.moveTo(w / 2, y);
      g.bezierCurveTo(w * 0.1, y + 8, w * 0.1, y + 20, w / 2, y + 26);
      g.bezierCurveTo(w * 0.9, y + 20, w * 0.9, y + 8, w / 2, y);
      g.stroke();
      g.fillStyle = '#e3c88f';
      g.beginPath();
      g.arc(w / 2, y + 13, 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Large floor: warm tiles with subtle grout lines. */
export function floorTexture(base = '#f1e9e0', grout = '#e6dbcf', tile = 64) {
  return make(`floor|${base}|${grout}|${tile}`, 256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let y = 0; y < h; y += tile)
      for (let x = 0; x < w; x += tile) {
        g.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.14})`;
        g.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    g.strokeStyle = grout;
    g.lineWidth = 2;
    for (let i = 0; i <= w; i += tile) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, h);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(w, i);
      g.stroke();
    }
  });
}

/** Light wood planks. */
export function woodTexture(base = '#e7d3bb') {
  return make(`wood|${base}`, 256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = `rgba(150,110,70,${0.04 + r() * 0.06})`;
      g.fillRect(0, y, w, 32);
      g.strokeStyle = 'rgba(140,100,60,0.18)';
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      const off = r() * w;
      g.beginPath();
      g.moveTo(off, y);
      g.lineTo(off, y + 32);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = `rgba(150,110,70,${0.05 + r() * 0.05})`;
        g.beginPath();
        g.moveTo(0, y + 4 + r() * 24);
        g.bezierCurveTo(w * 0.3, y + r() * 32, w * 0.6, y + r() * 32, w, y + 4 + r() * 24);
        g.stroke();
      }
    }
  });
}

/** Soft rug with a border. */
export function rugTexture(color: string, pattern: 'border' | 'rings' | 'plain' = 'border') {
  return make(`rug|${color}|${pattern}`, 256, 256, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    if (pattern === 'border') {
      g.lineWidth = 8;
      g.strokeRect(18, 18, w - 36, h - 36);
      g.lineWidth = 2;
      g.strokeRect(34, 34, w - 68, h - 68);
    } else if (pattern === 'rings') {
      g.lineWidth = 6;
      for (let r = 30; r < 128; r += 26) {
        g.beginPath();
        g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // fibre noise
    const r = rng(5);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.08})`;
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  });
}

/** Company sign: logo mark + "<Name> Space". */
export function signTexture(name: string, brand: string) {
  return make(`sign|${name}|${brand}`, 1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = 120;
    g.fillStyle = brand;
    g.beginPath();
    g.arc(cx, h / 2, 54, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = brand;
    g.lineWidth = 12;
    g.beginPath();
    g.ellipse(cx, h / 2, 92, 36, -0.42, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#f2b8c6';
    g.beginPath();
    g.arc(cx + 76, h / 2 - 36, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2740';
    g.font = '800 104px "Plus Jakarta Sans Variable", system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(`${name}`, 250, h / 2 + 4);
    const tw = g.measureText(`${name} `).width;
    g.fillStyle = brand;
    g.font = '600 104px "Plus Jakarta Sans Variable", system-ui, sans-serif';
    g.fillText('Space', 250 + tw, h / 2 + 4);
  });
}

/** Simple framed art (abstract shapes in pastel). */
export function artTexture(seed: number) {
  return make(`art|${seed}`, 128, 160, (g, w, h) => {
    const r = rng(seed * 13 + 2);
    const pal = [['#f3c3d0', '#c8d6f2', '#f8e2b8'], ['#cfe8d6', '#f6d1bf', '#d9cdf3'], ['#e8d8c8', '#bcd3c4', '#f2c6a8']][seed % 3];
    g.fillStyle = '#fbf7f2';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = pal[i % pal.length];
      g.beginPath();
      if (i % 2) g.arc(20 + r() * 88, 30 + r() * 100, 18 + r() * 26, 0, Math.PI * 2);
      else g.ellipse(64, 40 + i * 30, 50, 14 + r() * 10, r() * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Book spines for shelves. */
export function booksTexture(seed: number) {
  return make(`books|${seed}`, 256, 64, (g, w, h) => {
    const r = rng(seed * 7 + 3);
    g.fillStyle = 'rgba(0,0,0,0)';
    g.clearRect(0, 0, w, h);
    let x = 2;
    const cols = ['#e7b8c4', '#b9c9ea', '#c6e0cf', '#f1d3a9', '#d5c8ef', '#efe6da', '#9fb3d6', '#e7a99b'];
    while (x < w - 6) {
      const bw = 8 + r() * 12;
      const bh = 34 + r() * 28;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x + 2, h - bh + 6, bw - 4, 2);
      x += bw + 1 + (r() < 0.15 ? 10 : 0);
    }
  });
}

/**
 * A calm desktop "wallpaper" for desk monitors: deep tone at the top fading to a soft accent,
 * with a faint app window. Deliberately low-contrast so screens read as real monitors, not lamps.
 */
export function wallpaperTexture(accent = '#8fb3e8', seed = 1) {
  return make(`wall|${accent}|${seed % 4}`, 192, 120, (g, w, h) => {
    const r = rng(seed * 31 + 7);
    const grad = g.createLinearGradient(0, 0, w * 0.4, h);
    grad.addColorStop(0, '#1c2136');
    grad.addColorStop(0.55, '#34406a');
    grad.addColorStop(1, accent);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // soft glow blob
    const rg = g.createRadialGradient(w * (0.6 + r() * 0.3), h * 0.8, 4, w * 0.7, h * 0.8, w * 0.6);
    rg.addColorStop(0, 'rgba(255,255,255,0.28)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    // faint app window
    g.fillStyle = 'rgba(255,255,255,0.14)';
    const x = 18 + r() * 30;
    g.fillRect(x, 18, w * 0.5, h * 0.55);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(x, 18, w * 0.5, 8);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x + 8, 34 + i * 9, (w * 0.5 - 16) * (0.4 + r() * 0.6), 3);
    }
    // taskbar
    g.fillStyle = 'rgba(10,12,22,0.45)';
    g.fillRect(0, h - 9, w, 9);
  });
}
