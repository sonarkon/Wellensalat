// Audio → waveform video for Instagram (9:16). Import, cut, fade, pick a view and a look
// (phosphor raster or Guide vector, the same two themes as the Augmentor), export an MP4.
import { Post } from './post.js?v=cec359051e';
import { THEMES } from './theme.js?v=cec359051e';
import { Scene, VIEWS, FORMATS } from './wf-scene.js?v=cec359051e';
import { Analysis, processClip, demoBuffer, decodeFile, columnPeaks, CURVES } from './wf-audio.js?v=cec359051e';
import { toSRT, parseSRT, chunksToCues, to16k, transcribe } from './wf-subs.js?v=cec359051e';
import { webCodecsConfig, exportWebCodecs, exportRecorder, recorderMime } from './wf-export.js?v=cec359051e';

const $ = (id) => document.getElementById(id);

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
  label: 'AUGMENTOR · AUDIO', title: '', typeTitle: true, readouts: true, strip: true, safe: false, fps: 30,
  format: '9:16', bgOpacity: .55, bgDim: .6, text: '', subtitles: true, asrModel: 'onnx-community/whisper-base', asrLang: 'german',
};
try { Object.assign(S, JSON.parse(localStorage.getItem('wellenform.settings') || '{}')); } catch { /* defaults */ }
const saveS = () => { try { localStorage.setItem('wellenform.settings', JSON.stringify(S)); } catch { /* fine */ } };
if (!THEMES[S.theme]) S.theme = 'phosphor';
if (!FORMATS[S.format]) S.format = '9:16';

// the edit: source buffer, cut and fades (in seconds of the source)
const E = { src: null, name: '', isDemo: true, start: 0, end: 0, fadeIn: .3, fadeOut: 1.5, curve: 'soft', normalize: true, gainDb: 0 };
let clip = null, ana = null;
let cues = [];   // subtitles, in seconds of the source file

// --- picture pipeline: scene (low-res canvas) → post.js shader → 1080x1920 ------------------
const srcCanvas = document.createElement('canvas');
const out = $('out');
const scene = new Scene(srcCanvas);
scene.theme = S.theme; scene.setFormat(S.format);
out.width = scene.W; out.height = scene.H;
const post = new Post(out, srcCanvas, { display: { quality: 'high', shaderRes: 'grid', glow: .9, scanlines: .45 } });

function look() {
  const th = THEMES[S.theme];
  if (th.color) return { phosphor: [1, 1, 1], hot: [1, 1, 1], color: 1, smooth: th.post.smooth, scan: th.post.scan, persistence: th.post.persistence, glow: .4, bright: 1 };
  const l = STAGE_LOOK[S.stage] || STAGE_LOOK.WACH;
  return { phosphor: [...l.phosphor], hot: [...l.hot], persistence: l.persistence, glow: l.glow, color: 0, smooth: 0, bright: 1 };
}
const sceneOpts = () => ({
  ...S, title: (S.title || (E.isDemo ? '' : E.name)).trim(),
  cues: cues.map((q) => ({ start: q.start - E.start, end: q.end - E.start, text: q.text.toUpperCase() })),
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
const updateButtons = () => { $('play').textContent = player.playing ? '■ Stopp' : '▶ Abspielen'; };

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
  E.start = 0; E.end = buf.duration;
  E.fadeIn = Math.min(E.fadeIn, buf.duration / 4); E.fadeOut = Math.min(E.fadeOut, buf.duration / 4);
  player.pos = 0;
  ov.peaks = null;
  $('fileinfo').textContent = isDemo ? 'DEMO-SIGNAL (12 S) · NOCH KEINE DATEI GELADEN'
    : `${name.toUpperCase()} · ${fmt(buf.duration)} · ${buf.numberOfChannels === 1 ? 'MONO' : 'STEREO'} · ${(buf.sampleRate / 1000).toString().replace('.', ',')} KHZ`;
  rebuild(true);
}

async function openFile(file) {
  if (!file) return;
  setStatus(`LESE ${file.name.toUpperCase()} …`);
  try {
    const buf = await decodeFile(file, player.ctx());
    loadBuffer(buf, file.name.replace(/\.[^.]+$/, ''));
    setStatus('');
  } catch (e) {
    setStatus(`DATEI NICHT LESBAR: ${e.message || e}`, true);
  }
}

// --- editor fields --------------------------------------------------------------------
const fmt = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0').replace('.', ',')}`;
};
function showEdit() {
  $('start').value = E.start.toFixed(2); $('end').value = E.end.toFixed(2);
  $('fadeIn').value = E.fadeIn.toFixed(1); $('fadeOut').value = E.fadeOut.toFixed(1);
  $('curve').value = E.curve; $('normalize').checked = E.normalize;
  $('gainDb').value = E.gainDb; $('gainDbV').textContent = `${E.gainDb > 0 ? '+' : ''}${E.gainDb.toFixed(1).replace('.', ',')} DB`;
  const len = E.end - E.start;
  $('len').textContent = fmt(len);
  $('lenwarn').textContent = len > 90 ? '· LÄNGER ALS 90 S: FÜR REELS KÜRZEN' : len > 60 ? '· ÜBER 60 S' : '';
}
function setEdit(k, v) {
  const dur = E.src.duration;
  if (k === 'start') E.start = Math.max(0, Math.min(v, E.end - .1));
  else if (k === 'end') E.end = Math.min(dur, Math.max(v, E.start + .1));
  else E[k] = v;
  const len = E.end - E.start;
  E.fadeIn = Math.max(0, Math.min(E.fadeIn, len)); E.fadeOut = Math.max(0, Math.min(E.fadeOut, len));
  showEdit();
}
for (const k of ['start', 'end', 'fadeIn', 'fadeOut']) {
  $(k).addEventListener('change', () => { const v = parseFloat($(k).value.replace(',', '.')); if (Number.isFinite(v)) { setEdit(k, v); rebuild(); } else showEdit(); });
}
$('curve').addEventListener('change', () => { E.curve = CURVES[$('curve').value] ? $('curve').value : 'soft'; rebuild(); });
$('normalize').addEventListener('change', () => { E.normalize = $('normalize').checked; rebuild(); });
$('gainDb').addEventListener('input', () => { E.gainDb = parseFloat($('gainDb').value); showEdit(); rebuild(); });

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
  const top = 22, hh = h - top - 6, cy = top + hh / 2, xs = ovX(E.start), xe = ovX(E.end);
  // waveform: dim outside the cut, bright inside, scaled by the fade envelope inside
  const len = E.end - E.start, shape = CURVES[E.curve];
  const fadeAt = (t) => {
    const k = t - E.start;
    let e = 1;
    if (k < E.fadeIn) e *= shape(Math.max(0, k) / E.fadeIn);
    if (len - k < E.fadeOut) e *= shape(Math.max(0, len - k) / E.fadeOut);
    return e;
  };
  for (let x = 0; x < ov.peaks.mn.length; x++) {
    const inside = x >= xs && x < xe, t = ovT(x + .5), e = inside ? fadeAt(t) : 1;
    c.fillStyle = col(inside ? .9 : .25);
    const a = ov.peaks.mx[x] * e * hh / 2, b = ov.peaks.mn[x] * e * hh / 2;
    c.fillRect(x, cy - a, 1, Math.max(1, a - b));
  }
  // fade envelope line and the handles
  c.strokeStyle = col(.8); c.lineWidth = 1.5; c.beginPath();
  for (let x = Math.floor(xs); x <= xe; x++) { const y = top + (1 - fadeAt(ovT(x))) * hh * .5; if (x === Math.floor(xs)) c.moveTo(x, y); else c.lineTo(x, y); }
  c.stroke();
  c.fillStyle = col(1);
  const fi = ovX(E.start + E.fadeIn), fo = ovX(E.end - E.fadeOut);
  c.fillRect(fi - 5, top - 5, 10, 10); c.fillRect(fo - 5, top - 5, 10, 10);
  c.font = `11px ${getComputedStyle(document.body).fontFamily}`; c.textBaseline = 'top';
  c.fillText('FADE', Math.min(fi + 8, w - 40), 2); c.textAlign = 'right'; c.fillText('FADE', Math.max(fo - 8, 40), 2); c.textAlign = 'left';
  // brackets for start and end
  c.lineWidth = 3; c.strokeStyle = col(1);
  c.beginPath();
  c.moveTo(xs + 8, top); c.lineTo(xs, top); c.lineTo(xs, h - 4); c.lineTo(xs + 8, h - 4);
  c.moveTo(xe - 8, top); c.lineTo(xe, top); c.lineTo(xe, h - 4); c.lineTo(xe - 8, h - 4);
  c.stroke();
  // position
  if (clip) {
    const px = ovX(E.start + player.time());
    c.fillStyle = `rgb(${getComputedStyle(document.body).getPropertyValue('--hi').trim()})`;
    c.fillRect(px - 1, top - 2, 2, hh + 4);
  }
}
ov.el.addEventListener('pointerdown', (e) => {
  if (!E.src) return;
  const r = ov.el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const near = (t) => Math.abs(x - ovX(t)) < 9;
  let mode = 'new';
  if (y < 32 && near(E.start + E.fadeIn)) mode = 'fadeIn';
  else if (y < 32 && near(E.end - E.fadeOut)) mode = 'fadeOut';
  else if (near(E.start)) mode = 'start';
  else if (near(E.end)) mode = 'end';
  ov.drag = { mode, x0: x, t0: ovT(x), moved: false };
  ov.el.setPointerCapture(e.pointerId);
});
ov.el.addEventListener('pointermove', (e) => {
  const d = ov.drag;
  const r = ov.el.getBoundingClientRect(), x = e.clientX - r.left, t = ovT(x);
  if (!d) { ov.el.style.cursor = Math.abs(x - ovX(E.start || 0)) < 9 || (E.src && Math.abs(x - ovX(E.end)) < 9) ? 'ew-resize' : 'crosshair'; return; }
  if (Math.abs(x - d.x0) > 4) d.moved = true;
  if (!d.moved) return;
  if (d.mode === 'start' || d.mode === 'end') setEdit(d.mode, t);
  else if (d.mode === 'fadeIn') setEdit('fadeIn', Math.max(0, t - E.start));
  else if (d.mode === 'fadeOut') setEdit('fadeOut', Math.max(0, E.end - t));
  else { E.start = Math.min(d.t0, t); E.end = Math.max(d.t0, t); setEdit('end', E.end); }
});
ov.el.addEventListener('pointerup', () => {
  const d = ov.drag; ov.drag = null;
  if (!d) return;
  if (d.moved) { if (E.end - E.start < .1) setEdit('end', E.start + .1); rebuild(true); return; }
  // a click: jump there (inside the cut)
  if (d.t0 >= E.start && d.t0 <= E.end) player.seek(d.t0 - E.start);
});

// --- transport ------------------------------------------------------------------------
$('play').addEventListener('click', () => player.toggle());
$('rew').addEventListener('click', () => player.seek(0));
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input[type=text], input[type=number], select') || exporting) return;
  if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
  else if (e.key === 'Home') player.seek(0);
  else if ((e.key === 'i' || e.key === 'o') && E.src) {
    const at = E.start + player.time();
    setEdit(e.key === 'i' ? 'start' : 'end', at);
    rebuild(true);
    if (e.key === 'i') player.seek(0);
  }
});

// --- file input and drag & drop -------------------------------------------------------
$('drop').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', () => openFile($('file').files[0]));
window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
window.addEventListener('drop', (e) => {
  e.preventDefault(); document.body.classList.remove('dragging');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) openImage(f); else openFile(f);
});

// --- picture controls -----------------------------------------------------------------
$('views').innerHTML = VIEWS.map(([k, n]) => `<button data-view="${k}">${n}</button>`).join('');
const num = (v, d = 2) => String(+v.toFixed(d)).replace('.', ',');
function showS() {
  document.body.dataset.look = S.theme;
  document.querySelectorAll('[data-look]').forEach((b) => { if (b.tagName === 'BUTTON') b.classList.toggle('on', b.dataset.look === S.theme); });
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === S.view));
  document.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== S.view; });
  document.querySelectorAll('[data-look-only]').forEach((el) => { el.hidden = el.dataset.lookOnly !== S.theme; });
  $('gain').value = S.gain; $('gainV').textContent = `${num(S.gain)}×`;
  $('timebase').value = S.timebase; $('timebaseV').textContent = `${num(S.timebase / 10, 1)} MS/DIV`;
  $('xyMode').value = S.xyMode; $('xyDelay').value = S.xyDelay; $('xyDelayV').textContent = `${num(S.xyDelay, 1)} MS`;
  if (S.xyMode === 'stereo') document.querySelector('[data-for=xy]:last-of-type').hidden = true;
  $('stage').value = S.stage;
  $('label').value = S.label; $('title').value = S.title; $('title').placeholder = E.name ? `(${E.name.toUpperCase()})` : '(Dateiname)';
  for (const k of ['typeTitle', 'readouts', 'strip', 'safe']) $(k).checked = !!S[k];
  $('safeOv').classList.toggle('on', !!S.safe);
  $('fps').value = String(S.fps);
  document.querySelectorAll('[data-format]').forEach((b) => b.classList.toggle('on', b.dataset.format === S.format));
  const F = FORMATS[S.format];
  document.body.dataset.fmt = S.format;
  $('fmtinfo').textContent = `${F.hint} · ${F.w} × ${F.h}`;
  $('safe').closest('label').hidden = S.format !== '9:16';
  $('safeOv').classList.toggle('on', !!S.safe && S.format === '9:16');
  $('bgOpacity').value = S.bgOpacity; $('bgOpacityV').textContent = `${Math.round(S.bgOpacity * 100)} %`;
  $('bgDim').value = S.bgDim; $('bgDimV').textContent = `${Math.round(S.bgDim * 100)} %`;
  $('text').value = S.text; $('subtitles').checked = !!S.subtitles;
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
$('views').addEventListener('click', (e) => { const v = e.target.dataset?.view; if (v) setS('view', v); });
for (const k of ['gain', 'timebase', 'xyDelay']) $(k).addEventListener('input', () => setS(k, parseFloat($(k).value)));
for (const k of ['xyMode', 'stage']) $(k).addEventListener('change', () => setS(k, $(k).value));
for (const k of ['label', 'title']) $(k).addEventListener('input', () => { S[k] = $(k).value.toUpperCase(); saveS(); });
for (const k of ['typeTitle', 'readouts', 'strip', 'safe']) $(k).addEventListener('change', () => setS(k, $(k).checked));
$('fps').addEventListener('change', () => setS('fps', parseInt($('fps').value, 10)));
$('formats').innerHTML = Object.entries(FORMATS).map(([k, f]) => `<button data-format="${k}" title="${f.hint}">${f.name}</button>`).join('');
$('formats').addEventListener('click', (e) => { const f = e.target.dataset?.format; if (f) setS('format', f); });
for (const k of ['bgOpacity', 'bgDim']) $(k).addEventListener('input', () => setS(k, parseFloat($(k).value)));
$('text').addEventListener('input', () => { S.text = $('text').value.toUpperCase(); saveS(); });
$('subtitles').addEventListener('change', () => setS('subtitles', $('subtitles').checked));
for (const k of ['asrModel', 'asrLang']) $(k).addEventListener('change', () => setS(k, $(k).value));

// the preview keeps the output's aspect ratio inside the space it has
function sizeFrame() {
  const fr = document.querySelector('.frame'), F = FORMATS[S.format], narrow = window.innerWidth <= 960;
  const maxW = narrow ? Math.min(document.querySelector('main').clientWidth - 4, F.w > F.h ? 900 : 420) : Math.min(window.innerWidth * .55, 1100);
  const maxH = narrow ? window.innerHeight * .75 : Math.min(window.innerHeight - 110, 900);
  const k = Math.min(maxW / F.w, maxH / F.h);
  fr.style.width = `${Math.floor(F.w * k)}px`; fr.style.height = `${Math.floor(F.h * k)}px`;
}
window.addEventListener('resize', sizeFrame);

// --- background picture ----------------------------------------------------------------
function openImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    scene.setBackground(img);
    $('bgInfo').textContent = `${file.name.toUpperCase()} · ${img.width} × ${img.height}`;
    $('bgClear').hidden = false;
  };
  img.onerror = () => setStatus('BILD NICHT LESBAR', true);
  img.src = url;
}
$('bgPick').addEventListener('click', () => $('bgFile').click());
$('bgFile').addEventListener('change', () => openImage($('bgFile').files[0]));
$('bgClear').addEventListener('click', () => { scene.setBackground(null); $('bgInfo').textContent = 'KEIN BILD · AUCH PER DRAG & DROP'; $('bgClear').hidden = true; $('bgFile').value = ''; });

// --- subtitles -------------------------------------------------------------------------
const tnum = (v) => v.toFixed(2);
function showCues() {
  $('cues').innerHTML = cues.map((q, i) => `<div class="cue" data-i="${i}">
    <input type="number" step="0.05" data-k="start" value="${tnum(q.start - E.start)}" title="Start (s im Schnitt)">
    <input type="number" step="0.05" data-k="end" value="${tnum(q.end - E.start)}" title="Ende (s im Schnitt)">
    <input type="text" data-k="text" value="${q.text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">
    <button data-del="${i}" title="Löschen">✕</button></div>`).join('')
    || '<div class="muted">NOCH KEINE UNTERTITEL</div>';
}
$('cues').addEventListener('change', (e) => {
  const row = e.target.closest('.cue'), k = e.target.dataset.k;
  if (!row || !k) return;
  const q = cues[+row.dataset.i];
  if (k === 'text') q.text = e.target.value;
  else { const v = parseFloat(e.target.value); if (Number.isFinite(v)) q[k] = v + E.start; }
  if (q.end <= q.start) q.end = q.start + .5;
  cues.sort((a, b) => a.start - b.start);
  showCues();
});
$('cues').addEventListener('click', (e) => {
  if (e.target.dataset.del !== undefined) { cues.splice(+e.target.dataset.del, 1); showCues(); return; }
  const row = e.target.closest('.cue');
  if (row && e.target.tagName !== 'INPUT') player.seek(cues[+row.dataset.i].start - E.start);
});
$('cues').addEventListener('focusin', (e) => {
  const row = e.target.closest('.cue');
  if (row && !player.playing) player.seek(Math.max(0, cues[+row.dataset.i].start - E.start));
});
$('subAdd').addEventListener('click', () => {
  const t = E.start + player.time();
  cues.push({ start: t, end: Math.min(E.end, t + 2.5), text: 'TEXT' });
  cues.sort((a, b) => a.start - b.start);
  showCues();
  const i = cues.findIndex((q) => q.start === t);
  document.querySelector(`.cue[data-i="${i}"] input[type=text]`)?.select();
});
$('subClear').addEventListener('click', () => { if (cues.length && confirm('Alle Untertitel löschen?')) { cues = []; showCues(); } });
$('subExport').addEventListener('click', () => {
  if (!cues.length) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toSRT(cues, E.start)], { type: 'text/plain' }));
  a.download = `${slug(S.title || E.name)}.srt`; a.click();
});
$('subImport').addEventListener('click', () => $('srtFile').click());
$('srtFile').addEventListener('change', async () => {
  const f = $('srtFile').files[0]; if (!f) return;
  cues = parseSRT(await f.text(), E.start);
  $('srtFile').value = '';
  showCues();
});
let asrBusy = false;
$('subAuto').addEventListener('click', async () => {
  if (!E.src || asrBusy) return;
  asrBusy = true; $('subAuto').disabled = true;
  const st = $('asrStatus'), files = {};
  const t0 = performance.now();
  try {
    st.textContent = 'BEREITE AUDIO VOR …';
    // the cut without fades, at full level, mono 16 kHz
    const speech = processClip(E.src, { ...E, fadeIn: 0, fadeOut: 0, normalize: true, gainDb: 0 });
    const audio = new Float32Array(await to16k(speech));
    const tick = setInterval(() => { if (st.dataset.phase === 'run') st.textContent = `ERKENNE SPRACHE … ${Math.round((performance.now() - t0) / 1000)} S`; }, 500);
    try {
      const r = await transcribe(audio, { model: S.asrModel, language: S.asrLang }, (m) => {
        if (m.type === 'load') {
          files[m.file] = [m.loaded || 0, m.total || 0];
          const [l, tt] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
          st.dataset.phase = 'load';
          st.textContent = `LADE MODELL … ${(l / 1e6).toFixed(0)} / ${(tt / 1e6).toFixed(0)} MB`;
        } else if (m.type === 'status') { st.dataset.phase = m.text.startsWith('ERKENNE') ? 'run' : 'load'; st.textContent = m.text; }
      });
      const found = chunksToCues(r.chunks, speech.duration, E.start);
      cues = found;
      showCues();
      setS('subtitles', true);
      st.textContent = `${found.length} ZEILEN ERKANNT IN ${Math.round((performance.now() - t0) / 1000)} S · BITTE DURCHSEHEN`;
    } finally { clearInterval(tick); st.dataset.phase = ''; }
  } catch (e) {
    st.textContent = `ERKENNUNG FEHLGESCHLAGEN: ${e.message || e}`;
    console.error(e);
  } finally { asrBusy = false; $('subAuto').disabled = false; }
});

// --- export ---------------------------------------------------------------------------
let exporting = false, abort = null;
function setStatus(s, err = false) { $('status').textContent = s; $('status').classList.toggle('err', err); }
const setBar = (p) => { $('bar').firstElementChild.style.width = `${Math.round(p * 100)}%`; };
const slug = (s) => (s || 'wellenform').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'wellenform';

async function showMethod() {
  const cfg = clip ? await webCodecsConfig(out.width, out.height, S.fps, clip.sampleRate) : null;
  $('method').textContent = cfg ? 'MP4 · H.264 + AAC · SCHNELLER ALS ECHTZEIT'
    : recorderMime() ? `ECHTZEIT-AUFNAHME (${recorderMime().split(';')[0].split('/')[1].toUpperCase()}) · TAB IM VORDERGRUND LASSEN` : 'KEIN VIDEO-EXPORT IN DIESEM BROWSER';
}

$('export').addEventListener('click', async () => {
  if (!clip || exporting) return;
  player.stop();
  exporting = true; abort = new AbortController();
  $('export').disabled = true; $('cancel').hidden = false;
  setBar(0);
  const name = `${slug(S.title || E.name)}_${S.format.replace(':', 'x')}_${S.view}_${S.theme}.mp4`;
  try {
    const cfg = await webCodecsConfig(out.width, out.height, S.fps, clip.sampleRate);
    let blob;
    if (cfg) {
      setStatus('RENDERE BILD FÜR BILD …');
      blob = await exportWebCodecs({ canvas: out, fps: S.fps, clip, cfg, renderFrame, onProgress: setBar, signal: abort.signal });
    } else {
      setStatus('NEHME IN ECHTZEIT AUF … TAB IM VORDERGRUND LASSEN');
      blob = await exportRecorder({ canvas: out, fps: S.fps, clip, actx: player.ctx(), drawAt: renderFrame, onProgress: setBar, signal: abort.signal });
    }
    const file = blob.type.includes('webm') ? name.replace(/\.mp4$/, '.webm') : name;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file; a.textContent = file;
    $('status').classList.remove('err');
    $('status').replaceChildren(`FERTIG · ${(blob.size / 1e6).toFixed(1).replace('.', ',')} MB · `, a);
    a.click();
  } catch (e) {
    if (e.name === 'AbortError') setStatus('ABGEBROCHEN'); else { setStatus(`FEHLER: ${e.message || e}`, true); console.error(e); }
    setBar(0);
  } finally {
    exporting = false; abort = null;
    $('export').disabled = false; $('cancel').hidden = true;
    player.pos = 0;
  }
});
$('cancel').addEventListener('click', () => abort?.abort());

// --- main loop ------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (exporting) return;
  const t = clip ? player.time() : 0;
  renderFrame(t, dt);
  $('time').textContent = `${fmt(t)} / ${fmt(clip ? clip.duration : 0)}`;
  drawOverview();
  const tc = E.start + t, now2 = cues.findIndex((q) => tc >= q.start && tc < q.end);
  if (now2 !== shownCue) {
    document.querySelector('.cue.now')?.classList.remove('now');
    document.querySelector(`.cue[data-i="${now2}"]`)?.classList.add('now');
    shownCue = now2;
  }
}
let shownCue = -1;

showS();
loadBuffer(demoBuffer(), 'DEMO', true);
showCues();
showMethod();
$('fps').addEventListener('change', showMethod);
requestAnimationFrame(frame);

// for testing in the console
window.wellenform = { S, E, player, scene, get cues() { return cues; }, set cues(v) { cues = v; showCues(); }, get clip() { return clip; }, renderFrame, loadBuffer };
