// Wellensalat: English by default, German as an option.
// The page carries its English text; elements with data-de / data-de-title / data-de-placeholder
// hold the German one. Strings made by the scripts (messages, labels in the video) come from D.
let LANG = 'en';
export const getLang = () => LANG;
// decimal separator of the language
export const dec = (v) => (LANG === 'de' ? String(v).replace('.', ',') : String(v));

const D = {
  // views and formats
  'view.scope': ['SCOPE', 'OSZI'],
  'view.xy': ['X-Y', 'X-Y'],
  'view.spectrum': ['SPECTRUM', 'SPEKTRUM'],
  'view.waterfall': ['WATERFALL', 'WASSERFALL'],
  'view.envelope': ['ENVELOPE', 'HÜLLKURVE'],
  'fmt.9:16': ['Reels · Shorts · Stories · TikTok', 'Reels · Shorts · Stories · TikTok'],
  'fmt.4:5': ['Instagram feed', 'Instagram-Feed'],
  'fmt.1:1': ['Square', 'Quadrat'],
  'fmt.16:9': ['YouTube · landscape', 'YouTube · Querformat'],
  'look.phosphor': ['PHOSPHOR', 'PHOSPHOR'],
  'look.guide': ['HITCHHIKER', 'HITCHHIKER'],
  // readouts drawn into the video
  'rd.nosignal': ['NO SIGNAL', 'KEIN SIGNAL'],
  'rd.waterfall': ['WATERFALL  20 L/S', 'WASSERFALL  20 Z/S'],
  'rd.envelope': ['ENVELOPE  ±3 S', 'HÜLLKURVE  ±3 S'],
  'rd.spin': ['SPIN', 'DREH'],
  // transport and timeline
  'play': ['▶ Play', '▶ Abspielen'],
  'stop': ['■ Stop', '■ Stopp'],
  'demo': ['DEMO SIGNAL (12 S) · NO FILE LOADED YET', 'DEMO-SIGNAL (12 S) · NOCH KEINE DATEI GELADEN'],
  'nofile': ['NO FILE RECEIVED', 'KEINE DATEI ERHALTEN'],
  'reading': ['READING {name} …', 'LESE {name} …'],
  'unreadable': ['{name} COULD NOT BE READ: {err}. This browser may not decode the format; WAV and MP3 work everywhere.', '{name} NICHT LESBAR: {err}. Dieser Browser kann das Format evtl. nicht dekodieren, WAV oder MP3 gehen überall.'],
  'len.90': ['· LONGER THAN 90 S: TRIM FOR REELS', '· LÄNGER ALS 90 S: FÜR REELS KÜRZEN'],
  'len.60': ['· OVER 60 S', '· ÜBER 60 S'],
  'seg.xfade': [' · cross-fades {s} s', ' · überblendet {s} s'],
  'spin.still': ['STILL', 'STEHT'],
  'off': ['OFF', 'AUS'],
  'voices.ab': ['A left · B right', 'A links · B rechts'],
  'voices.ba': ['B left · A right', 'B links · A rechts'],
  // background
  'bg.none': ['NO PICTURE · DRAG & DROP WORKS TOO', 'KEIN BILD · AUCH PER DRAG & DROP'],
  'bg.bad': ['PICTURE COULD NOT BE READ', 'BILD NICHT LESBAR'],
  // subtitles
  'cue.cut': ['Lies outside the ranges', 'Liegt außerhalb der Bereiche'],
  'cue.go': ['Jump here and play', 'Hierhin springen und abspielen'],
  'cue.start': ['Start (s in the finished clip)', 'Start (s im fertigen Clip)'],
  'cue.end': ['End (s in the finished clip)', 'Ende (s im fertigen Clip)'],
  'cue.voice': ['Voice A (left) / B (right)', 'Stimme A (links) / B (rechts) umschalten'],
  'cue.up': ['Merge with the line above (merge up)', 'Mit der Zeile darüber zusammenführen (merge up)'],
  'cue.down': ['Merge with the line below (merge down)', 'Mit der Zeile darunter zusammenführen (merge down)'],
  'cue.del': ['Delete', 'Löschen'],
  'cue.none': ['NO SUBTITLES YET', 'NOCH KEINE UNTERTITEL'],
  'cue.clear': ['Delete all subtitles?', 'Alle Untertitel löschen?'],
  'asr.prep': ['PREPARING AUDIO …', 'BEREITE AUDIO VOR …'],
  'asr.load': ['LOADING MODEL …', 'LADE MODELL …'],
  'asr.loadmb': ['LOADING MODEL … {l} / {t} MB', 'LADE MODELL … {l} / {t} MB'],
  'asr.loadvoice': ['LOADING VOICE MODEL …', 'LADE STIMMEN-MODELL …'],
  'asr.run': ['RECOGNISING SPEECH …', 'ERKENNE SPRACHE …'],
  'asr.diar': ['SEPARATING VOICES …', 'TRENNE STIMMEN …'],
  'asr.done': ['{n} LINES RECOGNISED{v} IN {s} S · PLEASE CHECK THEM', '{n} ZEILEN ERKANNT{v} IN {s} S · BITTE DURCHSEHEN'],
  'asr.voices': [' · {n} VOICE(S)', ' · {n} STIMME(N)'],
  'asr.fail': ['RECOGNITION FAILED: {err}', 'ERKENNUNG FEHLGESCHLAGEN: {err}'],
  'diar.done': ['{n} VOICE(S) FOUND, ASSIGNED AS A/B IN {s} S · PLEASE CHECK', '{n} STIMME(N) GEFUNDEN, ALS A/B ZUGEORDNET IN {s} S · BITTE DURCHSEHEN'],
  'diar.fail': ['VOICE SEPARATION FAILED: {err}', 'STIMMEN-TRENNUNG FEHLGESCHLAGEN: {err}'],
  // export
  'ex.fast': ['MP4 · H.264 + AAC · FASTER THAN REAL TIME', 'MP4 · H.264 + AAC · SCHNELLER ALS ECHTZEIT'],
  'ex.rt': ['REAL-TIME RECORDING ({fmt}) · KEEP THE TAB IN FRONT', 'ECHTZEIT-AUFNAHME ({fmt}) · TAB IM VORDERGRUND LASSEN'],
  'ex.none': ['NO VIDEO EXPORT IN THIS BROWSER', 'KEIN VIDEO-EXPORT IN DIESEM BROWSER'],
  'ex.render': ['RENDERING FRAME BY FRAME …', 'RENDERE BILD FÜR BILD …'],
  'ex.record': ['RECORDING IN REAL TIME … KEEP THE TAB IN FRONT', 'NEHME IN ECHTZEIT AUF … TAB IM VORDERGRUND LASSEN'],
  'ex.done': ['DONE · {mb} MB · ', 'FERTIG · {mb} MB · '],
  'ex.aborted': ['CANCELLED', 'ABGEBROCHEN'],
  'ex.error': ['ERROR: {err}', 'FEHLER: {err}'],
  'ex.norec': ['This browser cannot record video.', 'Dieser Browser kann kein Video aufnehmen.'],
  // project
  'pj.saving': ['SAVING PROJECT …', 'SPEICHERE PROJEKT …'],
  'pj.saved': ['SAVED WITH AUDIO AND PICTURE', 'GESPEICHERT MIT AUDIO UND BILD'],
  'pj.savedLean': ['SAVED WITHOUT AUDIO AND PICTURE (LOAD THEM AGAIN WHEN OPENING)', 'GESPEICHERT OHNE AUDIO UND BILD (BEIM ÖFFNEN NEU LADEN)'],
  'pj.saveFail': ['SAVING FAILED: {err}', 'SPEICHERN FEHLGESCHLAGEN: {err}'],
  'pj.opened': ['PROJECT OPENED: {name}', 'PROJEKT GEÖFFNET: {name}'],
  'pj.needAudio': [' · PLEASE LOAD THE AUDIO FILE “{name}”', ' · BITTE AUDIODATEI „{name}“ LADEN'],
  'pj.needPic': [' · CHOOSE THE PICTURE “{name}” AGAIN', ' · BILD „{name}“ NEU WÄHLEN'],
  'pj.complete': ['PROJECT FULLY LOADED', 'PROJEKT VOLLSTÄNDIG GELADEN'],
  'pj.bad': ['PROJECT COULD NOT BE READ: {err}', 'PROJEKT NICHT LESBAR: {err}'],
  'pj.notOurs': ['not a Wellensalat project file', 'keine Wellensalat-Projektdatei'],
};

export function t(key, v = {}) {
  const e = D[key];
  const s = e ? e[LANG === 'de' ? 1 : 0] : key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
}

// swap the page's own texts (only on leaf elements, so no control loses its listeners)
export function applyPage(root = document) {
  root.querySelectorAll('[data-de]').forEach((el) => {
    if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
    el.innerHTML = LANG === 'de' ? el.dataset.de : el.dataset.en;
  });
  for (const [attr, key] of [['title', 'Title'], ['placeholder', 'Placeholder']]) {
    root.querySelectorAll(`[data-de-${attr}]`).forEach((el) => {
      if (el.dataset[`en${key}`] === undefined) el.dataset[`en${key}`] = el.getAttribute(attr) || '';
      el.setAttribute(attr, LANG === 'de' ? el.dataset[`de${key}`] : el.dataset[`en${key}`]);
    });
  }
}

export function setLang(l) {
  LANG = l === 'de' ? 'de' : 'en';
  document.documentElement.lang = LANG;
  applyPage();
}
