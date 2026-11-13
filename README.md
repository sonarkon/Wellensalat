# Audio → Wellenform

Webapp: Audiodatei laden, schneiden, Fades setzen, als animierte Wellenform-Grafik
(Oszilloskop, X-Y, Spektrum, Wasserfall, Hüllkurve) im Phosphor- oder Guide-Look
als MP4 exportieren. Formate 9:16, 4:5, 1:1, 16:9. Hintergrundbild, Text,
Untertitel (SRT oder automatisch per Whisper im Browser).

Alles läuft im Browser, nichts wird hochgeladen. Für Export und Spracherkennung werden
mp4-muxer und transformers.js beim ersten Gebrauch vom CDN (jsdelivr) geladen,
das Whisper-Modell von Hugging Face.

Diese Dateien werden gebaut, nicht hier bearbeitet: Quelle ist `augmentor/web`
(`tools/build_wellenform.py`).
