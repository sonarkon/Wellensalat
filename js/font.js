// Pixel lettering: a 5x7 bitmap font (HD44780 / Apple II style) and rasterized large text.
// Glyphs are rendered once per size/colour into small canvases and blitted.

// 7 rows per glyph, 5 bits per row (bit 4 = left column)
const G = {
  ' ': [0, 0, 0, 0, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4], '"': [10, 10, 0, 0, 0, 0, 0], '#': [10, 10, 31, 10, 31, 10, 10],
  '$': [4, 15, 20, 14, 5, 30, 4], '%': [24, 25, 2, 4, 8, 19, 3], '&': [12, 18, 20, 8, 21, 18, 13], "'": [4, 4, 0, 0, 0, 0, 0],
  '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '*': [0, 4, 21, 14, 21, 4, 0], '+': [0, 4, 4, 31, 4, 4, 0],
  ',': [0, 0, 0, 0, 12, 4, 8], '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], '/': [0, 1, 2, 4, 8, 16, 0],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12], ':': [0, 12, 12, 0, 12, 12, 0], ';': [0, 12, 12, 0, 12, 4, 8],
  '<': [2, 4, 8, 16, 8, 4, 2], '=': [0, 0, 31, 0, 31, 0, 0], '>': [8, 4, 2, 1, 2, 4, 8], '?': [14, 17, 1, 2, 4, 0, 4],
  '@': [14, 17, 1, 13, 21, 21, 14],
  A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '[': [14, 8, 8, 8, 8, 8, 14], '\\': [0, 16, 8, 4, 2, 1, 0], ']': [14, 2, 2, 2, 2, 2, 14], '_': [0, 0, 0, 0, 0, 0, 31], '|': [4, 4, 4, 4, 4, 4, 4],
  'Ä': [10, 0, 14, 17, 31, 17, 17], 'Ö': [10, 0, 14, 17, 17, 17, 14], 'Ü': [10, 0, 17, 17, 17, 17, 14], 'ß': [14, 17, 17, 22, 17, 17, 22],
  '·': [0, 0, 0, 4, 0, 0, 0], '°': [12, 18, 18, 12, 0, 0, 0], '′': [4, 4, 8, 0, 0, 0, 0], '…': [0, 0, 0, 0, 0, 0, 21],
  '–': [0, 0, 0, 31, 0, 0, 0], '−': [0, 0, 0, 31, 0, 0, 0], '→': [0, 4, 2, 31, 2, 4, 0], '←': [0, 4, 8, 31, 8, 4, 0], '≠': [0, 1, 31, 4, 31, 16, 0], '±': [4, 4, 31, 4, 4, 0, 31], '↑': [4, 14, 21, 4, 4, 4, 0], '↓': [0, 4, 4, 4, 21, 14, 4],
  '▸': [8, 12, 14, 15, 14, 12, 8], '●': [0, 14, 31, 31, 31, 14, 0], '○': [0, 14, 17, 17, 17, 14, 0], '■': [0, 31, 31, 31, 31, 31, 0],
  '█': [31, 31, 31, 31, 31, 31, 31], '▓': [31, 21, 31, 21, 31, 21, 31], '▒': [21, 10, 21, 10, 21, 10, 21], '░': [21, 0, 10, 0, 21, 0, 10],
  '▌': [28, 28, 28, 28, 28, 28, 28],
  '‹': [0, 2, 4, 8, 4, 2, 0], '›': [0, 8, 4, 2, 4, 8, 0], '×': [0, 17, 10, 4, 10, 17, 0], '⌫': [0, 7, 15, 31, 15, 7, 0],
  'δ': [6, 8, 4, 14, 17, 17, 14], 'θ': [14, 17, 17, 31, 17, 17, 14], 'α': [0, 0, 13, 18, 18, 18, 13], 'σ': [0, 0, 15, 18, 18, 18, 12],
  'β': [14, 17, 30, 17, 17, 30, 16], 'γ': [0, 0, 17, 10, 4, 4, 4], 'τ': [0, 0, 31, 4, 4, 4, 2], 'µ': [0, 0, 17, 17, 17, 30, 16],
  'Ω': [0, 14, 17, 17, 10, 10, 27], '∞': [0, 0, 10, 21, 21, 10, 0], 'Δ': [4, 4, 10, 10, 17, 17, 31], 'Θ': [14, 17, 17, 31, 17, 17, 14], 'Σ': [31, 16, 8, 4, 8, 16, 31],
};

const cache = new Map();

// Render scale of the UI canvas (logical 1920x1080 -> device pixels). Glyph pixels
// snap to whole device pixels so the font stays crisp at low resolution.
let RES = 1;
export function setRes(r) { RES = r; cache.clear(); if (typeof bigCache !== 'undefined') bigCache.clear(); }
const snap = (v) => Math.round(v * RES) / RES;
const cellOf = (px) => Math.max(1, Math.round(px * RES / 9.5)) / RES;
export const matrixWidth = (s, px) => [...s].length * 6 * cellOf(px) - cellOf(px);

// solid = closed pixels like an Apple II / PrintChar21; otherwise separated LCD dots
function glyphCanvas(ch, cell, color, solid) {
  const key = ch + '|' + cell.toFixed(2) + '|' + color + '|' + solid;
  let cv = cache.get(key);
  if (cv) return cv;
  const rows = G[ch] || G[ch.toUpperCase()] || G['?'];
  cv = document.createElement('canvas');
  cv.width = Math.round(5 * cell * RES); cv.height = Math.round(7 * cell * RES);
  cv.lw = 5 * cell; cv.lh = 7 * cell;
  const g = cv.getContext('2d');
  g.scale(RES, RES);
  g.fillStyle = color;
  for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
    if (!(rows[r] & (16 >> c))) continue;
    if (solid) g.fillRect(c * cell, r * cell, cell, cell);
    else g.fillRect(c * cell + cell * .1, r * cell + cell * .1, cell * .8, cell * .8);
  }
  cache.set(key, cv);
  return cv;
}

// y = baseline (bottom of the 7-row cell)
export function matrixText(ctx, s, x, y, px, align = 'left', color = '#fff', alpha = 1, solid = true) {
  const cell = cellOf(px), adv = 6 * cell;
  const w = matrixWidth(s, px);
  if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
  const top = y - 7 * cell;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  let i = 0;
  for (const ch of s) {
    if (ch !== ' ') { const gc = glyphCanvas(ch, cell, color, solid); ctx.drawImage(gc, snap(x + i * adv), snap(top), gc.lw, gc.lh); }
    i++;
  }
  ctx.globalAlpha = a;
  return w;
}

// --- large text: a real monospace font rasterized straight onto the pixel grid -----
// (1-bit, no antialiasing), so big lettering keeps fine pixels instead of fat 5x7 blocks.
const BIG_FONT = '"DejaVu Sans Mono", "Menlo", "Consolas", monospace';
const bigCache = new Map();
export const isBig = (px) => Math.round(px * RES / 9.5) >= 2;

// one 1-bit canvas per character, size and colour; strings are laid out from these with a fixed
// advance (monospace), so changing text (the timecode) never needs new rasterizing
function bigCanvas(ch, px, color) {
  const key = ch + '|' + px + '|' + color;
  let cv = bigCache.get(key);
  if (cv) return cv;
  const cap = Math.round(px * RES * .74);      // same cap height as the 5x7 font would have
  const em = Math.round(cap / .73);
  cv = document.createElement('canvas');
  const g0 = cv.getContext('2d');
  g0.font = `bold ${em}px ${BIG_FONT}`;
  const adv = Math.ceil(g0.measureText('M').width);
  const w = adv + 2, h = Math.ceil(em * 1.1) + 2;
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.font = `bold ${em}px ${BIG_FONT}`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  const base = Math.ceil(em * .85);
  g.fillText(ch, 1, base);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const [r, gg, b] = color === '#000' ? [0, 0, 0] : color.startsWith('rgb') ? color.match(/\d+/g).slice(0, 3).map(Number) : [255, 255, 255];
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] >= 110;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = on ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  cv.base = base; cv.adv = adv;
  bigCache.set(key, cv);
  return cv;
}

export const bigWidth = (s, px) => ([...s].length * bigCanvas('M', px, '#fff').adv) / RES;

export function bigText(ctx, s, x, y, px, align = 'left', color = '#fff', alpha = 1) {
  const chars = [...s], adv = bigCanvas('M', px, color).adv / RES, w = chars.length * adv;
  if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  chars.forEach((ch, i) => {
    if (ch === ' ') return;
    const cv = bigCanvas(ch, px, color);
    ctx.drawImage(cv, snap(x + i * adv) - 1 / RES, snap(y) - cv.base / RES, cv.width / RES, cv.height / RES);
  });
  ctx.globalAlpha = a;
  return w;
}
