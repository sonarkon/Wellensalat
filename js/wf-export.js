// Wellensalat, video export (1080x1920 MP4 for Instagram).
//   1. WebCodecs (Chrome, Edge, newer Safari): frame by frame, faster than real time, exact.
//      H.264 + AAC, muxed with mp4-muxer (loaded from the CDN only when needed).
//   2. Fallback MediaRecorder: records the running preview in real time (MP4 where the browser
//      can, otherwise WebM). The tab must stay in front while it records.
import { t as tr } from './wf-i18n.js?v=642939c822';

const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/+esm';
// level 4.2: 1080x1920 at up to 60 fps
const AVC = ['avc1.64002a', 'avc1.4d002a', 'avc1.42002a'];

export async function webCodecsConfig(w, h, fps, sr) {
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) return null;
  const bitrate = fps > 30 ? 16e6 : 12e6;
  let video = null;
  for (const codec of AVC) {
    const cfg = { codec, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) { video = cfg; break; } } catch { /* next */ }
  }
  if (!video) return null;
  const audio = { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: 2, bitrate: 192000 };
  try { if (!(await AudioEncoder.isConfigSupported(audio)).supported) return null; } catch { return null; }
  return { video, audio };
}

// Give the browser a breath without setTimeout: timers in a background tab are throttled to once a
// second (or less), which made the export crawl when the tab was not in front. Message events are not.
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
const STALL_MS = 20000;   // no encoder progress for this long = give up with an error instead of hanging

// renderFrame(t, dt) must draw the frame for time t into canvas
export async function exportWebCodecs({ canvas, fps, clip, cfg, renderFrame, onProgress, signal }) {
  const { Muxer, ArrayBufferTarget } = await import(MUXER_URL);
  const w = canvas.width, h = canvas.height, sr = clip.sampleRate;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: w, height: h, frameRate: fps },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: sr },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let fail = null;
  const venc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: (e) => { fail = e; } });
  venc.configure(cfg.video);
  const aenc = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: (e) => { fail = e; } });
  aenc.configure(cfg.audio);

  // audio: the processed clip in blocks of 4096 frames
  const L = clip.getChannelData(0), R = clip.getChannelData(clip.numberOfChannels > 1 ? 1 : 0), n = clip.length;
  for (let i = 0; i < n; i += 4096) {
    const m = Math.min(4096, n - i), data = new Float32Array(m * 2);
    data.set(L.subarray(i, i + m), 0); data.set(R.subarray(i, i + m), m);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / sr), data });
    aenc.encode(ad); ad.close();
  }

  // video: every frame rendered and encoded in turn
  const frames = Math.ceil(clip.duration * fps), dur = Math.round(1e6 / fps);
  // the afterglow needs a few frames to settle on the first picture
  for (let k = 0; k < 12; k++) renderFrame(0, 1 / fps);
  const check = () => {
    if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
    if (fail) throw fail;
    if (venc.state !== 'configured') throw new Error(tr('ex.closed'));
  };
  // wait while the encoder is busy, but never forever
  const drain = async (max) => {
    const t0 = performance.now();
    while (venc.encodeQueueSize > max) {
      check();
      if (performance.now() - t0 > STALL_MS) throw new Error(tr('ex.stall'));
      await yieldNow();
    }
  };
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    check();
    renderFrame(i / fps, 1 / fps);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: dur });
    venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();
    await drain(6);
    if (i % 3 === 0) {
      const el = (performance.now() - t0) / 1000;
      onProgress?.(i / frames, { frame: i + 1, frames, left: i > 10 ? el / (i + 1) * (frames - i - 1) : null });
      await yieldNow();
    }
  }
  onProgress?.(1, { frame: frames, frames, left: 0, finishing: true });
  await drain(0);
  // flush, but with a time limit (a stuck hardware encoder would otherwise hang here)
  const limit = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(tr('ex.stall'))), STALL_MS * 3))]);
  await limit(venc.flush()); await limit(aenc.flush());
  if (fail) throw fail;
  muxer.finalize();
  venc.close(); aenc.close();
  return new Blob([target.buffer], { type: 'video/mp4' });
}

export function recorderMime() {
  if (!('MediaRecorder' in window)) return null;
  return ['video/mp4;codecs=avc1.64002a,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

// real-time recording; drawAt(t, dt) draws the frame for t
export async function exportRecorder({ canvas, fps, clip, actx, drawAt, onProgress, signal }) {
  const mime = recorderMime();
  if (!mime) throw new Error(tr('ex.norec'));
  await actx.resume();
  const dest = actx.createMediaStreamDestination(), src = actx.createBufferSource();
  src.buffer = clip; src.connect(dest); src.connect(actx.destination);
  const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6, audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(500);
  const t0 = actx.currentTime + .25;
  src.start(t0);
  let last = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      const t = actx.currentTime - t0;
      drawAt(Math.max(0, Math.min(clip.duration, t)), dt);
      onProgress?.(Math.max(0, t / clip.duration));
      if (t >= clip.duration + .1 || signal?.aborted) resolve(); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  try { src.stop(); } catch { /* already ended */ }
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  stream.getTracks().forEach((tr) => tr.stop());
  if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
  onProgress?.(1);
  return new Blob(chunks, { type: mime.split(';')[0] });
}
