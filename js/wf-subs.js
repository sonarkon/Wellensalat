// Subtitles: SRT in and out, and speech recognition (Whisper, runs in the browser in a worker).
// Cues are kept in seconds of the source file, so re-cutting does not move them off the speech.

const ts = (t) => {
  const ms = Math.max(0, Math.round(t * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

export function toSRT(cues, offset = 0) {
  return cues.map((c, i) => `${i + 1}\n${ts(c.start - offset)} --> ${ts(c.end - offset)}\n${c.text}\n`).join('\n');
}

export function parseSRT(text, offset = 0) {
  const sec = (s) => { const m = s.trim().match(/(?:(\d+):)?(\d+):(\d+)[,.](\d+)/); return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0').slice(0, 3) / 1000 : NaN; };
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const k = lines.findIndex((l) => l.includes('-->'));
    if (k < 0) continue;
    const [a, b] = lines[k].split('-->');
    const start = sec(a), end = sec(b);
    const body = lines.slice(k + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (Number.isFinite(start) && Number.isFinite(end) && body) cues.push({ start: start + offset, end: end + offset, text: body });
  }
  return cues.sort((p, q) => p.start - q.start);
}

// Whisper segments → cues: long segments are split at sentence ends, then at words,
// the time divided by the number of characters
export function chunksToCues(chunks, dur, offset = 0, maxChars = 70) {
  const cues = [];
  for (const ch of chunks) {
    const text = ch.text.trim();
    if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) continue;   // [Musik], (Applaus)
    const t0 = ch.timestamp[0] ?? 0, t1 = ch.timestamp[1] ?? Math.min(dur, t0 + 5);
    const parts = [];
    for (const sentence of text.match(/[^.!?…]+[.!?…]*\s*/g) || [text]) {
      let cur = '';
      for (const w of sentence.trim().split(/\s+/)) {
        if (cur && (cur + ' ' + w).length > maxChars) { parts.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
      }
      if (cur) parts.push(cur);
    }
    const total = parts.reduce((a, p) => a + p.length, 0) || 1;
    let t = t0;
    for (const p of parts) {
      const d = (t1 - t0) * p.length / total;
      cues.push({ start: t + offset, end: t + d + offset, text: p });
      t += d;
    }
  }
  return cues;
}

// resample to 16 kHz mono for Whisper
export async function to16k(buf) {
  const n = Math.ceil(buf.duration * 16000);
  const off = new OfflineAudioContext(1, n, 16000);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}

let worker = null;
// onEvent({ type: 'load' | 'status' | 'done' | 'error', ... })
export function transcribe(audio, { model, language }, onEvent) {
  worker = worker || new Worker(new URL('./wf-asr-worker.js?v=cec359051e', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      onEvent?.(m);
      if (m.type === 'done') resolve(m);
      if (m.type === 'error') reject(new Error(m.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Worker-Fehler'));
    worker.postMessage({ audio, model, language }, [audio.buffer]);
  });
}
