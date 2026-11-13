// WebGL post-processing: phosphor persistence, glow, orange tint, scanlines
// and the image-level glitches (row tearing, block shifts, RGB split, inversion).
const VS = `
attribute vec2 p;
varying vec2 uv;
void main() { uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

// pass 1: phosphor persistence. accum = max(ui, prev * decay), per colour channel
const FS_ACCUM = `
precision mediump float;
varying vec2 uv;
uniform sampler2D ui, prev;
uniform float decay, smooth;
void main() {
  // posterize the brightness into few hard levels (like an old raster display), keep the hue
  vec3 c = texture2D(ui, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float q = l < .13 ? 0. : l < .4 ? .28 : l < .7 ? .62 : 1.;
  vec3 now = l > 0. ? c * (q / l) : vec3(0.);
  now = mix(now, c, smooth);   // vector theme: no brightness steps
  vec3 old = texture2D(prev, uv).rgb * decay;
  gl_FragColor = vec4(max(now, old), 1.);
}`;

// pass 2: displacement glitches, glow, tint, CRT texture
const FS_FINAL = `
precision mediump float;
varying vec2 uv;
uniform sampler2D accum;
uniform vec2 res;
uniform float time, glitch, seed, glowAmt, scan;
uniform vec2 src; // resolution of the low-res UI
uniform float bright, colorMode, red, smooth, chaos;
uniform vec3 phosphor, hot;

float hash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233)) + seed) * 43758.5453); }

vec3 lum(vec2 q) { return texture2D(accum, q).rgb; }
// sample the centre of the low-res pixel: crisp pixel edges although the texture filters linearly
vec3 px3(vec2 q) { return smooth > .5 ? texture2D(accum, q).rgb : texture2D(accum, (floor(q * src) + .5) / src).rgb; }
float mx3(vec3 c) { return max(c.r, max(c.g, c.b)); }

void main() {
  vec2 q = uv;
  float tick = floor(time * 14.);

  // row tearing: horizontal bands shift sideways
  float band = floor(q.y * 36.);
  float tear = step(1. - glitch * .45, hash(vec2(band, tick)));
  q.x += tear * (hash(vec2(band, tick + 3.)) - .5) * .18 * glitch;

  // block displacement
  vec2 blk = floor(q * vec2(12., 18.));
  float bsel = step(1. - glitch * glitch * .25, hash(blk + tick));
  q += bsel * (vec2(hash(blk + 7.), hash(blk + 13.)) - .5) * .08;

  // slow vertical roll at heavy glitch
  q.y = fract(q.y + step(.85, glitch) * sin(time * 3.) * .02);

  // RGB split (in phosphor space: hot channel offset)
  float split = glitch * glitch * .012;
  vec3 c3 = px3(q), cr = px3(q + vec2(split, 0.)), cb = px3(q - vec2(split, 0.));
  float lc = mx3(c3), lr = mx3(cr), lb = mx3(cb);

  // glow: rings of taps 1 and 3 low-res pixels out (TAPS = 8, or 4 in low quality)
  vec2 px = 1. / src;
  vec3 g3 = vec3(0.);
  for (int i = 0; i < TAPS; i++) {
    float a = float(i) * 6.2832 / float(TAPS);
    vec2 d = vec2(cos(a), sin(a));
    g3 += lum(q + d * px) * .6 + lum(q + d * px * 3.) * .4;
  }
  g3 /= float(TAPS);
  float g = mx3(g3);

  // phosphor: one brightness, tinted; colour: the UI's own colours with a hot white core
  vec3 mono = phosphor * lc + hot * pow(lc, 4.) * .8 + phosphor * g * glowAmt * .9;
  mono.r += (lr - lc) * .9;
  mono.b += (lb - lc) * .6;
  vec3 colr = c3 + vec3(pow(lc, 6.) * .22) + g3 * glowAmt * .9;
  colr.r = max(colr.r, cr.r); colr.b = max(colr.b, cb.b);   // RGB split: channels slip apart
  float yl = dot(colr, vec3(.3, .55, .15));
  colr = mix(colr, vec3(yl * 1.1, yl * .16, yl * .05), red);  // redshift: everything turns deep red
  // Haber chaos: realities fall into each other. In bands and blocks the old phosphor picture
  // (orange, coarse raster, few grey levels) breaks through, shifted, on top of the colour one.
  float rb = floor(uv.y * 14.) + floor(time * 1.3) * 7.;
  vec2 bk = floor(uv * vec2(6., 5.)) + floor(time * .9) * 3.;
  float other = max(step(1. - chaos * .5, hash(vec2(rb, 3.))), step(1. - chaos * chaos * .4, hash(bk + 11.))) * step(.05, chaos);
  vec2 off = (vec2(hash(vec2(rb, 5.)), hash(vec2(rb, 9.))) - .5) * .06 * chaos, g2 = src * .5, qo = q + off;
  float lo = mx3(texture2D(accum, (floor(qo * g2) + .5) / g2).rgb);
  lo = lo < .13 ? 0. : lo < .4 ? .28 : lo < .7 ? .62 : 1.;
  vec2 so = abs(fract(qo * g2) - .5) * 2.;
  vec3 old = (phosphor * lo + hot * pow(lo, 4.) * .8) * (1. - .55 * pow(so.y, 3.)) * (1. - .3 * pow(so.x, 3.));
  colr = mix(colr, max(colr * .55, old), other);
  vec3 col = mix(mono, colr, colorMode);

  // inverted band at strong glitch
  float inv = step(1. - glitch * .12, hash(vec2(floor(uv.y * 9.), tick + 5.)));
  col = mix(col, mix(phosphor * (1. - lc) * .8, (vec3(1.) - c3) * .8, colorMode), inv);

  // pixel grid: dark seams between the low-res pixels, stronger between rows (scanlines)
  vec2 sp = abs(fract(q * src) - .5) * 2.;
  col *= (1. - scan * pow(sp.y, 3.)) * (1. - scan * .45 * pow(sp.x, 3.));
  vec2 vc = uv - .5;
  col *= 1. - dot(vc, vc) * .55;
  col += (hash(uv * res + tick) - .5) * (.035 + glitch * .12) * mix(phosphor, vec3(.6), colorMode);
  col *= .97 + .03 * sin(time * 120.);
  col *= bright;

  gl_FragColor = vec4(col, 1.);
}`;

export class Post {
  constructor(canvas, source, cfg) {
    const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL nicht verfügbar');
    this.gl = gl; this.source = source; this.cfg = cfg;
    this.w = canvas.width; this.h = canvas.height;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.pAccum = this.program(FS_ACCUM);
    this.setQuality(cfg.display.quality);
    // persistence and glow resolution: "grid" = the low-res UI size (9x fewer pixels than 1080p), "720p", "1080p"
    this.setShaderRes(cfg.display.shaderRes || 'grid', true);
    this.uiTex = this.texture();
    // hard pixels when the low-res UI is scaled up
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.fbos = [this.fbo(this.sw, this.sh), this.fbo(this.sw, this.sh)];
    this.ping = 0;
  }

  // glow taps: 8 (high) or 4 (low); recompiles the final pass
  setQuality(q) {
    this.pFinal = this.program(FS_FINAL.replace('precision mediump float;', `precision mediump float;\n#define TAPS ${q === 'low' ? 4 : 8}`));
  }

  // size of the final picture (display.output); the canvas is scaled to the screen by CSS anyway
  resizeOutput(w, h) { this.w = w; this.h = h; }

  setShaderRes(mode, init = false) {
    const sizes = { grid: [this.source.width, this.source.height], '720p': [1280, 720], '1080p': [1920, 1080] };
    this.shaderRes = sizes[mode] ? mode : 'grid';
    [this.sw, this.sh] = sizes[this.shaderRes];
    if (!init) { this.fbos = [this.fbo(this.sw, this.sh), this.fbo(this.sw, this.sh)]; this.ping = 0; }
    return this.shaderRes;
  }

  program(fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u, a: gl.getAttribLocation(p, 'p') };
  }

  texture(w = this.w, h = this.h) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  fbo(w, h) {
    const gl = this.gl, tex = this.texture(w, h), fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  run(prog) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.enableVertexAttribArray(prog.a);
    gl.vertexAttribPointer(prog.a, 2, gl.FLOAT, false, 0, 0);
  }

  // look: { phosphor, hot, persistence, glow } — blended per sleep stage in main.js
  // dt: seconds since the last rendered frame, so the afterglow decays the same at any frame rate
  render(time, glitch, look, dt = 1 / 60) {
    const gl = this.gl, d = this.cfg.display;

    gl.bindTexture(gl.TEXTURE_2D, this.uiTex);
    const sm = !!look.smooth;
    if (sm !== this.smoothTex) {
      this.smoothTex = sm;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, sm ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sm ? gl.LINEAR : gl.NEAREST);
    }
    if (this.shaderRes === 'grid' && (this.sw !== this.source.width || this.sh !== this.source.height)) this.setShaderRes('grid');
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);

    const src = this.fbos[this.ping], dst = this.fbos[1 - this.ping];
    gl.viewport(0, 0, this.sw, this.sh);
    this.run(this.pAccum);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.uiTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(this.pAccum.u.ui, 0);
    gl.uniform1i(this.pAccum.u.prev, 1);
    gl.uniform1f(this.pAccum.u.smooth, look.smooth ?? 0);
    gl.uniform1f(this.pAccum.u.decay, Math.pow(look.persistence * (1 - glitch * .3), Math.min(4, dt * 60)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.ping = 1 - this.ping;

    const f = this.pFinal;
    this.run(f);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(f.u.accum, 0);
    gl.uniform2f(f.u.res, this.w, this.h);
    gl.uniform2f(f.u.src, this.source.width, this.source.height);
    gl.uniform1f(f.u.time, time);
    gl.uniform1f(f.u.glitch, glitch);
    gl.uniform1f(f.u.seed, Math.floor(time * 3) % 97);
    gl.uniform1f(f.u.glowAmt, look.glow * d.glow);
    gl.uniform1f(f.u.scan, look.scan ?? d.scanlines);
    gl.uniform3fv(f.u.phosphor, look.phosphor);
    gl.uniform3fv(f.u.hot, look.hot);
    gl.uniform1f(f.u.bright, look.bright ?? 1);
    gl.uniform1f(f.u.colorMode, look.color ?? 0);
    gl.uniform1f(f.u.red, look.red ?? 0);
    gl.uniform1f(f.u.smooth, look.smooth ?? 0);
    gl.uniform1f(f.u.chaos, look.chaos ?? 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
