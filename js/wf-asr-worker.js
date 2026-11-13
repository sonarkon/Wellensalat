// Speech worker, entirely in the browser (transformers.js):
//   transcribe: Whisper → text segments with times
//   diarize:    pyannote segmentation 3.0 → who speaks when (speaker ids per stretch of time)
// The models are downloaded once from Hugging Face and kept in the browser cache.
// Nothing of the audio leaves the computer.
import { pipeline, env, AutoProcessor, AutoModelForAudioFrameClassification } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';

env.allowLocalModels = false;
const SEG_MODEL = 'onnx-community/pyannote-segmentation-3.0';
let asr = null, current = '', seg = null;

const progress_callback = (p) => {
  if (p.status === 'progress') self.postMessage({ type: 'load', file: p.file, loaded: p.loaded, total: p.total });
};

async function loadAsr(model) {
  let gpu = false;
  try { gpu = !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch { gpu = false; }
  if (gpu) {
    try {
      return await pipeline('automatic-speech-recognition', model, { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback });
    } catch { /* fall back to wasm */ }
  }
  return pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback });
}

async function transcribe({ audio, model, language }) {
  if (!asr || current !== model) {
    self.postMessage({ type: 'status', code: 'asr.load' });
    asr = await loadAsr(model); current = model;
  }
  self.postMessage({ type: 'status', code: 'asr.run' });
  const opts = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
  if (language && language !== 'auto') opts.language = language;
  const r = await asr(audio, opts);
  self.postMessage({ type: 'done', text: r.text, chunks: r.chunks || [{ text: r.text, timestamp: [0, null] }] });
}

async function diarize({ audio }) {
  if (!seg) {
    self.postMessage({ type: 'status', code: 'asr.loadvoice' });
    const processor = await AutoProcessor.from_pretrained(SEG_MODEL, { progress_callback });
    const model = await AutoModelForAudioFrameClassification.from_pretrained(SEG_MODEL, { device: 'wasm', dtype: 'fp32', progress_callback });
    seg = { processor, model };
  }
  self.postMessage({ type: 'status', code: 'asr.diar' });
  const inputs = await seg.processor(audio);
  const { logits } = await seg.model(inputs);
  const segments = seg.processor.post_process_speaker_diarization(logits, audio.length)[0];
  // powerset classes: NO_SPEAKER, SPEAKER_1..3, SPEAKERS_1_AND_2 … → list of speakers per stretch
  const names = seg.model.config.id2label || {};
  self.postMessage({ type: 'done', labels: names, segments: segments.map((s) => ({ id: s.id, label: names[s.id] || String(s.id), start: s.start, end: s.end, confidence: s.confidence })) });
}

self.onmessage = async (e) => {
  try {
    if (e.data.task === 'diarize') await diarize(e.data); else await transcribe(e.data);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
