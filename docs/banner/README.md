# Banners

Drawn by Wellensalat itself, in its two looks. `phosphor.js` uses the app's own modules from
`../../js/`:

- the **phosphor** layer: the Augmentor's 5×7 pixel font, a grid running through the whole
  picture (cleared behind the lettering, like on a terminal) and a stereo X-Y figure (a 2:3
  Lissajous, slowly turning), through `post.js` with the REM afterglow and glow;
- the **Hitchhiker** layer: a waterfall landscape in the multicolour vector look, added with
  *screen* and fading out towards the text – the range from one look to the other.

Files:

- `../header.jpg` (2560×640) – `header.html`, the header at the top of the README.
- `../social-preview.png` (1280×640) – `social.html`, the GitHub social preview. Upload it under
  **Settings → General → Social preview**.
- the 1600×800 card on the profile page – `card.html`.
- `../screenshot.jpg` is the editor at 1440×900, rendered at 2×.

To regenerate them, serve the repository root and screenshot the pages with headless Chrome
(it needs WebGL, hence SwiftShader):

```sh
python3 -m http.server 8000 &
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FLAGS="--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --virtual-time-budget=10000"
"$CH" $FLAGS --window-size=2560,640 --screenshot=header.png  http://localhost:8000/docs/banner/header.html
"$CH" $FLAGS --window-size=1281,642 --screenshot=social.png  http://localhost:8000/docs/banner/social.html   # crop to 1280×640
"$CH" $FLAGS --window-size=1600,800 --screenshot=card.png    http://localhost:8000/docs/banner/card.html
"$CH" $FLAGS --window-size=1440,900 --force-device-scale-factor=2 --screenshot=screenshot.png "http://localhost:8000/#at=5.2"
# then save header.png and screenshot.png as JPG (quality ~90) to ../header.jpg and ../screenshot.jpg,
# social.png cropped to 1280×640 as ../social-preview.png
```

No web fonts: all lettering is the app's own pixel font.
