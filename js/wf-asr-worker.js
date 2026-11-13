// Speech recognition worker: Whisper through transformers.js, entirely in the browser.
// The model is downloaded once from Hugging Face and then kept in the browser cache.
// Nothing of the audio leaves the computer.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';

env.allowLocalModels = false;
let asr = null, current = '';

async function load(model) {
  const progress_callback = (p) => {
    if (p.status === 'progress') self.postMessage({ type: 'load', file: p.file, loaded: p.loaded, total: p.total });
  };
  let gpu = false;
  try { gpu = !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch { gpu = false; }
  if (gpu) {
    try {
      return await pipeline('automatic-speech-recognition', model, { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback });
    } catch { /* fall back to wasm */ }
  }
  return pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback });
}

self.onmessage = async (e) => {
  const { audio, model, language } = e.data;
  try {
    if (!asr || current !== model) {
      self.postMessage({ type: 'status', text: 'LADE MODELL …' });
      asr = await load(model); current = model;
    }
    self.postMessage({ type: 'status', text: 'ERKENNE SPRACHE …' });
    const opts = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
    if (language && language !== 'auto') opts.language = language;
    const r = await asr(audio, opts);
    self.postMessage({ type: 'done', text: r.text, chunks: r.chunks || [{ text: r.text, timestamp: [0, null] }] });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
