// Wellensalat, picture side: draws one 9:16 frame (logical 1080x1920) for a time t into a
// low-res canvas, in white "roles" like ui.js. post.js then makes phosphor or Guide out of it.
//   phosphor: 360x640 raster (the same pixel size as the stage FUI's 640x360 grid), pixel font
//   guide:    720x1280, antialiased vector lines, monospaced vector font, theme colours
import { matrixText, matrixWidth, setRes, bigText, bigWidth, isBig } from './font.js?v=15814d4cc9';
import { THEMES, inkOf } from './theme.js?v=15814d4cc9';
import { t as tr, dec } from './wf-i18n.js?v=15814d4cc9';

// view keys; their names come from wf-i18n.js (view.<key>)
export const VIEWS = [['scope'], ['xy'], ['spectrum'], ['waterfall'], ['envelope']];

// Output formats and their layout (logical px = output px). All values are multiples of 3, so the
// raster (1 device px = 3 logical px) stays on whole pixels. 9:16 keeps everything inside
// Instagram's safe zone (top ~250 px, bottom ~420 px for caption and buttons).
//   mx side margin · label / title / read / sub = baselines · by, bh = panel · strip, sh = clip strip
export const FORMATS = {
  '9:16': { w: 1080, h: 1920, name: '9:16', hint: 'Reels · Shorts · Stories · TikTok', L: { mx: 138, label: 300, title: 390, by: 432, bh: 744, read: 1224, strip: 1254, sh: 66, sub: 1392 } },
  '4:5': { w: 1080, h: 1350, name: '4:5', hint: 'Instagram-Feed', L: { mx: 138, label: 126, title: 210, by: 249, bh: 723, read: 1017, strip: 1041, sh: 54, sub: 1167 } },
  '1:1': { w: 1080, h: 1080, name: '1:1', hint: 'Quadrat', L: { mx: 138, label: 105, title: 183, by: 216, bh: 570, read: 828, strip: 849, sh: 45, sub: 954 } },
  '16:9': { w: 1920, h: 1080, name: '16:9', hint: 'YouTube · Querformat', L: { mx: 138, label: 105, title: 183, by: 216, bh: 570, read: 828, strip: 849, sh: 45, sub: 954 } },
};
const SUB_PX = 48, SUB_LH = 60;
const TEXT_FIT = [{ px: 48, lh: 60, n: 2 }, { px: 38, lh: 46, n: 3 }, { px: 30, lh: 37, n: 4 }];
const AGE_INK = ['base', 'orange', 'pink', 'violet', 'blue'];
const BAND_INKS = ['red', 'orange', 'base', 'label', 'cyan', 'blue', 'violet'];

const fmt = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${dec(s.toFixed(1).padStart(4, '0'))}`;
};

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.INK = '255,255,255';
    this.format = '9:16';
    this.bgImg = null; this.bgCache = null;
    this.bgView = { zoom: 1, x: 0, y: 0 };   // zoom ≥ 1 over 'just covers'; x, y −1…1 within the overhang
  }

  setFormat(f) { this.format = FORMATS[f] ? f : '9:16'; this.resize(); }
  setTheme(name) { this.theme = THEMES[name] ? name : 'phosphor'; this.resize(); }
  setBackground(img) { this.bgImg = img; this.bgCache = null; }
  setBgView(v) {
    const z = Math.max(1, Math.min(4, +v.zoom || 1)), cl = (q) => Math.max(-1, Math.min(1, +q || 0));
    this.bgView = { zoom: z, x: cl(v.x), y: cl(v.y) };
  }
  // how far the picture reaches over the frame, in output pixels (for dragging it)
  bgOverhang() {
    const img = this.bgImg;
    if (!img) return { ox: 0, oy: 0 };
    const s = Math.max(this.W / img.width, this.H / img.height) * this.bgView.zoom;
    return { ox: img.width * s - this.W, oy: img.height * s - this.H };
  }

  resize() {
    const th = THEMES[this.theme || 'phosphor'], F = FORMATS[this.format];
    this.smooth = !!th.post?.smooth;
    this.vfont = th.font || null;
    this.W = F.w; this.H = F.h;
    const L = F.L;
    this.L = { ...L, bx: L.mx, bw: F.w - 2 * L.mx };
    const rs = th.post?.renderScale ?? 1 / 3;
    const w = Math.round(F.w * rs), h = Math.round(F.h * rs);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.res = w / F.w; this.minW = 1 / this.res;
    setRes(this.res);
    this.c.imageSmoothingEnabled = this.smooth;
  }

  // background picture, fitted to cover the frame. In the phosphor look it becomes the raster
  // picture of the stage FUI's patient file: grey, Bayer dithered to 4 levels at device resolution.
  background() {
    const img = this.bgImg, cw = this.canvas.width, ch = this.canvas.height;
    if (!img) return null;
    const V = this.bgView, key = `${cw}x${ch}|${this.smooth}|${V.zoom.toFixed(3)}|${V.x.toFixed(3)}|${V.y.toFixed(3)}`;
    if (this.bgCache?.key === key) return this.bgCache.cv;
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d', { willReadFrequently: true });
    // always covers the frame: scale at least "just covers", position only within the overhang
    const s = Math.max(cw / img.width, ch / img.height) * V.zoom, iw = img.width * s, ih = img.height * s;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, -(iw - cw) * (V.x + 1) / 2, -(ih - ch) * (V.y + 1) / 2, iw, ih);
    if (!this.smooth) {
      const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], LV = [0, 77, 153, 255];
      const im = g.getImageData(0, 0, cw, ch), d = im.data;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        const v = Math.min(1, Math.max(0, ((.3 * d[i] + .59 * d[i + 1] + .11 * d[i + 2]) / 255 - .08) / .8)) ** .9;
        const q = LV[Math.min(3, Math.floor(v * 3 + BAYER[(y & 3) * 4 + (x & 3)] / 16))];
        d[i] = d[i + 1] = d[i + 2] = q;
      }
      g.putImageData(im, 0, 0);
    }
    this.bgCache = { key, cv };
    return cv;
  }

  // break text into lines that fit width w
  wrap(s, px, w) {
    const out = [];
    for (const para of String(s).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.textWidth(next, px) > w) { out.push(line); line = word; } else line = next;
      }
      out.push(line);
    }
    return out;
  }

  // ------------------------------------------------------------ helpers
  ink(role) { this.INK = inkOf(this.theme, role); }
  dim(a) { return `rgba(${this.INK},${a})`; }
  snap(v) { return Math.round(v * this.res) / this.res; }
  rect(x, y, w, h) {
    const x0 = this.snap(x), y0 = this.snap(y);
    this.c.fillRect(x0, y0, Math.max(this.minW, this.snap(x + w) - x0), Math.max(this.minW, this.snap(y + h) - y0));
  }

  text(s, x, y, px, align = 'left', alpha = 1) {
    const c = this.c;
    if (!this.vfont) {
      s = s.toUpperCase();
      const col = `rgb(${this.INK})`;
      return isBig(px) ? bigText(c, s, x, y, px, align, col, alpha) : matrixText(c, s, x, y, px, align, col, alpha, true);
    }
    c.font = `bold ${Math.round(px * 1.05)}px ${this.vfont}`;
    c.textAlign = align; c.textBaseline = 'alphabetic';
    c.globalAlpha = alpha; c.fillStyle = `rgb(${this.INK})`;
    c.fillText(s, x, y);
    c.globalAlpha = 1;
    return c.measureText(s).width;
  }

  textWidth(s, px) {
    if (!this.vfont) return isBig(px) ? bigWidth(s.toUpperCase(), px) : matrixWidth(s, px);
    this.c.font = `bold ${Math.round(px * 1.05)}px ${this.vfont}`;
    return this.c.measureText(s).width;
  }

  // panel outline: hard raster rectangle, or a rounded vector line in the Guide look
  frame(x, y, w, h, lw = 3) {
    const c = this.c;
    c.fillStyle = c.strokeStyle = this.dim(1);
    if (this.smooth) { c.lineWidth = lw * 1.6; c.beginPath(); c.roundRect(x, y, w, h, 14); c.stroke(); return; }
    this.rect(x, y, w, lw); this.rect(x, y + h - lw, w, lw); this.rect(x, y, lw, h); this.rect(x + w - lw, y, lw, h);
  }

  // graticule like the storage scope: divisions, a dim grid and a finely ticked centre cross
  graticule(x, y, w, h, nx, ny) {
    const c = this.c;
    this.ink(this.smooth ? 'blue' : 'base');
    c.fillStyle = this.dim(.3);
    for (let i = 1; i < nx; i++) this.rect(x + i * w / nx, y, 3, h);
    for (let j = 1; j < ny; j++) this.rect(x, y + j * h / ny, w, 3);
    c.fillStyle = this.dim(.35);
    for (let k = 1; k < nx * 5; k++) this.rect(x + k * w / nx / 5 - 3, y + h / 2 - 6, 6, 12);
    for (let k = 1; k < ny * 5; k++) this.rect(x + w / 2 - 6, y + k * h / ny / 5 - 3, 12, 6);
  }

  // ------------------------------------------------------------ frame
  // o: { view, gain, timebase (ms), xyMode, xyDelay (ms), label, title, typeTitle, readouts, strip,
  //      bgOpacity, bgDim, text, subtitles, cues: [{ start, end, text }] in clip time }
  draw(t, A, o) {
    const c = this.c, L = this.L;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const bg = this.background();
    if (bg) { c.globalAlpha = o.bgOpacity ?? .6; c.drawImage(bg, 0, 0); c.globalAlpha = 1; }
    c.setTransform(this.res, 0, 0, this.res, 0, 0);
    c.lineCap = 'round'; c.lineJoin = 'round';

    this.header(t, o);
    if (bg && o.bgDim > 0) { c.fillStyle = `rgba(0,0,0,${o.bgDim})`; c.fillRect(L.bx, L.by, L.bw, L.bh); }
    const views = { scope: this.vScope, xy: this.vXY, spectrum: this.vSpectrum, waterfall: this.vWaterfall, envelope: this.vEnvelope };
    // smoothing: the signal views read a low-passed copy, the spectral views average over time
    const As = A && o.smoothing > 0 && (o.view === 'scope' || o.view === 'xy') ? A.smoothed(o.smoothing) : A;
    const read = (views[o.view] || this.vScope).call(this, t, As, o, L.bx, L.by, L.bw, L.bh);
    this.ink('label');
    this.frame(L.bx, L.by, L.bw, L.bh);
    if (o.readouts) {
      this.ink('text');
      // the timecode on the right; the readout on the left is cut to the space that is left
      const tc = `${fmt(t)} / ${fmt(A ? A.dur : 0)}`, room = L.bw - this.textWidth(tc, 28) - 30;
      let rd = read;
      while (rd.length > 3 && this.textWidth(rd, 28) > room) rd = rd.slice(0, -1);
      if (rd !== read) rd = rd.trimEnd();
      this.text(rd, L.bx, L.read, 28, 'left', .85);
      this.text(tc, L.bx + L.bw, L.read, 28, 'right', .85);
    }
    if (o.strip && A) this.strip(t, A, L.bx, L.strip, L.bw, L.sh);
    this.caption(t, o);
  }

  // Kopfzeile and title. A line that does not fit runs through as a ticker (Laufschrift):
  // after a short pause it scrolls to the left at a steady speed and comes round again.
  header(t, o) {
    const L = this.L;
    if (o.label) { this.ink('label'); this.line(o.label, L.label, 28, t, .85); }
    const title = o.title || '';
    if (!title) return;
    this.ink('title');
    const px = 84;
    if (this.textWidth(title, px) > L.bw) { this.line(title, L.title, px, t, 1); return; }
    // typed in like a terminal line during the first seconds, with a block cursor
    const typed = o.typeTitle ? Math.min(title.length, Math.floor(Math.max(0, t - .3) * 14)) : title.length;
    const shown = title.slice(0, typed);
    const w = shown ? this.textWidth(shown, px) : 0;
    if (shown) this.text(shown, L.bx, L.title, px);
    if (o.typeTitle && (typed < title.length || Math.floor(t * 2.5) % 2 === 0)) {
      this.c.fillStyle = this.dim(1);
      const ch = px * .74;
      this.rect(L.bx + w + (shown ? px * .12 : 0), L.title - ch, px * .5, ch);
    }
  }

  // one line of text at baseline y: as it is when it fits, otherwise a ticker clipped to the panel width
  line(s, y, px, t, alpha) {
    const L = this.L, c = this.c, w = this.textWidth(s, px);
    if (w <= L.bw) { this.text(s, L.bx, y, px, 'left', alpha); return; }
    const gap = px * 2.5, period = w + gap, speed = 110 + px;          // logical px per second
    let off = Math.max(0, t - 1.2) * speed % period;
    off = this.snap(off);                                              // whole raster pixels
    c.save();
    c.beginPath(); c.rect(L.bx, y - px * 1.1, L.bw, px * 1.5); c.clip();
    this.text(s, L.bx - off, y, px, 'left', alpha);
    this.text(s, L.bx - off + period, y, px, 'left', alpha);
    // separator in the gap, like on a ticker tape
    c.fillStyle = this.dim(alpha * .8);
    const d = px * .18;
    for (const x0 of [L.bx - off + w, L.bx - off + period + w]) this.rect(x0 + gap / 2 - d / 2, y - px * .37 - d / 2, d, d);
    c.restore();
  }

  // subtitles (typed in, two lines at a time) or, without a current cue, the fixed text.
  // Two voices: A flush left, B flush right (flipVoices swaps the sides), each on 78 % of the width (so the offset shows
  // even with long lines); in the Guide look B also gets its own colour.
  caption(t, o) {
    const L = this.L;
    const cue = o.subtitles && o.cues ? o.cues.find((q) => t >= q.start && t < q.end) : null;
    let lines, typed = Infinity, right = false, w = L.bw;
    if (cue) {
      if (o.voices && cue.speaker) { w = Math.round(L.bw * .78); right = (cue.speaker === 'B') !== !!o.flipVoices; }
      const all = this.wrap(cue.text, SUB_PX, w), pages = Math.ceil(all.length / 2), span = (cue.end - cue.start) / pages;
      const pg = Math.min(pages - 1, Math.floor((t - cue.start) / span));
      lines = all.slice(pg * 2, pg * 2 + 2);
      typed = Math.floor((t - cue.start - pg * span) * 45);
    } else if (o.text) {
      // the fixed text: two lines at full size; longer, it gets smaller (up to four lines in the same place,
      // cap tops aligned); longer still, it runs through as a ticker
      const fit = TEXT_FIT.map((f) => ({ ...f, lines: this.wrap(o.text, f.px, L.bw) })).find((f) => f.lines.length <= f.n);
      this.ink('base');
      if (!fit) { this.line(String(o.text).replace(/\s+/g, ' ').trim(), L.sub, SUB_PX, t, 1); return; }
      const y0 = L.sub - Math.round((SUB_PX - fit.px) * .74);
      fit.lines.forEach((ln, i) => ln && this.text(ln, L.bx, y0 + i * fit.lh, fit.px));
      return;
    }
    if (!lines || !lines.length) return;
    this.ink(right && this.smooth ? 'cyan' : 'base');
    let left = typed, cx = L.bx, cy = L.sub;
    lines.forEach((ln, i) => {
      const y = L.sub + i * SUB_LH;
      if (left <= 0) return;
      // each line sits where it will end up and is typed from its left end
      const x0 = right ? L.bx + L.bw - this.textWidth(ln, SUB_PX) : L.bx;
      const s = ln.slice(0, left);
      left -= ln.length + 1;
      if (s) this.text(s, x0, y, SUB_PX);
      cx = x0 + (s ? this.textWidth(s, SUB_PX) : 0); cy = y;
    });
    if (cue && left < 0) { // still typing: block cursor
      this.c.fillStyle = this.dim(1);
      const ch = SUB_PX * .74;
      this.rect(cx + 6, cy - ch, SUB_PX * .45, ch);
    }
  }

  // ------------------------------------------------------------ views
  // oscilloscope: a triggered window of the mono mix
  vScope(t, A, o, x, y, w, h) {
    const c = this.c, win = o.timebase / 1000;
    this.graticule(x, y, w, h, 10, 8);
    this.ink('base');
    const cy = y + h / 2, amp = h / 2 * .9 * o.gain * (A ? A.norm : 1);
    const lim = (v) => Math.max(y + 6, Math.min(y + h - 6, v));
    if (!A) { c.fillStyle = this.dim(.9); this.rect(x, cy - 3, w, 6); return tr('rd.nosignal'); }
    const t0 = A.trigger(t, win);
    if (this.smooth) {
      const n = 360;
      c.strokeStyle = this.dim(.95); c.lineWidth = 6; c.beginPath();
      for (let i = 0; i <= n; i++) {
        const [lo, hi] = A.minmax(t0 + i / n * win, t0 + (i + 1) / n * win);
        const yy = lim(cy - (lo + hi) / 2 * amp);
        if (i) c.lineTo(x + i / n * w, yy); else c.moveTo(x, yy);
      }
      c.stroke();
    } else {
      // raster: one column per device pixel, joined to the previous one (no gaps on steep slopes)
      const cols = Math.round(w * this.res), cw = 1 / this.res;
      let pTop = null, pBot = null;
      c.fillStyle = this.dim(1);
      for (let i = 0; i < cols; i++) {
        const [lo, hi] = A.minmax(t0 + i / cols * win, t0 + (i + 1) / cols * win);
        const top0 = lim(cy - hi * amp), bot0 = lim(cy - lo * amp);
        let top = top0 - cw * .5, bot = bot0 + cw * .5;
        if (pTop !== null) { top = Math.min(top, pBot); bot = Math.max(bot, pTop); }
        this.rect(x + i * cw, top, cw, bot - top);
        pTop = top0; pBot = bot0;
      }
    }
    return `CH1 L+R  ${dec(o.timebase / 10)} MS/DIV`;
  }

  // X-Y: stereo (goniometer: mid up, side across) or the signal against itself delayed (loops)
  vXY(t, A, o, x, y, w, h) {
    const c = this.c, sq = Math.min(w, h);
    x += (w - sq) / 2; y += (h - sq) / 2; w = h = sq;
    this.graticule(x, y, w, h, 8, 8);
    if (!A) return `X-Y  ${tr('rd.nosignal')}`;
    const sr = A.sr, d = Math.max(1, Math.round(o.xyDelay / 1000 * sr)), stereo = o.xyMode === 'stereo';
    const s = w / 2 * .8 * o.gain * A.norm, cx = x + w / 2, cy = y + h / 2;
    // the figure turns about the vertical axis (like dragging the Augmentor's scope sideways);
    // the third axis is the signal one more delay back. The angle depends on t only, so the
    // export matches the preview. o.xySpin in degrees per second, o.xyTilt tips it forward.
    const yaw = (o.xySpin || 0) * t * Math.PI / 180, cY = Math.cos(yaw), sY = Math.sin(yaw);
    const tilt = (o.xyTilt || 0) * Math.PI / 180, cT = Math.cos(tilt), sT = Math.sin(tilt);
    const P = (i) => {
      i = Math.max(2 * d, Math.min(A.n - 1, i));
      let a, b, z;
      if (stereo) { a = (A.R[i] - A.L[i]) * .7071; b = (A.L[i] + A.R[i]) * .7071; z = A.M[i - d]; }
      else { a = A.M[i]; b = A.M[i - d]; z = A.M[i - 2 * d]; }
      const xr = a * cY + z * sY, zr = -a * sY + z * cY;
      const yr = b * cT - zr * sT;
      return [Math.max(x + 8, Math.min(x + w - 8, cx + xr * s)), Math.max(y + 8, Math.min(y + h - 8, cy - yr * s))];
    };
    const iNow = A.idx(t);
    // stored cloud: sparse points of the last 1.2 s, fading with age (graded colours in the Guide)
    const keep = 1.2, step = Math.max(1, Math.round(sr / 600));
    for (let gi = 0; gi < 5; gi++) {
      const a0 = keep * gi / 5, a1 = keep * (gi + 1) / 5;
      if (this.smooth) this.ink(AGE_INK[gi]); else this.ink('base');
      c.fillStyle = this.dim(this.smooth ? .95 - gi * .14 : .85 - gi * .16);
      if (this.smooth) c.beginPath();
      const ia = Math.ceil((iNow - A.idx(a1)) / step) * step, ib = iNow - A.idx(a0);
      for (let i = Math.max(0, ia); i < ib; i += step) {
        const [px, py] = P(i);
        if (this.smooth) { c.moveTo(px + 4, py); c.arc(px, py, 4, 0, 6.283); } else this.rect(px - 3, py - 3, 6, 6);
      }
      if (this.smooth) c.fill();
    }
    // the beam: the last 30 ms as a line with a heavy dot at the head
    this.ink('base');
    const n = A.idx(.03), bs = Math.max(1, Math.round(n / 160));
    c.strokeStyle = this.dim(this.smooth ? .9 : .6); c.lineWidth = this.smooth ? 5 : 6;
    c.beginPath();
    for (let k = n; k >= 0; k -= bs) { const [px, py] = P(iNow - k); if (k === n) c.moveTo(px, py); else c.lineTo(px, py); }
    c.stroke();
    const [hx, hy] = P(iNow);
    c.fillStyle = this.dim(1);
    if (this.smooth) { c.beginPath(); c.arc(hx, hy, 9, 0, 6.283); c.fill(); } else this.rect(hx - 6, hy - 6, 12, 12);
    const spin = o.xySpin ? `  ${tr('rd.spin')} ${o.xySpin > 0 ? '+' : ''}${Math.round(o.xySpin)}°/S` : '';
    return (stereo ? 'X-Y  L/R  M/S' : `X-Y  CH1 / −${dec(o.xyDelay)} MS`) + spin;
  }

  // spectrum: columns on a log frequency axis, peak hold above
  vSpectrum(t, A, o, x, y, w, h) {
    const c = this.c;
    this.ink(this.smooth ? 'blue' : 'base');
    c.fillStyle = this.dim(.3);
    for (let j = 1; j < 8; j++) this.rect(x, y + j * h / 8, w, 3);
    if (!A) return `FFT  ${tr('rd.nosignal')}`;
    const nb = this.smooth ? 64 : 48, bw = w / nb, top = y + 24, hh = h - 30;
    const v = A.barsSmooth(t, nb, o.smoothing), pk = new Float32Array(v);
    for (let k = 1; k <= 12; k++) {
      const pv = A.barsSmooth(t - k / 24, nb, o.smoothing), f = 1 - k * .035;
      for (let b = 0; b < nb; b++) pk[b] = Math.max(pk[b], pv[b] * f);
    }
    const lift = (u) => Math.min(1, Math.max(0, (u - .12) / .88) * o.gain);
    for (let b = 0; b < nb; b++) {
      if (this.smooth) this.ink(BAND_INKS[Math.floor(b / nb * BAND_INKS.length)]); else this.ink('base');
      const hv = lift(v[b]) * hh, hp = lift(pk[b]) * hh, bx = x + b * bw + 3, bwi = bw - 6;
      c.fillStyle = this.dim(this.smooth ? .95 : .8);
      if (hv > 1) {
        if (this.smooth) { c.beginPath(); c.roundRect(bx, y + h - 3 - hv, bwi, hv, Math.min(5, hv / 2)); c.fill(); } else this.rect(bx, y + h - 3 - hv, bwi, hv);
      }
      c.fillStyle = this.dim(1);
      this.rect(bx, Math.max(top, y + h - 3 - hp - 12), bwi, 6);
    }
    return 'FFT 2048  30 HZ – 16 KHZ';
  }

  // waterfall: spectra as ridge lines receding in depth, the newest at the front
  vWaterfall(t, A, o, x, y, w, h) {
    const c = this.c;
    if (!A) return `${tr('view.waterfall')}  ${tr('rd.nosignal')}`;
    const N = o.wfLines || 34, dt = 1 / 20 * 34 / N, k0 = Math.floor(t / dt), frac = t / dt - k0, nb = this.smooth ? 120 : 90;
    c.save();
    c.beginPath(); c.rect(x + 3, y + 3, w - 6, h - 6); c.clip();
    for (let i = N; i >= 0; i--) {
      const tt = (k0 - i) * dt;
      if (tt < 0) continue;
      const depth = (i + frac) / N;
      if (depth > 1) continue;
      const sc = 1 - .42 * depth, lw = w * .92 * sc, lx = x + (w - lw) / 2;
      const base = y + h - h * .08 - depth * h * .56, amp = h * .32 * sc * o.gain;
      const v = A.barsSmooth(tt, nb, o.smoothing);
      const pts = [];
      for (let j = 0; j < nb; j++) pts.push([lx + j / (nb - 1) * lw, base - Math.max(0, (v[j] - .15) / .85) * amp]);
      // hide what lies behind (filled black down to the base line)
      c.fillStyle = '#000'; c.beginPath(); c.moveTo(lx, base + 6);
      for (const [px, py] of pts) c.lineTo(px, py);
      c.lineTo(lx + lw, base + 6); c.closePath(); c.fill();
      this.ink(this.smooth ? AGE_INK[Math.min(4, Math.floor(depth * 5))] : 'base');
      const a = (1 - depth) ** 1.3;
      c.strokeStyle = this.dim(this.smooth ? .25 + .75 * a : .2 + .8 * a);
      c.lineWidth = this.smooth ? 4 : 3;
      c.beginPath();
      pts.forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.stroke();
    }
    c.restore();
    return tr('rd.waterfall');
  }

  // envelope: ±3 s around now, the past bright, the future dim, a fixed playhead in the middle
  vEnvelope(t, A, o, x, y, w, h) {
    const c = this.c, span = 3, cx = x + w / 2, cy = y + h / 2;
    this.ink(this.smooth ? 'blue' : 'base');
    c.fillStyle = this.dim(.3);
    for (let s = -span + 1; s < span; s++) this.rect(cx + s / span * w / 2 - 1, y + 3, 3, h - 6);
    if (!A) { this.ink('base'); c.fillStyle = this.dim(.9); this.rect(x, cy - 3, w, 6); return `${tr('view.envelope')}  ${tr('rd.nosignal')}`; }
    const cols = this.smooth ? 200 : Math.round(w * this.res), cw = w / cols, hh = (h / 2 - 24) * o.gain * A.norm;
    for (let i = 0; i < cols; i++) {
      const ta = t + (i / cols * 2 - 1) * span, tb = t + ((i + 1) / cols * 2 - 1) * span;
      if (tb < 0 || ta > A.dur) continue;
      const past = ta < t;
      this.ink(this.smooth ? (past ? 'base' : 'violet') : 'base');
      c.fillStyle = this.dim(past ? .95 : .35);
      const v = Math.max(3, Math.min(h / 2 - 12, A.envSmooth(ta, tb, o.smoothing) * hh));
      if (this.smooth) { c.beginPath(); c.roundRect(x + i * cw + .5, cy - v, cw - 1, v * 2, 2); c.fill(); } else this.rect(x + i * cw, cy - v, cw, v * 2);
    }
    this.ink('label');
    c.fillStyle = this.dim(1);
    this.rect(cx - 3, y + 3, 6, h - 6);
    return tr('rd.envelope');
  }

  // the whole clip as a thin strip under the panel, with the position
  strip(t, A, x, y, w, h) {
    const c = this.c, cols = this.smooth ? 268 : Math.round(w * this.res), cw = w / cols, cy = y + h / 2;
    const p = t / A.dur;
    for (let i = 0; i < cols; i++) {
      const done = i / cols < p;
      this.ink(this.smooth ? (done ? 'label' : 'blue') : 'base');
      c.fillStyle = this.dim(done ? .85 : .3);
      const v = Math.max(1.5, A.envMax(i / cols * A.dur, (i + 1) / cols * A.dur) * A.norm * (h / 2 - 3));
      this.rect(x + i * cw, cy - v, Math.max(cw - (this.smooth ? 1 : 0), this.minW), v * 2);
    }
    this.ink('base');
    c.fillStyle = this.dim(1);
    this.rect(x + p * w - 3, y - 6, 6, h + 12);
  }
}
