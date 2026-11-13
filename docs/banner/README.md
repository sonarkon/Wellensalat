# Banners

Dark, like the app, with the amber phosphor accent (`#f39a2c`) – in the style of the other
sonarkon banners (spaced kicker, large name, one line below). The pictures on the right are
**real Wellensalat frames**: `frames.js` loads the app's own modules from `../../js/` and renders
the built-in demo signal, so the banners always match the current look.

- `../social-preview.png` (1280×640) is the GitHub social preview image. Upload it under
  **Settings → General → Social preview**.
- `../header.jpg` (1280×320, rendered at 2× = 2560×640) is the header at the top of the README.
- `../screenshot.jpg` is the editor at 1440×900, rendered at 2×.

To regenerate them, serve the repository root and screenshot the pages with headless Chrome
(it needs WebGL, hence SwiftShader):

```sh
python3 -m http.server 8000 &
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FLAGS="--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --virtual-time-budget=10000"
"$CH" $FLAGS --window-size=1280,320 --force-device-scale-factor=2 --screenshot=header.png http://localhost:8000/docs/banner/header.html
"$CH" $FLAGS --window-size=1280,640 --force-device-scale-factor=1 --screenshot=../social-preview.png http://localhost:8000/docs/banner/social.html
"$CH" $FLAGS --window-size=1440,900 --force-device-scale-factor=2 --screenshot=screenshot.png "http://localhost:8000/#at=5.2"
# then save header.png and screenshot.png as JPG (quality ~90) to ../header.jpg and ../screenshot.jpg
```

Fonts: Inter, loaded from `@fontsource/inter@5.1.0` on jsDelivr.
