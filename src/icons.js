// File-type icons: Nerd Font glyphs (terminal) + matching SVG assets.
// Terminals cannot render SVG images, so the explorer uses single-width
// Nerd Font glyphs tinted with each language's brand color. The real SVGs
// live in assets/icons/ (same names) for external use (web UI, docs).
// NOTE: glyphs need a Nerd Font — stock Windows console fonts (Consolas,
// Lucida Console) show boxes instead. On win32 the default style is `badge`
// (plain-ASCII `TS`/`JS`/`PY` tags that render in any font); see README
// "Icons on Windows" for getting the full logos via a Nerd Font.
// Style resolution: state.iconStyle ('nerd' | 'badge' | 'off'); legacy
// state.showIcons === false forces 'off'. Toggle with settings + config.
const path = require('node:path');
const { state } = require('./state');
const { hexFg, RESET } = require('./ansi');

// ext -> { glyph, color (hex), svg }. Glyphs are Nerd Font codepoints.
const ICONS = {
  ts: { glyph: '', color: '#3178C6', svg: 'ts.svg' },
  tsx: { glyph: '', color: '#3178C6', svg: 'tsx.svg' },
  mts: { glyph: '', color: '#3178C6', svg: 'ts.svg' },
  cts: { glyph: '', color: '#3178C6', svg: 'ts.svg' },
  js: { glyph: '', color: '#F7DF1E', svg: 'js.svg' },
  jsx: { glyph: '', color: '#F7DF1E', svg: 'jsx.svg' },
  mjs: { glyph: '', color: '#F7DF1E', svg: 'js.svg' },
  cjs: { glyph: '', color: '#F7DF1E', svg: 'js.svg' },
  json: { glyph: '', color: '#CBCB41', svg: 'json.svg' },
  jsonc: { glyph: '', color: '#CBCB41', svg: 'json.svg' },
  py: { glyph: '', color: '#3776AB', svg: 'python.svg' },
  pyw: { glyph: '', color: '#3776AB', svg: 'python.svg' },
  go: { glyph: '', color: '#00ADD8', svg: 'go.svg' },
  rs: { glyph: '', color: '#DEA584', svg: 'rust.svg' },
  c: { glyph: '', color: '#649AD2', svg: 'c.svg' },
  h: { glyph: '', color: '#649AD2', svg: 'c.svg' },
  cpp: { glyph: '', color: '#649AD2', svg: 'cpp.svg' },
  hpp: { glyph: '', color: '#649AD2', svg: 'cpp.svg' },
  cc: { glyph: '', color: '#649AD2', svg: 'cpp.svg' },
  cs: { glyph: '', color: '#178600', svg: 'csharp.svg' },
  java: { glyph: '', color: '#ED8B00', svg: 'java.svg' },
  kt: { glyph: '', color: '#7F52FF', svg: 'kotlin.svg' },
  swift: { glyph: '', color: '#F05138', svg: 'swift.svg' },
  php: { glyph: '', color: '#777BB4', svg: 'php.svg' },
  rb: { glyph: '', color: '#CC342D', svg: 'ruby.svg' },
  dart: { glyph: '', color: '#00B4AB', svg: 'dart.svg' },
  scala: { glyph: '', color: '#DC322F', svg: 'scala.svg' },
  pl: { glyph: '', color: '#A6A6A6', svg: 'perl.svg' },
  sh: { glyph: '', color: '#89E051', svg: 'shell.svg' },
  bash: { glyph: '', color: '#89E051', svg: 'shell.svg' },
  zsh: { glyph: '', color: '#89E051', svg: 'shell.svg' },
  fish: { glyph: '', color: '#89E051', svg: 'shell.svg' },
  mk: { glyph: '', color: '#6E6E6E', svg: 'make.svg' },
  sql: { glyph: '', color: '#E38C00', svg: 'sql.svg' },
  css: { glyph: '', color: '#1572B6', svg: 'css.svg' },
  scss: { glyph: '', color: '#CF649A', svg: 'css.svg' },
  less: { glyph: '', color: '#1572B6', svg: 'css.svg' },
  html: { glyph: '', color: '#E34F26', svg: 'html.svg' },
  xml: { glyph: '', color: '#E34F26', svg: 'html.svg' },
  vue: { glyph: '﵂', color: '#41B883', svg: 'vue.svg' },
  svelte: { glyph: '', color: '#FF3E00', svg: 'svelte.svg' },
  md: { glyph: '', color: '#519ABA', svg: 'markdown.svg' },
  markdown: { glyph: '', color: '#519ABA', svg: 'markdown.svg' },
  yaml: { glyph: '', color: '#CB171E', svg: 'yaml.svg' },
  yml: { glyph: '', color: '#CB171E', svg: 'yaml.svg' },
  toml: { glyph: '', color: '#6E6E6E', svg: 'toml.svg' },
  ini: { glyph: '', color: '#6E6E6E', svg: 'toml.svg' },
  cfg: { glyph: '', color: '#6E6E6E', svg: 'toml.svg' },
  conf: { glyph: '', color: '#6E6E6E', svg: 'toml.svg' },
  txt: { glyph: '', color: null, svg: 'text.svg' },
  pdf: { glyph: '', color: '#EC1C24', svg: 'pdf.svg' },
  png: { glyph: '', color: '#A074C4', svg: 'image.svg' },
  jpg: { glyph: '', color: '#A074C4', svg: 'image.svg' },
  jpeg: { glyph: '', color: '#A074C4', svg: 'image.svg' },
  gif: { glyph: '', color: '#A074C4', svg: 'image.svg' },
  webp: { glyph: '', color: '#A074C4', svg: 'image.svg' },
  ico: { glyph: '', color: '#A074C4', svg: 'image.svg' },
  bmp: { glyph: '', color: '#A074C4', svg: 'image.svg' },
  svg: { glyph: '', color: '#A074C4', svg: 'image.svg' },
  zip: { glyph: '', color: '#AFB42B', svg: 'archive.svg' },
  tar: { glyph: '', color: '#AFB42B', svg: 'archive.svg' },
  gz: { glyph: '', color: '#AFB42B', svg: 'archive.svg' },
  bz2: { glyph: '', color: '#AFB42B', svg: 'archive.svg' },
  xz: { glyph: '', color: '#AFB42B', svg: 'archive.svg' },
  '7z': { glyph: '', color: '#AFB42B', svg: 'archive.svg' },
  rar: { glyph: '', color: '#AFB42B', svg: 'archive.svg' },
};

// exact filenames (lowercase) -> ext key in ICONS
const SPECIAL_FILES = {
  'dockerfile': 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  'makefile': 'mk',
  'justfile': 'mk',
  'cmakelists.txt': 'mk',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
};

const EXTRA_ICONS = {
  docker: { glyph: '', color: '#2496ED', svg: 'docker.svg' },
  git: { glyph: '', color: '#F05032', svg: 'git.svg' },
};

const DIR_ICON = { glyph: '', color: null, svg: 'folder.svg' };
const LINK_ICON = { glyph: '', color: null, svg: 'symlink.svg' };
const EXEC_ICON = { glyph: '', color: '#89E051', svg: 'terminal.svg' };
const DEFAULT_FILE = { glyph: '', color: null, svg: 'file.svg' };

// every glyph is single-width → prefix "glyph + space" costs 2 columns
const ICON_PREFIX_W = 2;

// filename (or full path) + entry flags -> icon descriptor
function fileIcon(name, opts) {
  const o = opts || {};
  if (o.isLink) return LINK_ICON;
  if (o.isDir) return DIR_ICON;
  const base = path.basename(String(name || '')).toLowerCase();
  if (!base) return DEFAULT_FILE;
  if (SPECIAL_FILES[base]) return ICONS[SPECIAL_FILES[base]] || EXTRA_ICONS[SPECIAL_FILES[base]] || DEFAULT_FILE;
  const ext = path.extname(base).toLowerCase().slice(1);
  if (ext && ICONS[ext]) return ICONS[ext];
  if (o.isExec) return EXEC_ICON;
  return DEFAULT_FILE;
}

// icon descriptor for an explorer entry { name, full, isDir, isLink, isExec }
function iconFor(entry) {
  if (!entry) return DEFAULT_FILE;
  return fileIcon(entry.full || entry.name, entry);
}

// colored "glyph" (no trailing space) for terminal output; dirs/links fall
// back to the theme color when the icon has no brand color (color: null)
function iconAnsi(entry, themeColor) {
  const ic = iconFor(entry);
  if (ic.color) return `${hexFg(ic.color)}${ic.glyph}${RESET}`;
  return `${themeColor || ''}${ic.glyph}${RESET}`;
}

// repo-relative path of the SVG for an entry (for external tooling/docs)
function svgFor(entry) {
  const ic = iconFor(entry);
  return `assets/icons/${ic.svg || 'file.svg'}`;
}

// --- badge style: pure-ASCII fallback for fonts without Nerd glyphs ------
// Fixed-width 4-char uppercase tag in the brand color: `TS  `, `JSON`,
// `DIR `, `LINK`. Renders in Consolas / Lucida Console / any console font.
const BADGE_W = 4;
const BADGE_PREFIX_W = BADGE_W + 1; // tag + space
const BADGE_OVERRIDES = { markdown: 'MD', jpeg: 'JPG' };
const BADGE_SPECIALS = {
  docker: { text: 'DOCK', color: '#2496ED' },
  git: { text: 'GIT ', color: '#F05032' },
  mk: { text: 'MAKE', color: '#6E6E6E' },
};

function badgeFor(entry) {
  const e = entry || {};
  if (e.isLink) return { text: 'LINK', color: null };
  if (e.isDir) return { text: 'DIR ', color: null };
  const base = path.basename(String(e.full || e.name || '')).toLowerCase();
  if (SPECIAL_FILES[base]) {
    const key = SPECIAL_FILES[base];
    if (BADGE_SPECIALS[key]) return BADGE_SPECIALS[key];
    if (ICONS[key]) return { text: key.toUpperCase().slice(0, BADGE_W).padEnd(BADGE_W, ' '), color: ICONS[key].color };
  }
  const ext = path.extname(base).toLowerCase().slice(1);
  if (ext) {
    const tag = (BADGE_OVERRIDES[ext] || ext).toUpperCase().slice(0, BADGE_W).padEnd(BADGE_W, ' ');
    return { text: tag, color: ICONS[ext] ? ICONS[ext].color : null };
  }
  if (e.isExec) return { text: 'EXE ', color: '#89E051' };
  // extensionless files (LICENSE, README, .env): tag from the name itself
  const stem = base.replace(/^\.+/, '').slice(0, BADGE_W).toUpperCase().padEnd(BADGE_W, ' ');
  return { text: stem, color: null };
}

// colored badge tag (no trailing space); null-color tags use themeColor
function badgeAnsi(entry, themeColor) {
  const b = badgeFor(entry);
  if (b.color) return `${hexFg(b.color)}${b.text}${RESET}`;
  return `${themeColor || ''}${b.text}${RESET}`;
}

// --- style resolution -----------------------------------------------------
const ICON_STYLES = ['nerd', 'badge', 'off'];
function defaultStyle() {
  return process.platform === 'win32' ? 'badge' : 'nerd';
}
function currentStyle() {
  if (state.showIcons === false) return 'off'; // legacy boolean toggle
  const s = state.iconStyle;
  if (s === 'nerd' || s === 'badge' || s === 'off') return s;
  return defaultStyle();
}
function prefixWidth() {
  const s = currentStyle();
  return s === 'badge' ? BADGE_PREFIX_W : s === 'nerd' ? ICON_PREFIX_W : 0;
}

// full row prefix (glyph/tag + trailing space) for the explorer list.
// sel: null for normal rows, or { bg, fg } selection colors — the bg is
// re-applied after the brand fg so the highlight spans the whole row
// (a RESET mid-row would kill it).
function rowPrefix(entry, themeColor, sel) {
  const s = currentStyle();
  if (s === 'off') return '';
  if (s === 'badge') {
    const b = badgeFor(entry);
    if (sel) {
      const fg = b.color ? hexFg(b.color) : sel.fg;
      return `${sel.bg}${fg}${b.text}${sel.bg}${sel.fg} `;
    }
    return `${badgeAnsi(entry, themeColor)} `;
  }
  const ic = iconFor(entry);
  if (sel) {
    const fg = ic.color ? hexFg(ic.color) : sel.fg;
    return `${sel.bg}${fg}${ic.glyph}${sel.bg}${sel.fg} `;
  }
  return `${iconAnsi(entry, themeColor)} `;
}

// plain (uncolored) prefix for measuring tab cells — inherits nothing
function tabPrefix(file, name) {
  const s = currentStyle();
  if (s === 'badge') return `${badgeFor({ full: file || '', name }).text} `;
  if (s === 'nerd') {
    try { return `${iconFor({ full: file || '', name }).glyph} `; } catch { return ''; }
  }
  return '';
}

// colored icon chunk for a tab cell (glyph/tag + trailing space). Mirrors
// rowPrefix: on the active tab the selection bg is re-applied around the
// brand fg (a RESET mid-cell would kill it); off that, a RESET is safe.
function tabIcon(file, name, T, active) {
  const s = currentStyle();
  if (s === 'off') return '';
  const entry = { full: file || '', name };
  let glyph, color;
  if (s === 'badge') {
    const b = badgeFor(entry);
    glyph = b.text;
    color = b.color;
  } else {
    let ic;
    try { ic = iconFor(entry); } catch { return ''; }
    glyph = ic.glyph;
    color = ic.color;
  }
  if (active) {
    const fg = color ? hexFg(color) : T.selFg;
    return `${T.selBg}${fg}${glyph}${T.selBg}${T.selFg} `;
  }
  if (!color) return `${glyph} `;
  return `${hexFg(color)}${glyph}${RESET}${T.status || ''} `;
}

module.exports = {
  ICONS, SPECIAL_FILES, EXTRA_ICONS,
  DIR_ICON, LINK_ICON, EXEC_ICON, DEFAULT_FILE,
  ICON_PREFIX_W, BADGE_W, BADGE_PREFIX_W, ICON_STYLES,
  fileIcon, iconFor, iconAnsi, svgFor,
  badgeFor, badgeAnsi, currentStyle, defaultStyle, prefixWidth, rowPrefix, tabPrefix, tabIcon,
};
