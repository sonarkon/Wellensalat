// Wellensalat: audio → waveform video (Reels, Shorts, YouTube). Import, cut, fade, pick a view and a
// look (phosphor raster or Hitchhiker vector – the Augmentor's themes 'phosphor' and 'guide'),
// add text and subtitles, export an MP4. English by default, German as an option (wf-i18n.js).
import { Post } from './post.js?v=70d9a65bda';
import { THEMES } from './theme.js?v=70d9a65bda';
import { Scene, VIEWS, FORMATS } from './wf-scene.js?v=70d9a65bda';
import { Analysis, processClip, demoBuffer, decodeFile, columnPeaks, CURVES, layoutSegs, clipToSrc, srcToClip } from './wf-audio.js?v=70d9a65bda';
import { toSRT, parseSRT, chunksToCues, to16k, transcribe, diarize, assignSpeakers, speakersOf } from './wf-subs.js?v=70d9a65bda';
import { webCodecsConfig, exportWebCodecs, exportRecorder, recorderMime } from './wf-export.js?v=70d9a65bda';
import { t as tr, setLang, getLang, dec } from './wf-i18n.js?v=70d9a65bda';
import { APP } from './wf-config.js?v=70d9a65bda';

const $ = (id) => document.getElementById(id);
$('noapp')?.remove();   // the script runs

// phosphor colours and afterglow per sleep stage (from config.json → stageLook)
const STAGE_LOOK = {
  WACH: { phosphor: [1, .6, .14], hot: [1, .9, .6], persistence: .6, glow: .15 },
  N1: { phosphor: [1, .52, .1], hot: [1, .84, .5], persistence: .65, glow: .2 },
  N2: { phosphor: [1, .46, .07], hot: [1, .78, .42], persistence: .7, glow: .25 },
  N3: { phosphor: [.95, .42, .06], hot: [1, .72, .38], persistence: .88, glow: 1 },
  REM: { phosphor: [.92, .32, .04], hot: [1, .62, .3], persistence: .93, glow: 1.25 },
};

// --- settings (the picture ones are remembered in this browser) -------------------------
const S = {
  theme: 'phosphor', stage: 'WACH', view: 'scope', gain: 1, timebase: 20, xyMode: 'delay', xyDelay: 2,
  label: 'WELLENSALAT · AUDIO', title: '', typeTitle: true, readouts: true, strip: true, safe: false, fps: 30,
  format: '9:16', bgOpacity: .55, bgDim: .6, lang: 'en', tab: 'bild', xySpin: 0, xyTilt: 0, smoothing: 0, bgZoom: 1, bgX: 0, bgY: 0,
  text: '', subtitles: true, voices: false, flipVoices: false, autoVoices: true,
  // glow and afterglow per look (phosphor starts from the stage preset)
  fx: { phosphor: { glow: .15, persist: .6 }, guide: { glow: .4, persist: .5 } }, asrModel: 'onnx-community/whisper-base', asrLang: 'english',
};
try { Object.assign(S, JSON.parse(localStorage.getItem('wellensalat.settings') || localStorage.getItem('wellenform.settings') || '{}')); } catch { /* defaults */ }
const saveS = () => { try { localStorage.setItem('wellensalat.settings', JSON.stringify(S)); } catch { /* fine */ } };
if (S.lang !== 'de') S.lang = 'en';
setLang(S.lang);
if (!THEMES[S.theme]) S.theme = 'phosphor';
// the button (or other element) carrying data-<key> that was clicked, also when its inner text was hit
const hit = (e, key) => e.target.closest?.(`[data-${key}]`)?.dataset[key];
if (!S.fx?.phosphor || !S.fx?.guide) S.fx = { phosphor: { glow: .15, persist: .6 }, guide: { glow: .4, persist: .5 } };
if (!FORMATS[S.format]) S.format = '9:16';

// the edit: source buffer and the cut ranges with their fades (in seconds of the source).
// The ranges are joined in list order; E.active is the one the fields and handles edit.
const E = { src: null, file: null, name: '', isDemo: true, segs: [], active: 0, gap: 0, curve: 'soft', normalize: true, gainDb: 0 };
let bgFile = null;      // the background picture as loaded (for the project file)
let pendingEdit = null; // a project opened without its audio: applied when that file is loaded
const seg = () => E.segs[E.active];
const lay = () => layoutSegs(E.segs, E.gap);
const toSrc = (t) => clipToSrc(lay(), t);     // clip time → source time
const toClip = (ts) => srcToClip(lay(), ts);  // source time → clip time (null: cut out)
let clip = null, ana = null;
let cues = [];   // subtitles, in seconds of the source file (they stay on the speech when re-cut)
// a cue in clip time, or null when its start is cut out
function cueClip(q) {
  const a = toClip(q.start);
  if (a === null) return null;
  const b = toClip(q.end);
  return { start: a, end: b !== null && b > a ? b : a + (q.end - q.start) };
}

// --- picture pipeline: scene (low-res canvas) → post.js shader → 1080x1920 ------------------
const srcCanvas = document.createElement('canvas');
const out = $('out');
const scene = new Scene(srcCanvas);
scene.theme = S.theme; scene.setFormat(S.format);
scene.setBgView({ zoom: S.bgZoom, x: S.bgX, y: S.bgY });
out.width = scene.W; out.height = scene.H;
const post = new Post(out, srcCanvas, { display: { quality: 'high', shaderRes: 'grid', glow: .9, scanlines: .45 } });

function look() {
  const th = THEMES[S.theme];
  const fx = S.fx[S.theme] || {};
  if (th.color) return { phosphor: [1, 1, 1], hot: [1, 1, 1], color: 1, smooth: th.post.smooth, scan: th.post.scan, persistence: fx.persist ?? th.post.persistence, glow: fx.glow ?? .4, bright: 1 };
  const l = STAGE_LOOK[S.stage] || STAGE_LOOK.WACH;
  return { phosphor: [...l.phosphor], hot: [...l.hot], persistence: fx.persist ?? l.persistence, glow: fx.glow ?? l.glow, color: 0, smooth: 0, bright: 1 };
}
const sceneOpts = () => ({
  ...S, title: (S.title || (E.isDemo ? '' : E.name)).trim(),
  cues: cues.map((q) => { const c = cueClip(q); return c && { ...c, text: q.text.toUpperCase(), speaker: q.speaker || 'A' }; }).filter(Boolean),
});
function renderFrame(t, dt) {
  scene.draw(t, ana, sceneOpts());
  post.render(t, 0, look(), dt);
}

// --- playback -------------------------------------------------------------------------
const player = {
  actx: null, node: null, startedAt: 0, pos: 0, playing: false,
  ctx() { return this.actx || (this.actx = new AudioContext()); },
  time() { return this.playing ? Math.min(clip.duration, this.actx.currentTime - this.startedAt) : this.pos; },
  play() {
    if (!clip) return;
    const a = this.ctx(); a.resume();
    if (this.pos >= clip.duration - .02) this.pos = 0;
    const n = a.createBufferSource();
    n.buffer = clip; n.connect(a.destination); n.start(0, this.pos);
    this.startedAt = a.currentTime - this.pos; this.node = n; this.playing = true;
    n.onended = () => { if (this.node === n) { this.node = null; this.playing = false; this.pos = clip.duration; updateButtons(); } };
    updateButtons();
  },
  stop() {
    if (!this.node) return;
    this.pos = this.time();
    const n = this.node; this.node = null; this.playing = false;
    try { n.stop(); } catch { /* ended */ }
    updateButtons();
  },
  toggle() { if (this.playing) this.stop(); else this.play(); },
  seek(t) {
    const was = this.playing;
    this.stop();
    this.pos = Math.max(0, Math.min(clip ? clip.duration : 0, t));
    if (was) this.play();
  },
};
const updateButtons = () => { $('play').textContent = player.playing ? tr('stop') : tr('play'); $('play2').textContent = player.playing ? '■' : '▶'; };

// --- the processed clip ---------------------------------------------------------------
let rebuildTimer = 0;
function rebuild(now = false) {
  clearTimeout(rebuildTimer);
  if (!now) { rebuildTimer = setTimeout(() => rebuild(true), 80); return; }
  if (!E.src) return;
  const was = player.playing, pos = player.time();
  player.stop();
  clip = processClip(E.src, E);
  ana = new Analysis(clip);
  player.pos = Math.min(pos, clip.duration);
  if (was) player.play();
  showEdit();
}

function loadBuffer(buf, name, isDemo = false) {
  player.stop();
  E.src = buf; E.name = name; E.isDemo = isDemo;
  E.segs = [{ start: 0, end: buf.duration, fadeIn: Math.min(.3, buf.duration / 4), fadeOut: Math.min(1.5, buf.duration / 4) }];
  E.active = 0;
  player.pos = 0;
  ov.peaks = null;
  showFileInfo();
  rebuild(true);
}

function showFileInfo() {
  const b = E.src;
  if (!b) return;
  $('fileinfo').textContent = E.isDemo ? tr('demo')
    : `${E.name.toUpperCase()} · ${fmt(b.duration)} · ${b.numberOfChannels === 1 ? 'MONO' : 'STEREO'} · ${dec(b.sampleRate / 1000)} KHZ`;
}
function importStatus(s, err = false) { $('importStatus').textContent = s; $('importStatus').classList.toggle('err', err); }
async function openFile(file) {
  if (!file) { importStatus(tr('nofile'), true); return; }
  importStatus(tr('reading', { name: file.name.toUpperCase() }));
  try {
    const buf = await decodeFile(file, player.ctx());
    loadBuffer(buf, file.name.replace(/\.[^.]+$/, ''));
    E.file = file;
    importStatus('');
    if (pendingEdit) { applyEdit(pendingEdit); pendingEdit = null; $('projStatus').textContent = tr('pj.complete'); }
  } catch (e) {
    console.error(e);
    importStatus(tr('unreadable', { name: file.name.toUpperCase(), err: e.message || e }), true);
  }
}

// --- editor fields --------------------------------------------------------------------
const fmt = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${dec(s.toFixed(1).padStart(4, '0'))}`;
};
function showEdit() {
  const g = seg(), L = lay();
  $('start').value = g.start.toFixed(2); $('end').value = g.end.toFixed(2);
  $('fadeIn').value = g.fadeIn.toFixed(1); $('fadeOut').value = g.fadeOut.toFixed(1);
  $('curve').value = E.curve; $('normalize').checked = E.normalize;
  $('gainDb').value = E.gainDb; $('gainDbV').textContent = `${E.gainDb > 0 ? '+' : ''}${dec(E.gainDb.toFixed(1))} DB`;
  $('len').textContent = fmt(g.end - g.start);
  $('segTag').textContent = String(E.active + 1);
  $('total').textContent = fmt(L.total);
  $('gap').value = E.gap.toFixed(1);
  $('gapL').hidden = E.segs.length < 2;
  $('lenwarn').textContent = L.total > 90 ? tr('len.90') : L.total > 60 ? tr('len.60') : '';
  $('segs').innerHTML = L.segs.map((q, i) => `<button data-seg="${i}" class="${i === E.active ? 'on' : ''}" title="${fmt(q.start)}–${fmt(q.end)}${q.xIn ? tr('seg.xfade', { s: dec(q.xIn.toFixed(1)) }) : ''}">${i + 1}</button>`).join('');
  $('segLeft').disabled = E.active === 0; $('segRight').disabled = E.active === E.segs.length - 1;
  $('segDel').disabled = E.segs.length < 2;
  $('segHint').hidden = E.segs.length < 2;
  if (typeof showCues === 'function') showCues();
}
function setEdit(k, v) {
  const dur = E.src.duration, g = seg();
  if (k === 'start') g.start = Math.max(0, Math.min(v, g.end - .1));
  else if (k === 'end') g.end = Math.min(dur, Math.max(v, g.start + .1));
  else g[k] = v;
  const len = g.end - g.start;
  g.fadeIn = Math.max(0, Math.min(g.fadeIn, len)); g.fadeOut = Math.max(0, Math.min(g.fadeOut, len));
  showEdit();
}
// jump the playhead to the start of the active range
function seekToActive() { player.seek(lay().segs[E.active].at); }
for (const k of ['start', 'end', 'fadeIn', 'fadeOut']) {
  $(k).addEventListener('change', () => { const v = parseFloat($(k).value.replace(',', '.')); if (Number.isFinite(v)) { setEdit(k, v); rebuild(); } else showEdit(); });
}
$('gap').addEventListener('change', () => { const v = parseFloat($('gap').value.replace(',', '.')); E.gap = Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 0; rebuild(true); });
$('curve').addEventListener('change', () => { E.curve = CURVES[$('curve').value] ? $('curve').value : 'soft'; rebuild(); });
$('normalize').addEventListener('change', () => { E.normalize = $('normalize').checked; rebuild(); });
$('gainDb').addEventListener('input', () => { E.gainDb = parseFloat($('gainDb').value); showEdit(); rebuild(); });
// ranges: select, add (+), move, remove
$('segs').addEventListener('click', (e) => { const i = hit(e, 'seg'); if (i === undefined) return; E.active = +i; showEdit(); seekToActive(); });
$('segAdd').addEventListener('click', () => {
  if (!E.src) return;
  const dur = E.src.duration, g = seg();
  // the new range is as long as the active one (at least 2 s, so it is easy to see and grab) and
  // starts a second after it; near the end of the file it moves forward to keep its length
  const want = Math.min(dur, Math.max(2, g.end - g.start));
  let start = Math.min(g.end + 1, dur - want);
  if (start < 0) start = 0;
  const end = start + want;
  E.segs.splice(E.active + 1, 0, { start, end, fadeIn: Math.min(.5, (end - start) / 3), fadeOut: Math.min(1.5, (end - start) / 3) });
  E.active += 1;
  rebuild(true); seekToActive();
});
const moveSeg = (d) => {
  const i = E.active, j = i + d;
  if (j < 0 || j >= E.segs.length) return;
  [E.segs[i], E.segs[j]] = [E.segs[j], E.segs[i]];
  E.active = j; rebuild(true); seekToActive();
};
$('segLeft').addEventListener('click', () => moveSeg(-1));
$('segRight').addEventListener('click', () => moveSeg(1));
$('segDel').addEventListener('click', () => {
  if (E.segs.length < 2) return;
  E.segs.splice(E.active, 1);
  E.active = Math.min(E.active, E.segs.length - 1);
  rebuild(true); seekToActive();
});

// --- overview: the whole file, the cut, fades, position -------------------------------------
const ov = { el: $('ov'), peaks: null, w: 0, drag: null };
const ovX = (t) => t / E.src.duration * ov.w;
const ovT = (x) => Math.max(0, Math.min(E.src.duration, x / ov.w * E.src.duration));
function drawOverview() {
  const el = ov.el, dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
  if (!w || !E.src) return;
  if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); ov.peaks = null; }
  ov.w = w;
  if (!ov.peaks) ov.peaks = columnPeaks(E.src, Math.round(w));
  const c = el.getContext('2d'), ink = getComputedStyle(document.body).getPropertyValue('--ink').trim();
  const col = (a) => `rgba(${ink},${a})`;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const top = 22, hh = h - top - 6, cy = top + hh / 2, shape = CURVES[E.curve];
  // fade envelope of one range at source time t (0 outside it)
  const envOf = (g, t) => {
    if (t < g.start || t > g.end) return 0;
    const k = t - g.start, len = g.end - g.start;
    let e = 1;
    if (k < g.fadeIn) e *= shape(Math.max(0, k) / g.fadeIn);
    if (len - k < g.fadeOut) e *= shape(Math.max(0, len - k) / g.fadeOut);
    return e;
  };
  // waveform: dim where nothing is used, bright (scaled by the fades) inside the ranges
  for (let x = 0; x < ov.peaks.mn.length; x++) {
    const t = ovT(x + .5);
    let e = 0, inside = false;
    for (const g of E.segs) if (t >= g.start && t <= g.end) { inside = true; e = Math.max(e, envOf(g, t)); }
    c.fillStyle = col(inside ? .9 : .22);
    const k = inside ? e : 1, a = ov.peaks.mx[x] * k * hh / 2, b = ov.peaks.mn[x] * k * hh / 2;
    c.fillRect(x, cy - a, 1, Math.max(1, a - b));
  }
  c.font = `11px ${getComputedStyle(document.body).fontFamily}`; c.textBaseline = 'top';
  E.segs.forEach((g, i) => {
    const act = i === E.active, xs = ovX(g.start), xe = ovX(g.end);
    // fade envelope line
    c.strokeStyle = col(act ? .8 : .4); c.lineWidth = 1.5; c.beginPath();
    for (let x = Math.floor(xs); x <= xe; x++) { const y = top + (1 - envOf(g, ovT(x))) * hh * .5; if (x === Math.floor(xs)) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
    // brackets, the number of the range in the order it is played
    c.lineWidth = act ? 3 : 2; c.strokeStyle = col(act ? 1 : .55);
    c.beginPath();
    c.moveTo(xs + 8, top); c.lineTo(xs, top); c.lineTo(xs, h - 4); c.lineTo(xs + 8, h - 4);
    c.moveTo(xe - 8, top); c.lineTo(xe, top); c.lineTo(xe, h - 4); c.lineTo(xe - 8, h - 4);
    c.stroke();
    c.fillStyle = col(act ? 1 : .6);
    c.fillText(String(i + 1), xs + 4, h - 18);
    if (act) { // fade handles of the active range
      const fi = ovX(g.start + g.fadeIn), fo = ovX(g.end - g.fadeOut);
      c.fillRect(fi - 5, top - 5, 10, 10); c.fillRect(fo - 5, top - 5, 10, 10);
      c.fillText('FADE', Math.min(fi + 8, w - 40), 2); c.textAlign = 'right'; c.fillText('FADE', Math.max(fo - 8, 40), 2); c.textAlign = 'left';
    }
  });
  // position
  if (clip) {
    const px = ovX(toSrc(player.time()));
    c.fillStyle = `rgb(${getComputedStyle(document.body).getPropertyValue('--hi').trim()})`;
    c.fillRect(px - 1, top - 2, 2, hh + 4);
  }
}
ov.el.addEventListener('pointerdown', (e) => {
  if (!E.src) return;
  const r = ov.el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const near = (t) => Math.abs(x - ovX(t)) < 9;
  const g = seg();
  let mode = 'new';
  if (y < 32 && near(g.start + g.fadeIn)) mode = 'fadeIn';
  else if (y < 32 && near(g.end - g.fadeOut)) mode = 'fadeOut';
  else if (near(g.start)) mode = 'start';
  else if (near(g.end)) mode = 'end';
  else { // a bracket of another range makes that one active
    const i = E.segs.findIndex((q) => near(q.start) || near(q.end));
    if (i >= 0) { E.active = i; mode = near(E.segs[i].start) ? 'start' : 'end'; showEdit(); }
  }
  ov.drag = { mode, x0: x, t0: ovT(x), moved: false };
  ov.el.setPointerCapture(e.pointerId);
});
ov.el.addEventListener('pointermove', (e) => {
  const d = ov.drag;
  const r = ov.el.getBoundingClientRect(), x = e.clientX - r.left, t = ovT(x);
  if (!d) { ov.el.style.cursor = E.src && E.segs.some((q) => Math.abs(x - ovX(q.start)) < 9 || Math.abs(x - ovX(q.end)) < 9) ? 'ew-resize' : 'crosshair'; return; }
  if (Math.abs(x - d.x0) > 4) d.moved = true;
  if (!d.moved) return;
  const g = seg();
  if (d.mode === 'start' || d.mode === 'end') setEdit(d.mode, t);
  else if (d.mode === 'fadeIn') setEdit('fadeIn', Math.max(0, t - g.start));
  else if (d.mode === 'fadeOut') setEdit('fadeOut', Math.max(0, g.end - t));
  else { g.start = Math.min(d.t0, t); g.end = Math.max(d.t0, t); setEdit('end', g.end); }
});
ov.el.addEventListener('pointerup', () => {
  const d = ov.drag; ov.drag = null;
  if (!d) return;
  if (d.moved) { const g = seg(); if (g.end - g.start < .1) setEdit('end', g.start + .1); rebuild(true); return; }
  // a click inside a range: that range becomes active and the playhead jumps there
  const i = E.segs.findIndex((q) => d.t0 >= q.start && d.t0 <= q.end);
  if (i < 0) return;
  if (i !== E.active) { E.active = i; showEdit(); }
  const L = lay(), q = L.segs[i];
  player.seek(q.at + d.t0 - q.start);
});

// --- transport ------------------------------------------------------------------------
$('play').addEventListener('click', () => player.toggle());
$('rew').addEventListener('click', () => player.seek(0));
// the same transport under the preview, with a scrub bar over the whole clip
$('play2').addEventListener('click', () => player.toggle());
$('rew2').addEventListener('click', () => player.seek(0));
let scrubbing = false;
$('scrub').addEventListener('pointerdown', () => { scrubbing = true; });
$('scrub').addEventListener('input', () => { if (clip) player.seek(parseFloat($('scrub').value) * clip.duration); });
$('scrub').addEventListener('change', () => { scrubbing = false; });
window.addEventListener('pointerup', () => { scrubbing = false; });
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input[type=text], input[type=number], select') || exporting) return;
  if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
  else if (e.key === 'Home') player.seek(0);
  else if ((e.key === 'i' || e.key === 'o') && E.src) {
    const at = toSrc(player.time());
    setEdit(e.key === 'i' ? 'start' : 'end', at);
    rebuild(true);
    if (e.key === 'i') seekToActive();
  }
});

// --- file input and drag & drop -------------------------------------------------------
$('file').addEventListener('change', () => { openFile($('file').files[0]); $('file').value = ''; });
for (const ev of ['dragenter', 'dragover']) window.addEventListener(ev, (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
window.addEventListener('drop', (e) => {
  e.preventDefault(); document.body.classList.remove('dragging');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) openImage(f);
  else if (f && /\.(json|wellenform)$/i.test(f.name)) openProject(f);
  else openFile(f);
});

// --- picture controls -----------------------------------------------------------------
const viewButtons = () => { $('views').innerHTML = VIEWS.map(([k]) => `<button data-view="${k}">${tr('view.' + k)}</button>`).join(''); };
viewButtons();
const num = (v, d = 2) => dec(String(+v.toFixed(d)));
function showS() {
  document.body.dataset.look = S.theme;
  document.querySelectorAll('[data-look]').forEach((b) => { if (b.tagName === 'BUTTON') b.classList.toggle('on', b.dataset.look === S.theme); });
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === S.view));
  document.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== S.view; });
  document.querySelectorAll('[data-look-only]').forEach((el) => { el.hidden = el.dataset.lookOnly !== S.theme; });
  $('gain').value = S.gain; $('gainV').textContent = `${num(S.gain)}×`;
  $('timebase').value = S.timebase; $('timebaseV').textContent = `${num(S.timebase / 10, 1)} MS/DIV`;
  $('xyMode').value = S.xyMode; $('xyDelay').value = S.xyDelay; $('xyDelayV').textContent = `${num(S.xyDelay, 1)} MS`;
  if (S.xyMode === 'stereo') $('xyDelayL').hidden = true;
  $('xySpin').value = S.xySpin; $('xySpinV').textContent = S.xySpin ? `${S.xySpin > 0 ? '+' : ''}${S.xySpin}°/S` : tr('spin.still');
  $('xyTilt').value = S.xyTilt; $('xyTiltV').textContent = `${S.xyTilt}°`;
  $('smoothing').value = S.smoothing; $('smoothingV').textContent = S.smoothing ? `${Math.round(S.smoothing * 100)} %` : tr('off');
  $('stage').value = S.stage;
  const fx = S.fx[S.theme];
  $('glow').value = fx.glow; $('glowV').textContent = num(fx.glow);
  $('persist').value = fx.persist; $('persistV').textContent = num(fx.persist);
  $('label').value = S.label; $('title').value = S.title; $('title').placeholder = E.name ? `(${E.name.toUpperCase()})` : '(Dateiname)';
  for (const k of ['typeTitle', 'readouts', 'strip', 'safe']) $(k).checked = !!S[k];
  $('safeOv').classList.toggle('on', !!S.safe);
  $('fps').value = String(S.fps);
  document.querySelectorAll('[data-format]').forEach((b) => b.classList.toggle('on', b.dataset.format === S.format));
  const F = FORMATS[S.format];
  document.body.dataset.fmt = S.format;
  $('fmtinfo').textContent = `${tr('fmt.' + S.format)} · ${F.w} × ${F.h}`;
  $('pvFmt').textContent = `${F.name} · ${F.w} × ${F.h} · ${tr('look.' + S.theme)}`;
  // tabs below the timeline
  if (!document.querySelector(`[data-panel="${S.tab}"]`)) S.tab = 'bild';
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== S.tab; });
  $('safe').closest('label').hidden = S.format !== '9:16';
  $('safeOv').classList.toggle('on', !!S.safe && S.format === '9:16');
  $('bgOpacity').value = S.bgOpacity; $('bgOpacityV').textContent = `${Math.round(S.bgOpacity * 100)} %`;
  scene.setBgView({ zoom: S.bgZoom, x: S.bgX, y: S.bgY });
  $('bgZoom').value = S.bgZoom; $('bgZoomV').textContent = `${Math.round(S.bgZoom * 100)} %`;
  $('bgX').value = S.bgX; $('bgY').value = S.bgY;
  document.body.classList.toggle('hasbg', !!scene.bgImg);
  $('bgDim').value = S.bgDim; $('bgDimV').textContent = `${Math.round(S.bgDim * 100)} %`;
  $('text').value = S.text; $('subtitles').checked = !!S.subtitles;
  $('voices').checked = !!S.voices; $('autoVoices').checked = !!S.autoVoices;
  $('flipLabel').textContent = S.flipVoices ? tr('voices.ba') : tr('voices.ab');
  $('flipVoices').disabled = !S.voices;
  document.body.classList.toggle('voices', !!S.voices);
  $('asrModel').value = S.asrModel; $('asrLang').value = S.asrLang;
  sizeFrame();
}
function setS(k, v) {
  S[k] = v; saveS(); showS();
  if (k === 'theme') scene.setTheme(S.theme);
  if (k === 'format') {
    scene.setFormat(S.format);
    out.width = scene.W; out.height = scene.H; post.resizeOutput(scene.W, scene.H);
    showMethod();
  }
}
document.querySelectorAll('button[data-look]').forEach((b) => b.addEventListener('click', () => setS('theme', b.dataset.look)));
$('tabs').addEventListener('click', (e) => { const t = hit(e, 'tab'); if (t) setS('tab', t); });
$('views').addEventListener('click', (e) => { const v = hit(e, 'view'); if (v) setS('view', v); });
for (const k of ['gain', 'timebase', 'xyDelay', 'xySpin', 'xyTilt', 'smoothing']) $(k).addEventListener('input', () => setS(k, parseFloat($(k).value)));
$('xyMode').addEventListener('change', () => setS('xyMode', $('xyMode').value));
// a phosphor stage sets colour, glow and afterglow; the two sliders then fine-tune
$('stage').addEventListener('change', () => {
  const l = STAGE_LOOK[$('stage').value] || STAGE_LOOK.WACH;
  S.fx.phosphor = { glow: l.glow, persist: l.persistence };
  setS('stage', $('stage').value);
});
for (const [id, k] of [['glow', 'glow'], ['persist', 'persist']]) $(id).addEventListener('input', () => { S.fx[S.theme][k] = parseFloat($(id).value); saveS(); showS(); });
for (const k of ['label', 'title']) $(k).addEventListener('input', () => { S[k] = $(k).value.toUpperCase(); saveS(); });
for (const k of ['typeTitle', 'readouts', 'strip', 'safe']) $(k).addEventListener('change', () => setS(k, $(k).checked));
$('fps').addEventListener('change', () => setS('fps', parseInt($('fps').value, 10)));
$('formats').innerHTML = Object.entries(FORMATS).map(([k, f]) => `<button data-format="${k}" title="${f.hint}">${f.name}</button>`).join('');
$('formats').addEventListener('click', (e) => { const f = hit(e, 'format'); if (f) setS('format', f); });
for (const k of ['bgOpacity', 'bgDim', 'bgZoom', 'bgX', 'bgY']) $(k).addEventListener('input', () => setS(k, parseFloat($(k).value)));
$('bgReset').addEventListener('click', () => { S.bgZoom = 1; S.bgX = 0; S.bgY = 0; saveS(); showS(); });
// on the preview: drag moves the picture, the wheel scales it (only with a background picture)
let bgDrag = null;
out.addEventListener('pointerdown', (e) => {
  if (!scene.bgImg) return;
  bgDrag = { x: e.clientX, y: e.clientY, bx: S.bgX, by: S.bgY, k: scene.W / out.getBoundingClientRect().width };
  out.setPointerCapture(e.pointerId);
});
out.addEventListener('pointermove', (e) => {
  if (!bgDrag) return;
  const { ox, oy } = scene.bgOverhang();
  // the picture follows the pointer: moving right shows more of its left side
  if (ox > .5) S.bgX = Math.max(-1, Math.min(1, bgDrag.bx - 2 * (e.clientX - bgDrag.x) * bgDrag.k / ox));
  if (oy > .5) S.bgY = Math.max(-1, Math.min(1, bgDrag.by - 2 * (e.clientY - bgDrag.y) * bgDrag.k / oy));
  showS();
});
const endBgDrag = () => { if (bgDrag) { bgDrag = null; saveS(); } };
out.addEventListener('pointerup', endBgDrag);
out.addEventListener('pointercancel', endBgDrag);
out.addEventListener('wheel', (e) => {
  if (!scene.bgImg) return;
  e.preventDefault();
  S.bgZoom = Math.max(1, Math.min(4, S.bgZoom * Math.exp(-e.deltaY * .0015)));
  saveS(); showS();
}, { passive: false });
$('text').addEventListener('input', () => { S.text = $('text').value.toUpperCase(); saveS(); });
$('subtitles').addEventListener('change', () => setS('subtitles', $('subtitles').checked));
for (const k of ['voices', 'autoVoices']) $(k).addEventListener('change', () => setS(k, $(k).checked));
$('flipVoices').addEventListener('click', () => setS('flipVoices', !S.flipVoices));
for (const k of ['asrModel', 'asrLang']) $(k).addEventListener('change', () => setS(k, $(k).value));

// the preview keeps the output's aspect ratio inside the space it has
function sizeFrame() {
  const fr = document.querySelector('.frame'), F = FORMATS[S.format], narrow = window.innerWidth <= 960;
  const maxW = narrow ? Math.min(document.querySelector('main').clientWidth - 4, F.w > F.h ? 900 : 420) : Math.min(window.innerWidth * .55, 1100);
  const maxH = narrow ? window.innerHeight * .7 : Math.min(window.innerHeight - 200, 900);
  const k = Math.min(maxW / F.w, maxH / F.h);
  fr.style.width = `${Math.floor(F.w * k)}px`; fr.style.height = `${Math.floor(F.h * k)}px`;
  $('transport2').style.width = $('pvHead').style.width = `${Math.max(260, Math.floor(F.w * k))}px`;
}
window.addEventListener('resize', sizeFrame);

// --- background picture ----------------------------------------------------------------
function openImage(file, keepView = false) {
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    scene.setBackground(img);
    bgFile = file;
    if (!keepView) { S.bgZoom = 1; S.bgX = 0; S.bgY = 0; saveS(); }
    showS();
    $('bgInfo').textContent = `${file.name.toUpperCase()} · ${img.width} × ${img.height}`;
    $('bgClear').hidden = false;
  };
  img.onerror = () => { $('bgInfo').textContent = tr('bg.bad'); };
  img.src = url;
}
$('bgPick').addEventListener('click', () => $('bgFile').click());
$('bgFile').addEventListener('change', () => openImage($('bgFile').files[0]));
$('bgClear').addEventListener('click', () => { scene.setBackground(null); bgFile = null; document.body.classList.remove('hasbg'); $('bgInfo').textContent = tr('bg.none'); $('bgClear').hidden = true; $('bgFile').value = ''; });

// --- subtitles -------------------------------------------------------------------------
const tnum = (v) => v.toFixed(2);
function showCues() {
  // in the order of the finished clip; cues whose start is cut out stay in the list (greyed, at the end)
  const key = (q) => cueClip(q)?.start ?? 1e9 + q.start;
  cues.sort((a, b) => key(a) - key(b));
  const cc = cues.map(cueClip);
  $('cues').innerHTML = cues.map((q, i) => `<div class="cue${q.speaker === 'B' ? ' b' : ''}${cc[i] ? '' : ' cut'}" data-i="${i}" title="${cc[i] ? '' : tr('cue.cut')}">
    <button data-act="go" title="Hierhin springen und abspielen" ${cc[i] ? '' : 'disabled'}>▶</button>
    <input type="number" step="0.05" data-k="start" value="${cc[i] ? tnum(cc[i].start) : ''}" placeholder="–" title="Start (s im fertigen Clip)">
    <input type="number" step="0.05" data-k="end" value="${cc[i] ? tnum(cc[i].end) : ''}" placeholder="–" title="Ende (s im fertigen Clip)">
    <button class="spk${q.speaker === 'B' ? ' b' : ''}" data-act="voice" title="Stimme A (links) / B (rechts) umschalten">${q.speaker || 'A'}</button>
    <input type="text" data-k="text" value="${q.text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">
    <button data-act="up" title="${tr('cue.up')}" ${i ? '' : 'disabled'}>↑</button>
    <button data-act="down" title="${tr('cue.down')}" ${i < cues.length - 1 ? '' : 'disabled'}>↓</button>
    <button data-act="del" title="${tr('cue.del')}">✕</button></div>`).join('')
    || '<div class="muted">NOCH KEINE UNTERTITEL</div>';
}
$('cues').addEventListener('change', (e) => {
  const row = e.target.closest('.cue'), k = e.target.dataset.k;
  if (!row || !k) return;
  const q = cues[+row.dataset.i];
  if (k === 'text') q.text = e.target.value;
  else { const v = parseFloat(e.target.value); if (Number.isFinite(v)) q[k] = toSrc(Math.max(0, v)); }
  if (q.end <= q.start) q.end = q.start + .5;
  cues.sort((a, b) => a.start - b.start);
  showCues();
});
$('cues').addEventListener('click', (e) => {
  const row = e.target.closest('.cue'), act = hit(e, 'act');
  if (row && act) {
    const i = +row.dataset.i;
    if (act === 'del') cues.splice(i, 1);
    else if (act === 'voice') cues[i].speaker = cues[i].speaker === 'B' ? 'A' : 'B';
    else if (act === 'up' && i > 0) mergeCues(i - 1);
    else if (act === 'down' && i < cues.length - 1) mergeCues(i);
    else if (act === 'go') { // jump only on purpose: clicking into a field no longer moves the playhead
      const cc = cueClip(cues[i]);
      if (cc) { player.seek(cc.start); if (!player.playing) player.play(); }
      return;
    }
    showCues();
  }
});
// merge cue i with cue i + 1: the earlier one keeps its voice, the time spans both
function mergeCues(i) {
  const a = cues[i], b = cues[i + 1];
  cues.splice(i, 2, { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end), text: `${a.text.trim()} ${b.text.trim()}`, speaker: a.speaker || b.speaker || '' });
}
$('subAdd').addEventListener('click', () => {
  const t = toSrc(player.time());
  cues.push({ start: t, end: t + 2.5, text: 'TEXT', speaker: 'A' });
  cues.sort((a, b) => a.start - b.start);
  showCues();
  const i = cues.findIndex((q) => q.start === t);
  document.querySelector(`.cue[data-i="${i}"] input[type=text]`)?.select();
});
$('subClear').addEventListener('click', () => { if (cues.length && confirm(tr('cue.clear'))) { cues = []; showCues(); } });
$('subExport').addEventListener('click', () => {
  if (!cues.length) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toSRT(cues.map((q) => { const c = cueClip(q); return c && { ...q, ...c }; }).filter(Boolean))], { type: 'text/plain' }));
  a.download = `${slug(S.title || E.name)}.srt`; a.click();
});
$('subImport').addEventListener('click', () => $('srtFile').click());
$('srtFile').addEventListener('change', async () => {
  const f = $('srtFile').files[0]; if (!f) return;
  // SRT times are clip times: map them back onto the source
  cues = parseSRT(await f.text()).map((q) => { const a = toSrc(q.start); return { ...q, start: a, end: a + (q.end - q.start) }; });
  $('srtFile').value = '';
  showCues();
});
let asrBusy = false;
// the cut without fades, at full level, mono 16 kHz (for both models)
async function speechAudio() {
  const speech = processClip(E.src, { ...E, normalize: true, gainDb: 0 });
  return { speech, audio: new Float32Array(await to16k(speech)) };
}
function progressHandler(st, files) {
  return (m) => {
    if (m.type === 'load') {
      files[m.file] = [m.loaded || 0, m.total || 0];
      const [l, tt] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
      st.dataset.phase = 'load';
      st.textContent = tr('asr.loadmb', { l: (l / 1e6).toFixed(0), t: (tt / 1e6).toFixed(0) });
    } else if (m.type === 'status') { st.dataset.phase = m.code === 'asr.run' || m.code === 'asr.diar' ? 'run' : 'load'; st.textContent = tr(m.code); }
  };
}
async function separateVoices(audio, st) {
  const r = await diarize(audio, progressHandler(st, {}));
  const ids = new Set(r.segments.flatMap((x) => speakersOf(x.label)));
  // the model works in clip time: assign on the clip copies, then carry the voice back
  const inClip = cues.map((q) => ({ ...q, ...(cueClip(q) || { start: -9, end: -9 }) }));
  const voiced = assignSpeakers(inClip, r.segments, 0);
  cues = cues.map((q, i) => ({ ...q, speaker: voiced[i].speaker }));
  if (!S.voices) setS('voices', true);
  showCues();
  return ids.size;
}
$('subVoices').addEventListener('click', async () => {
  if (!E.src || asrBusy || !cues.length) return;
  asrBusy = true; $('subVoices').disabled = $('subAuto').disabled = true;
  const st = $('asrStatus'), t0 = performance.now();
  try {
    st.textContent = tr('asr.prep');
    const { audio } = await speechAudio();
    const n = await separateVoices(audio, st);
    st.textContent = tr('diar.done', { n, s: Math.round((performance.now() - t0) / 1000) });
  } catch (e) { st.textContent = tr('diar.fail', { err: e.message || e }); console.error(e); }
  finally { asrBusy = false; $('subVoices').disabled = $('subAuto').disabled = false; }
});
$('subAuto').addEventListener('click', async () => {
  if (!E.src || asrBusy) return;
  asrBusy = true; $('subAuto').disabled = true;
  const st = $('asrStatus'), files = {};
  const t0 = performance.now();
  try {
    st.textContent = tr('asr.prep');
    const { speech, audio } = await speechAudio();
    const audio2 = S.autoVoices ? audio.slice() : null;   // the first copy goes to the worker
    const tick = setInterval(() => { if (st.dataset.phase === 'run') st.textContent = `${st.textContent.split(' …')[0]} … ${Math.round((performance.now() - t0) / 1000)} S`; }, 500);
    try {
      const r = await transcribe(audio, { model: S.asrModel, language: S.asrLang }, progressHandler(st, files));
      const found = chunksToCues(r.chunks, speech.duration, 0).map((q) => { const a = toSrc(q.start); return { ...q, start: a, end: a + (q.end - q.start) }; });
      cues = found;
      showCues();
      setS('subtitles', true);
      let voices = '';
      if (audio2 && found.length) voices = tr('asr.voices', { n: await separateVoices(audio2, st) });
      st.textContent = tr('asr.done', { n: found.length, v: voices, s: Math.round((performance.now() - t0) / 1000) });
    } finally { clearInterval(tick); st.dataset.phase = ''; }
  } catch (e) {
    st.textContent = tr('asr.fail', { err: e.message || e });
    console.error(e);
  } finally { asrBusy = false; $('subAuto').disabled = false; }
});

// --- export ---------------------------------------------------------------------------
let exporting = false, abort = null;
function setStatus(s, err = false) { $('status').textContent = s; $('status').classList.toggle('err', err); }
const setBar = (p) => { $('bar').firstElementChild.style.width = `${Math.round(p * 100)}%`; };
// progress of the export: the bar under the header, a line of text and the percentage on the button
const leftText = (sec) => (sec == null ? '' : tr('ex.left', { t: sec < 60 ? `${Math.max(1, Math.round(sec))} S` : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')} MIN` }));
function showProgress(p, info) {
  setBar(p);
  const pct = Math.round(p * 100);
  if (info?.finishing) setStatus(tr('ex.finishing'));
  else if (info) setStatus(tr('ex.progress', { i: info.frame, n: info.frames, pct, left: leftText(info.left) }));
  else setStatus(tr('ex.recprog', { pct }));
}
const slug = (s) => (s || 'wellensalat').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'wellensalat';

async function showMethod() {
  const cfg = clip ? await webCodecsConfig(out.width, out.height, S.fps, clip.sampleRate) : null;
  $('method').textContent = cfg ? tr('ex.fast')
    : recorderMime() ? tr('ex.rt', { fmt: recorderMime().split(';')[0].split('/')[1].toUpperCase() }) : tr('ex.none');
}

$('export').addEventListener('click', async () => {
  if (!clip || exporting) return;
  player.stop();
  exporting = true; abort = new AbortController();
  $('export').disabled = true; $('cancel').hidden = false;
  document.body.classList.add('exporting');
  setBar(0);
  const name = `${slug(S.title || E.name)}_${S.format.replace(':', 'x')}_${S.view}_${S.theme}.mp4`;
  try {
    const cfg = await webCodecsConfig(out.width, out.height, S.fps, clip.sampleRate);
    let blob;
    if (cfg) {
      setStatus(tr('ex.render'));
      blob = await exportWebCodecs({ canvas: out, fps: S.fps, clip, cfg, renderFrame, onProgress: showProgress, signal: abort.signal });
    } else {
      setStatus(tr('ex.record'));
      blob = await exportRecorder({ canvas: out, fps: S.fps, clip, actx: player.ctx(), drawAt: renderFrame, onProgress: showProgress, signal: abort.signal });
    }
    const file = blob.type.includes('webm') ? name.replace(/\.mp4$/, '.webm') : name;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file; a.textContent = file;
    $('status').classList.remove('err');
    $('status').replaceChildren(tr('ex.done', { mb: dec((blob.size / 1e6).toFixed(1)) }), a);
    a.click();
  } catch (e) {
    if (e.name === 'AbortError') setStatus(tr('ex.aborted')); else { setStatus(tr('ex.error', { err: e.message || e }), true); console.error(e); }
    setBar(0);
  } finally {
    exporting = false; abort = null;
    document.body.classList.remove('exporting');
    $('export').disabled = false; $('cancel').hidden = true;
    player.pos = 0;
  }
});
$('cancel').addEventListener('click', () => abort?.abort());

// --- project file (everything except the video) ----------------------------------------
const PROJECT_VERSION = 1;
const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const dataURLToFile = async (url, name) => { const b = await (await fetch(url)).blob(); return new File([b], name, { type: b.type }); };

async function saveProject() {
  if (!E.src) return;
  const st = $('projStatus'), embed = $('projEmbed').checked;
  st.textContent = tr('pj.saving');
  try {
    const proj = {
      app: 'wellensalat', version: PROJECT_VERSION, appVersion: APP.version, saved: new Date().toISOString(),
      settings: { ...S },
      edit: { segs: E.segs, active: E.active, gap: E.gap, curve: E.curve, normalize: E.normalize, gainDb: E.gainDb },
      cues,
      audio: E.isDemo ? { demo: true } : { name: E.file?.name || E.name, duration: E.src.duration, data: embed && E.file ? await blobToDataURL(E.file) : null },
      background: bgFile ? { name: bgFile.name, data: embed ? await blobToDataURL(bgFile) : null } : null,
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(proj)], { type: 'application/json' }));
    a.download = `${slug(S.title || E.name)}.wellensalat.json`;
    a.click();
    st.textContent = embed ? tr('pj.saved') : tr('pj.savedLean');
  } catch (e) { st.textContent = tr('pj.saveFail', { err: e.message || e }); }
}

function applyEdit(ed) {
  const dur = E.src.duration;
  const segs = (ed.segs || []).map((g) => ({ start: Math.max(0, Math.min(dur, +g.start || 0)), end: Math.max(0, Math.min(dur, +g.end || dur)), fadeIn: +g.fadeIn || 0, fadeOut: +g.fadeOut || 0 }))
    .filter((g) => g.end - g.start > .05);
  if (segs.length) E.segs = segs;
  E.active = Math.min(Math.max(0, ed.active | 0), E.segs.length - 1);
  if (CURVES[ed.curve]) E.curve = ed.curve;
  E.gap = Math.max(0, Math.min(10, +ed.gap || 0));
  E.normalize = ed.normalize !== false; E.gainDb = Number.isFinite(+ed.gainDb) ? +ed.gainDb : 0;
  rebuild(true);
}

async function openProject(file) {
  const st = $('projStatus');
  try {
    const proj = JSON.parse(await file.text());
    if (proj.app !== 'wellensalat' && proj.app !== 'wellenform') throw new Error(tr('pj.notOurs'));   // 'wellenform' = files of the first version
    // settings: only known keys, so an old or edited file cannot break the page
    for (const [k, v] of Object.entries(proj.settings || {})) if (k in S && typeof v === typeof S[k]) S[k] = v;
    if (!FORMATS[S.format]) S.format = '9:16';
    if (!THEMES[S.theme]) S.theme = 'phosphor';
    saveS();
    scene.theme = S.theme; scene.setFormat(S.format);
    out.width = scene.W; out.height = scene.H; post.resizeOutput(scene.W, scene.H);
    cues = Array.isArray(proj.cues) ? proj.cues.filter((q) => Number.isFinite(q.start) && Number.isFinite(q.end)).map((q) => ({ start: q.start, end: q.end, text: String(q.text || ''), speaker: q.speaker === 'B' ? 'B' : q.speaker === 'A' ? 'A' : '' })) : [];
    // background
    scene.setBackground(null); bgFile = null; $('bgClear').hidden = true; $('bgInfo').textContent = tr('bg.none');
    if (proj.background?.data) openImage(await dataURLToFile(proj.background.data, proj.background.name || 'bild'), true);
    // audio
    const au = proj.audio || {};
    let note = '';
    if (au.demo) { loadBuffer(demoBuffer(), 'DEMO', true); applyEdit(proj.edit || {}); }
    else if (au.data) { await openFile(await dataURLToFile(au.data, au.name || 'audio')); applyEdit(proj.edit || {}); }
    else { pendingEdit = proj.edit || {}; note = tr('pj.needAudio', { name: String(au.name || '').toUpperCase() }); }
    if (proj.background && !proj.background.data) note += tr('pj.needPic', { name: String(proj.background.name || '').toUpperCase() });
    showS(); showMethod(); showCues();
    st.textContent = tr('pj.opened', { name: file.name.toUpperCase() }) + note;
  } catch (e) { st.textContent = tr('pj.bad', { err: e.message || e }); console.error(e); }
}
$('projSave').addEventListener('click', saveProject);
$('projOpen').addEventListener('click', () => $('projFile').click());
$('projFile').addEventListener('change', () => { const f = $('projFile').files[0]; if (f) openProject(f); $('projFile').value = ''; });

// --- language and footer ----------------------------------------------------------------
function applyLang() {
  setLang(S.lang);
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === S.lang));
  viewButtons();
  showS(); updateButtons(); showFileInfo(); showMethod();
  if (E.src) showEdit();
  if (!scene.bgImg) $('bgInfo').textContent = tr('bg.none');
}
$('langs').addEventListener('click', (e) => { const l = hit(e, 'lang'); if (l && l !== S.lang) { S.lang = l; saveS(); applyLang(); } });
$('version').textContent = `${APP.name} v${APP.version}${APP.build !== 'dev' ? ` · ${APP.build.slice(0, 7)}` : ''}`;
$('repo').href = APP.repo;
if (APP.kofi) { $('kofi').href = APP.kofi; $('kofi').hidden = false; }

// --- main loop ------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (exporting) return;
  const t = clip ? player.time() : 0;
  renderFrame(t, dt);
  $('time').textContent = $('time2').textContent = `${fmt(t)} / ${fmt(clip ? clip.duration : 0)}`;
  if (!scrubbing && clip) $('scrub').value = String(t / clip.duration);
  drawOverview();
  const now2 = cues.findIndex((q) => { const c = cueClip(q); return c && t >= c.start && t < c.end; });
  if (now2 !== shownCue) {
    document.querySelector('.cue.now')?.classList.remove('now');
    document.querySelector(`.cue[data-i="${now2}"]`)?.classList.add('now');
    shownCue = now2;
  }
}
let shownCue = -1;

applyLang();
loadBuffer(demoBuffer(), 'DEMO', true);
// #at=5.2 opens at that position (handy for screenshots and links)
{ const m = location.hash.match(/at=([\d.]+)/); if (m) player.pos = Math.min(clip.duration, parseFloat(m[1])); }
showCues();
showMethod();
$('fps').addEventListener('change', showMethod);
requestAnimationFrame(frame);

// for testing in the console
window.wellensalat = window.wellenform = { S, E, player, scene, saveProject, openProject, get cues() { return cues; }, set cues(v) { cues = v; showCues(); }, get clip() { return clip; }, renderFrame, loadBuffer };
