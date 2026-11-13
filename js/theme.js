// Colour themes. The UI draws every element in a role ("ink"); a theme maps roles to colours.
//   phosphor: every role is white, post.js tints the whole picture (the original look)
//   guide:    flat multicolour vector graphics on black, after the 1981 BBC "Hitchhiker's Guide"
//             animations: blue titles, green labels with leader lines, yellow outlines,
//             red / pink / violet fills. post.js keeps the colours (no phosphor tint).
const WHITE = '255,255,255';

export const THEMES = {
  phosphor: { color: 0, ink: {} },
  guide: {
    color: 1,
    // smooth vector look: finer internal resolution (renderScale of 1920x1080), antialiased lines,
    // a vector font, no brightness steps and no pixel seams; a little bloom, short afterglow
    post: { smooth: 1, renderScale: .6667, scan: 0, glow: .5, persistence: .5 },
    // lean: fewer elements than the raster terminal (operator details only on the diagnostics page)
    lean: true,
    // monospaced, so the character plots and tables stay aligned
    font: '"SF Mono", ui-monospace, Menlo, "DejaVu Sans Mono", monospace',
    ink: {
      base: '255,226,60',    // yellow line work
      frame: '255,226,60',   // panel outlines, keys
      title: '70,165,255',   // headings (the "BABEL FISH" blue)
      text: '95,150,255',    // running text, protocol
      label: '105,255,105',  // labels, scales, annotations
      red: '255,55,45',
      pink: '255,95,190',
      violet: '180,125,255',
      blue: '60,140,255',
      cyan: '90,225,255',
      orange: '255,160,40',
    },
  },
};

export const THEME_NAMES = Object.keys(THEMES);

// sleep stage and band colours (only matter in a colour theme)
export const STAGE_INK = { WACH: 'base', N1: 'label', N2: 'cyan', N3: 'violet', REM: 'pink' };
export const BAND_INK = { delta: 'red', theta: 'pink', alpha: 'violet', sigma: 'blue', beta: 'cyan', gamma: 'label' };

export function inkOf(theme, role) {
  const t = THEMES[theme] || THEMES.phosphor;
  return t.ink[role] || t.ink.base || WHITE;
}
