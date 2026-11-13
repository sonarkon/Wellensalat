// Waveform tool, audio side: decode, cut, fade, level, and the analysis the scene reads.
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

// cut [start, end], level (normalize to −1 dBFS and/or gain), fade in / out. Always two channels.
export function processClip(src, p) {
  const sr = src.sampleRate, chs = src.numberOfChannels;
  const i0 = Math.max(0, Math.min(src.length - 1, Math.round(p.start * sr)));
  const i1 = Math.max(i0 + 1, Math.min(src.length, Math.round(p.end * sr)));
  const n = i1 - i0;
  const ins = Array.from({ length: chs }, (_, c) => src.getChannelData(c));
  let g = 10 ** ((p.gainDb || 0) / 20);
  if (p.normalize) {
    let pk = 0;
    for (const s of ins) for (let i = i0; i < i1; i++) { const v = Math.abs(s[i]); if (v > pk) pk = v; }
    if (pk > 1e-6) g *= 10 ** (-1 / 20) / pk;
  }
  const fi = Math.min(n, Math.round(p.fadeIn * sr)), fo = Math.min(n, Math.round(p.fadeOut * sr));
  const shape = CURVES[p.curve] || CURVES.soft;
  const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const s = ins[Math.min(c, chs - 1)], d = out.getChannelData(c);
    for (let k = 0; k < n; k++) {
      let e = g;
      if (k < fi) e *= shape(k / fi);
      if (n - k < fo) e *= shape((n - k) / fo);
      d[k] = s[i0 + k] * e;
    }
  }
  return out;
}

// min / max per column over a whole buffer (mono mix), for the editor's overview
export function columnPeaks(buf, cols) {
  const n = buf.length, chs = buf.numberOfChannels, data = Array.from({ length: chs }, (_, c) => buf.getChannelData(c));
  const mn = new Float32Array(cols), mx = new Float32Array(cols);
  for (let x = 0; x < cols; x++) {
    const a = Math.floor(x / cols * n), b = Math.max(a + 1, Math.floor((x + 1) / cols * n));
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
