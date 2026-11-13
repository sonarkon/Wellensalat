// Banners drawn by Wellensalat itself, in two layers:
//   phosphor  – the Augmentor's 5×7 pixel font, a grid running through the whole picture and the
//               X-Y figure (signal against itself delayed), through post.js with REM afterglow/glow
//   hitchhiker – a waterfall landscape in the multicolour vector look, through post.js in colour
// The hitchhiker layer is added on top with 'screen' and fades out towards the text, so the
// banner shows the range from one look to the other.
// <canvas id="banner" data-layout="header|social|card">
import { Post } from '../../js/post.js';
import { Scene } from '../../js/wf-scene.js';
import { Analysis } from '../../js/wf-audio.js';
import { matrixText, setRes } from '../../js/font.js';

const buffer = (d, sr) => {
  const b = new AudioBuffer({ length: d.length, numberOfChannels: 2, sampleRate: sr });
  b.copyToChannel(d, 0); b.copyToChannel(d, 1);
  return b;
};
// a classic 2:3 Lissajous: 110 Hz left, 165 Hz right – one closed, symmetric knot in stereo X-Y
function knot(sr = 48000, dur = 6) {
  const n = sr * dur, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    l[i] = .7 * Math.sin(6.2832 * 110 * t);
    r[i] = .7 * Math.sin(6.2832 * 165 * t + .9);
  }
  const b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
  b.copyToChannel(l, 0); b.copyToChannel(r, 1);
  return b;
}
// rich in overtones (a changing saw-like chord) plus hi-hat noise: a full mountain range in the waterfall
function landscape(sr = 48000, dur = 8) {
  const d = new Float32Array(sr * dur), roots = [55, 73.4, 65.4, 49, 61.7, 82.4];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, f = roots[Math.floor(t * 2) % roots.length], tb = t % .5;
    let v = 0;
    for (let k = 1; k <= 18; k++) { const fk = f * k * (k % 4 === 0 ? 1.5 : 1); if (fk > 15000) break; v += Math.sin(6.2832 * fk * t + k) / k ** .8; }
    const hat = (t * 4) % 1 < .04 ? rnd() * .9 : 0;
    d[i] = v * .08 * (.6 + .4 * Math.exp(-tb * 4)) + hat;
  }
  return buffer(d, sr);
}
const XY = new Analysis(knot());
const SPEC = new Analysis(landscape());

const REM = { phosphor: [.92, .32, .04], hot: [1, .62, .3], persistence: .93, glow: 1.25, color: 0, smooth: 0, bright: 1 };
const HITCH = { phosphor: [1, 1, 1], hot: [1, 1, 1], color: 1, smooth: 1, scan: 0, persistence: .5, glow: .45, bright: 1 };
const POST_CFG = { display: { quality: 'high', shaderRes: 'grid', glow: .9, scanlines: .45 } };

// px for a 5×7 glyph whose pixels are `cell` raster pixels high
const pxFor = (cell, res) => cell * 9.5 / res;

const LAYOUTS = {
  // 2560 × 640
  header: {
    w: 2560, h: 640, res: .25, grid: 64,
    xy: { cx: 2112, cy: 300, s: 456 },
    land: { x: 1472, y: 320, w: 1088, h: 320, fade: .4 },
    text: [
      { s: 'AUDIO → WAVEFORM VIDEO', x: 128, y: 196, cell: 2, a: .62 },
      { s: 'WELLENSALAT', x: 128, y: 380, cell: 6, a: 1 },
      { s: 'WAVEFORM VIDEOS FOR REELS, SHORTS AND YOUTUBE', x: 128, y: 468, cell: 1, a: .85 },
      { s: 'IN YOUR BROWSER · NOTHING IS UPLOADED', x: 128, y: 512, cell: 1, a: .55 },
    ],
  },
  // 1281 × 642 (multiples of 3 for the 1/3 raster); also the GitHub social preview
  social: {
    w: 1281, h: 642, res: 1 / 3, grid: 63,
    xy: { cx: 1008, cy: 252, s: 441 },
    land: { x: 693, y: 345, w: 588, h: 297, fade: .35 },
    text: [
      { s: 'AUDIO → WAVEFORM VIDEO', x: 63, y: 111, cell: 2, a: .62 },
      { s: 'WELLEN', x: 63, y: 291, cell: 5, a: 1 },
      { s: 'SALAT', x: 63, y: 420, cell: 5, a: 1 },
      { s: 'REELS · SHORTS · YOUTUBE', x: 63, y: 492, cell: 1, a: .85 },
      { s: 'IN YOUR BROWSER · NOTHING IS UPLOADED', x: 63, y: 525, cell: 1, a: .55 },
      { s: 'SONARKON.GITHUB.IO/WELLENSALAT', x: 63, y: 588, cell: 1, a: .7 },
    ],
  },
};
// the profile card (1600 × 800): the social layout, 1.25× on a 1/4 raster
LAYOUTS.card = (() => {
  const S = LAYOUTS.social, k = 1.25, q = (v) => Math.round(v * k / 4) * 4;
  return {
    w: 1600, h: 800, res: .25, grid: 80,
    xy: { cx: q(S.xy.cx), cy: q(S.xy.cy), s: q(S.xy.s) },
    land: { x: q(S.land.x), y: q(S.land.y), w: 1600 - q(S.land.x), h: 800 - q(S.land.y), fade: S.land.fade },
    text: S.text.map((t) => ({ ...t, x: q(t.x), y: q(t.y) })),
  };
})();

// a Scene drawing onto a canvas of our own size (the scene's drawing helpers, not its layout)
function sceneOn(canvas, theme, res) {
  const sc = new Scene(document.createElement('canvas'));
  sc.theme = theme; sc.setFormat('9:16');
  sc.canvas = canvas; sc.c = canvas.getContext('2d'); sc.res = res; sc.minW = 1 / res;
  sc.smooth = theme === 'guide'; sc.vfont = sc.smooth ? sc.vfont : null;
  sc.c.imageSmoothingEnabled = sc.smooth;
  return sc;
}
function clear(sc) {
  const c = sc.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000'; c.fillRect(0, 0, sc.canvas.width, sc.canvas.height);
  c.setTransform(sc.res, 0, 0, sc.res, 0, 0);
  c.lineCap = 'round'; c.lineJoin = 'round';
}

export function renderBanner(name, t = 3.2) {
  const L = LAYOUTS[name];
  // --- phosphor layer
  const pSrc = document.createElement('canvas'), pOut = document.createElement('canvas');
  pSrc.width = Math.round(L.w * L.res); pSrc.height = Math.round(L.h * L.res);
  pOut.width = L.w; pOut.height = L.h;
  const ps = sceneOn(pSrc, 'phosphor', L.res);
  ps.graticule = () => {};   // the grid runs through the whole picture instead
  const pPost = new Post(pOut, pSrc, POST_CFG);
  const xyOpts = { gain: .72, xyMode: 'stereo', xyDelay: 1.5, xySpin: 10, xyTilt: 6 };

  const phosphorFrame = (tt) => {
    setRes(L.res);
    clear(ps);
    const c = ps.c, g = L.grid, { cx, cy, s } = L.xy;
    ps.ink('base');
    // grid aligned to the scope's centre, over the whole banner
    c.fillStyle = 'rgba(255,255,255,.17)';
    for (let x = cx % g; x < L.w; x += g) ps.rect(x, 0, 1 / L.res, L.h);
    for (let y = cy % g; y < L.h; y += g) ps.rect(0, y, L.w, 1 / L.res);
    // the scope's axes with fine ticks, also running through
    c.fillStyle = 'rgba(255,255,255,.3)';
    for (let x = cx % (g / 5); x < L.w; x += g / 5) ps.rect(x - 4, cy - 8, 8, 16);
    for (let y = cy % (g / 5); y < L.h; y += g / 5) ps.rect(cx - 8, y - 4, 16, 8);
    // lettering in the 5×7 pixel font; the grid is cleared behind it, like on a terminal
    const cellBox = (q) => { const cp = q.cell / L.res, wd = [...q.s].length * 6 * cp; return [q.x - cp * 2, q.y - 9 * cp, wd + cp * 3, 11 * cp]; };
    c.fillStyle = '#000';
    for (const q of L.text) c.fillRect(...cellBox(q));
    for (const q of L.text) matrixText(c, q.s, q.x, q.y, pxFor(q.cell, L.res), 'left', '#fff', q.a, true);
    // the figure, free on the grid
    ps.vXY(tt, XY, xyOpts, cx - s / 2, cy - s / 2, s, s);
    const rd = `X-Y  L/R  SPIN +${xyOpts.xySpin}°/S`;
    c.fillStyle = '#000'; c.fillRect(cx - s / 2 + g / 4 - 8, cy - s / 2 + g / 4 - 8 / L.res * .5 - 7 / L.res, rd.length * 6 / L.res + 16, 11 / L.res);
    matrixText(c, rd, cx - s / 2 + g / 4, cy - s / 2 + g / 4, pxFor(1, L.res), 'left', '#fff', .55, true);
  };

  // --- hitchhiker layer: a waterfall landscape
  const hRes = Math.min(.5, L.res * 2);
  const hSrc = document.createElement('canvas'), hOut = document.createElement('canvas');
  hSrc.width = Math.round(L.w * hRes); hSrc.height = Math.round(L.h * hRes);
  hOut.width = L.w; hOut.height = L.h;
  const hs = sceneOn(hSrc, 'guide', hRes);
  const hPost = new Post(hOut, hSrc, POST_CFG);
  const wfOpts = { gain: 1.3, smoothing: .35, wfLines: 14 };
  const hitchFrame = (tt) => {
    setRes(hRes);
    clear(hs);
    const { x, y, w, h } = L.land;
    hs.vWaterfall(tt, SPEC, wfOpts, x, y, w, h);
  };

  // a second and a half of frames up to t, so afterglow and trails build up
  for (let i = 45; i >= 0; i--) {
    const tt = t - i / 30;
    phosphorFrame(tt); pPost.render(tt, 0, REM, 1 / 30);
    hitchFrame(tt + 2.1); hPost.render(tt, 0, HITCH, 1 / 30);
  }
  // compose: phosphor, then the landscape with 'screen', fading out towards the text
  const out = document.createElement('canvas');
  out.width = L.w; out.height = L.h;
  const o = out.getContext('2d');
  o.drawImage(pOut, 0, 0);
  const land = document.createElement('canvas');
  land.width = L.w; land.height = L.h;
  const lc = land.getContext('2d');
  lc.drawImage(hOut, 0, 0);
  lc.globalCompositeOperation = 'destination-in';
  const { x, w } = L.land, gr = lc.createLinearGradient(x, 0, x + w * L.land.fade, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  lc.fillStyle = gr; lc.fillRect(0, 0, L.w, L.h);
  o.globalCompositeOperation = 'screen';
  o.drawImage(land, 0, 0);
  return out.toDataURL('image/png');
}

const cv = document.getElementById('banner');
const img = new Image();
img.src = renderBanner(cv.dataset.layout);
cv.replaceWith(img);
document.body.dataset.ready = '1';
