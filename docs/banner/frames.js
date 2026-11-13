// Renders real Wellensalat frames for the banners: the app's own scene + shader, fed with the
// built-in demo signal. Each <img data-frame='{…}'> is replaced by the rendered picture.
//   data-frame: { theme: 'phosphor'|'guide', stage, view, t, format, ...scene options }
import { Post } from '../../js/post.js';
import { THEMES } from '../../js/theme.js';
import { Scene } from '../../js/wf-scene.js';
import { Analysis, demoBuffer } from '../../js/wf-audio.js';

const STAGE_LOOK = {
  WACH: { phosphor: [1, .6, .14], hot: [1, .9, .6], persistence: .6, glow: .15 },
  N3: { phosphor: [.95, .42, .06], hot: [1, .72, .38], persistence: .88, glow: 1 },
  REM: { phosphor: [.92, .32, .04], hot: [1, .62, .3], persistence: .93, glow: 1.25 },
};
const BASE = {
  view: 'scope', gain: 1, timebase: 20, xyMode: 'delay', xyDelay: 2, xySpin: 0, xyTilt: 0, smoothing: 0,
  label: 'WELLENSALAT · AUDIO', title: '', typeTitle: false, readouts: true, strip: true,
  bgOpacity: .55, bgDim: .6, text: '', subtitles: false, voices: false, flipVoices: false, cues: [],
};

const ana = new Analysis(demoBuffer());

function look(theme, stage) {
  const th = THEMES[theme];
  if (th.color) return { phosphor: [1, 1, 1], hot: [1, 1, 1], color: 1, smooth: 1, scan: 0, persistence: .5, glow: .45, bright: 1 };
  const l = STAGE_LOOK[stage] || STAGE_LOOK.WACH;
  return { ...l, phosphor: [...l.phosphor], hot: [...l.hot], color: 0, smooth: 0, bright: 1 };
}

export function renderFrame(spec) {
  const o = { ...BASE, ...spec };
  const src = document.createElement('canvas'), out = document.createElement('canvas');
  const scene = new Scene(src);
  scene.theme = o.theme || 'phosphor';
  scene.setFormat(o.format || '9:16');
  out.width = scene.W; out.height = scene.H;
  const post = new Post(out, src, { display: { quality: 'high', shaderRes: 'grid', glow: .9, scanlines: .45 } });
  const lk = look(scene.theme, o.stage);
  // a second of frames before t, so the afterglow has built up
  const t = o.t ?? 5;
  for (let i = 30; i >= 0; i--) { scene.draw(t - i / 30, ana, o); post.render(t - i / 30, 0, lk, 1 / 30); }
  return out.toDataURL('image/png');   // same task as the last render: the WebGL buffer is still valid
}

for (const img of document.querySelectorAll('img[data-frame]')) img.src = renderFrame(JSON.parse(img.dataset.frame));
document.body.dataset.ready = '1';
