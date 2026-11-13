// Wellensalat, audio side: decode, cut, fade, level, and the analysis the scene reads.
// Everything the picture shows is computed from the processed clip at a time t, without state,
// so the live preview and the frame-by-frame export show exactly the same thing.

export const CURVES = {
  linear: (x) => x,
  soft: (x) => Math.sin(x * Math.PI / 2),   // equal power, sounds even
  exp: (x) => x * x * x,                    // slow start, late rise
};

export async function decodeFile(file, actx) {
  return actx.decodeAudioData(await file.arrayBuffer());
}

// a short synthetic test signal (chords, a pulse, slight stereo) so the preview shows something
export function demoBuffer(sr = 48000) {
  const dur = 12, n = dur * sr, L = new Float32Array(n), R = new Float32Array(n);
  const chords = [[110, 164.8, 220, 277.2], [87.3, 130.8, 174.6, 220], [98, 146.8, 196, 246.9], [73.4, 110, 146.8, 185]];
  for (let i = 0; i < n; i++) {
    const t = i / sr, ch = chords[Math.floor(t / 3) % 4], tc = t % 3;
    const env = Math.min(1, tc * 4) * (1 - Math.max(0, tc - 2.6) / .4);
    let l = 0, r = 0;
    ch.forEach((f, k) => {
      const a = .16 / (k + 1) ** .3;
      l += a * Math.sin(6.2832 * f * t + k);
      r += a * Math.sin(6.2832 * f * 1.003 * t + k * 1.7);
    });
    const tb = t % .5, kick = Math.sin(6.2832 * 52 * tb * (1 + 1.5 * Math.exp(-tb * 30))) * Math.exp(-tb * 9) * .5;
    L[i] = l * env + kick; R[i] = r * env + kick;
  }
  const b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
  b.copyToChannel(L, 0); b.copyToChannel(R, 1);
  return b;
}

// Several cut ranges ("Schnipsel") are joined in list order. Where a fade-out meets the next
// fade-in, the two overlap by the shorter of both fades and cross-fade into each other.
// With a pause (gap, seconds) > 0 the ranges do not overlap: silence lies between them and the
// fades go out into it and come back from it.
// layoutSegs gives each range its place `at` in the joined clip; total = length of the clip.
export function layoutSegs(segs, gap = 0) {
  const out = [];
  segs.forEach((s, i) => {
    const len = Math.max(.01, s.end - s.start);
    let at = 0, xIn = 0;
    if (i) {
      const p = out[i - 1];
      if (gap > 0) at = p.at + p.len + gap;
      else {
        xIn = Math.max(0, Math.min(p.fadeOut, s.fadeIn, p.len, len));
        at = p.at + p.len - xIn;
      }
    }
    out.push({ ...s, i, len, at, xIn });
  });
  const last = out[out.length - 1];
  return { segs: out, total: last ? last.at + last.len : 0 };
}
// clip time → source time (inside a cross-fade the later range counts)
export function clipToSrc(L, t) {
  let q = L.segs[0];
  for (const s of L.segs) if (s.at <= t) q = s;
  return q ? Math.min(q.end, q.start + Math.max(0, t - q.at)) : t;
}
// source time → clip time, or null when that moment is not in the clip
export function srcToClip(L, ts) {
  for (const s of L.segs) if (ts >= s.start && ts <= s.end) return s.at + ts - s.start;
  return null;
}

// join the ranges with their fades, then level (normalize the result to −1 dBFS and/or gain).
// p: { segs: [{ start, end, fadeIn, fadeOut }], gap, curve, normalize, gainDb }. Always two channels.
export function processClip(src, p) {
  const sr = src.sampleRate, chs = src.numberOfChannels;
  const L = layoutSegs(p.segs, p.gap || 0);
  const n = Math.max(1, Math.round(L.total * sr));
  const ins = Array.from({ length: chs }, (_, c) => src.getChannelData(c));
  const shape = CURVES[p.curve] || CURVES.soft;
  const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
  const d = [out.getChannelData(0), out.getChannelData(1)];
  for (const sg of L.segs) {
    const i0 = Math.max(0, Math.round(sg.start * sr)), o0 = Math.round(sg.at * sr);
    const len = Math.min(Math.round(sg.len * sr), src.length - i0, n - o0);
    const fi = Math.min(len, Math.round(sg.fadeIn * sr)), fo = Math.min(len, Math.round(sg.fadeOut * sr));
    for (let c = 0; c < 2; c++) {
      const s = ins[Math.min(c, chs - 1)], dc = d[c];
      for (let k = 0; k < len; k++) {
        let e = 1;
        if (k < fi) e *= shape(k / fi);
        if (len - k < fo) e *= shape((len - k) / fo);
        dc[o0 + k] += s[i0 + k] * e;
      }
    }
  }
  let g = 10 ** ((p.gainDb || 0) / 20);
  if (p.normalize) {
    let pk = 0;
    for (const dc of d) for (let i = 0; i < n; i++) { const v = Math.abs(dc[i]); if (v > pk) pk = v; }
    if (pk > 1e-6) g *= 10 ** (-1 / 20) / pk;
  }
  if (g !== 1) for (const dc of d) for (let i = 0; i < n; i++) dc[i] *= g;
  return out;
}

// min / max per column (mono mix) between t0 and t1 seconds (default: the whole buffer), for the timeline
export function columnPeaks(buf, cols, t0 = 0, t1 = buf.duration) {
  const n = buf.length, chs = buf.numberOfChannels, data = Array.from({ length: chs }, (_, c) => buf.getChannelData(c));
  const mn = new Float32Array(cols), mx = new Float32Array(cols), sr = buf.sampleRate;
  for (let x = 0; x < cols; x++) {
    const a = Math.min(n - 1, Math.max(0, Math.floor((t0 + x / cols * (t1 - t0)) * sr)));
    const b = Math.min(n, Math.max(a + 1, Math.floor((t0 + (x + 1) / cols * (t1 - t0)) * sr)));
    let lo = 1, hi = -1;
    const step = Math.max(1, Math.floor((b - a) / 400)); // long files: sparse sampling is enough for a picture
    for (let i = a; i < b; i += step) {
      let v = 0;
      for (const d of data) v += d[i];
      v /= chs;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    mn[x] = lo; mx[x] = hi;
  }
  return { mn, mx };
}

// --- FFT (radix 2, in place) -------------------------------------------------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const N_FFT = 2048;
const HANN = Float32Array.from({ length: N_FFT }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (N_FFT - 1)));
const HANN_SUM = HANN.reduce((a, b) => a + b, 0);

export class Analysis {
  constructor(buf) {
    this.sr = buf.sampleRate; this.n = buf.length; this.dur = buf.length / buf.sampleRate;
    this.L = buf.getChannelData(0); this.R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : this.L;
    const n = this.n, M = new Float32Array(n), lp = new Float32Array(n);
    const a = 1 - Math.exp(-2 * Math.PI * 150 / this.sr);
    let y = 0, pk = 0;
    for (let i = 0; i < n; i++) {
      const m = (this.L[i] + this.R[i]) * .5;
      M[i] = m; y += a * (m - y); lp[i] = y;
      const v = Math.max(Math.abs(this.L[i]), Math.abs(this.R[i]));
      if (v > pk) pk = v;
    }
    this.M = M; this.lp = lp; this.peak = pk;
    this.norm = 1 / Math.max(pk, .05);   // the picture is scaled to the clip's peak
    // envelope: peak of the mono mix per 5 ms
    this.eb = Math.round(this.sr / 200);
    const nb = Math.ceil(n / this.eb);
    this.env = new Float32Array(nb);
    for (let b = 0; b < nb; b++) {
      let m = 0;
      for (let i = b * this.eb, e = Math.min(n, i + this.eb); i < e; i++) { const v = Math.abs(M[i]); if (v > m) m = v; }
      this.env[b] = m;
    }
    this.spec = new Map();
  }

  idx(t) { return Math.round(t * this.sr); }

  minmax(t0, t1) {
    let a = Math.max(0, this.idx(t0)), b = Math.min(this.n, this.idx(t1));
    if (a >= this.n || b <= 0) return [0, 0];
    if (b <= a) b = a + 1;
    let lo = Infinity, hi = -Infinity;
    for (let i = a; i < b; i++) { const v = this.M[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    return [lo, hi];
  }

  envMax(t0, t1) {
    const a = Math.max(0, Math.floor(t0 * 200)), b = Math.min(this.env.length, Math.max(a + 1, Math.ceil(t1 * 200)));
    let m = 0;
    for (let i = a; i < b; i++) if (this.env[i] > m) m = this.env[i];
    return m;
  }

  // start of a stable oscilloscope window ending near t: the last rising zero crossing of the
  // low-passed signal before t − win (like a scope's trigger), else simply t − win
  trigger(t, win) {
    const i = this.idx(t - win), lim = Math.max(1, i - this.idx(win * 1.5));
    for (let k = Math.min(i, this.n - 1); k > lim; k--) if (this.lp[k - 1] < 0 && this.lp[k] >= 0) return k / this.sr;
    return t - win;
  }

  // magnitude spectrum around t, 0..1 over −72..0 dB (of the normalized signal); cached
  spectrum(t) {
    const key = Math.round(t * 120);
    let s = this.spec.get(key);
    if (s) return s;
    const re = new Float32Array(N_FFT), im = new Float32Array(N_FFT), c = Math.round(key / 120 * this.sr) - N_FFT / 2;
    for (let i = 0; i < N_FFT; i++) { const k = c + i; re[i] = k >= 0 && k < this.n ? this.M[k] * this.norm * HANN[i] : 0; }
    fft(re, im);
    s = new Float32Array(N_FFT / 2);
    for (let i = 0; i < N_FFT / 2; i++) {
      const mag = Math.hypot(re[i], im[i]) * 2 / HANN_SUM;
      s[i] = Math.max(0, (20 * Math.log10(mag + 1e-9) + 72) / 72);
    }
    if (this.spec.size > 3000) this.spec.clear();
    this.spec.set(key, s);
    return s;
  }

  // Smoothing (0..1) for the signal views: a zero-phase low-pass (forward and backward pass) on
  // M, L and R. Returns a view of this analysis with the smoothed arrays (cached for one level).
  smoothed(k) {
    const q = Math.round(k * 20) / 20;
    if (q <= 0) return this;
    if (this.sm?.q === q) return this.sm.view;
    const fc = 12000 * (1 - q) ** 2.4 + 50, a = 1 - Math.exp(-2 * Math.PI * fc / this.sr);
    const filt = (src) => {
      const d = new Float32Array(src);
      let y = d[0];
      for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; }
      y = d[d.length - 1];
      for (let i = d.length - 1; i >= 0; i--) { y += a * (d[i] - y); d[i] = y; }
      return d;
    };
    const view = Object.create(this);
    view.M = filt(this.M);
    view.L = filt(this.L); view.R = this.R === this.L ? view.L : filt(this.R);
    this.sm = { q, view };
    return view;
  }

  // spectrum smoothed over time (0..1): an exponentially weighted mean of the last frames
  barsSmooth(t, nb, k) {
    if (!(k > 0)) return this.bars(t, nb);
    const tau = .04 + k * .5, out = new Float32Array(nb);
    let ws = 0;
    for (let j = 0; j < 10; j++) {
      const dt = j / 30, wgt = Math.exp(-dt / tau);
      if (wgt < .03) break;
      const v = this.bars(t - dt, nb);
      for (let b = 0; b < nb; b++) out[b] += v[b] * wgt;
      ws += wgt;
    }
    for (let b = 0; b < nb; b++) out[b] /= ws;
    return out;
  }

  // envelope smoothed: the mean of the 5 ms peaks over a window widened by up to ±0.25 s
  envSmooth(t0, t1, k) {
    if (!(k > 0)) return this.envMax(t0, t1);
    const pad = k * .25;
    const a = Math.max(0, Math.floor((t0 - pad) * 200)), b = Math.min(this.env.length, Math.max(a + 1, Math.ceil((t1 + pad) * 200)));
    let s = 0;
    for (let i = a; i < b; i++) s += this.env[i];
    return (b > a ? s / (b - a) : 0) * (1 + k * .6);
  }

  // spectrum on a logarithmic frequency axis, nb values
  bars(t, nb, f0 = 30, f1 = 16000) {
    const s = this.spectrum(t), hz = this.sr / N_FFT, out = new Float32Array(nb);
    for (let b = 0; b < nb; b++) {
      const fa = f0 * (f1 / f0) ** (b / nb), fb = f0 * (f1 / f0) ** ((b + 1) / nb);
      const ia = Math.max(1, Math.floor(fa / hz)), ib = Math.min(s.length - 1, Math.max(ia, Math.floor(fb / hz)));
      let m = 0;
      for (let i = ia; i <= ib; i++) if (s[i] > m) m = s[i];
      out[b] = m;
    }
    return out;
  }
}
