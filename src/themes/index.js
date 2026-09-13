// Theme registry: add a theme by dropping a file in this folder and
// registering it below. Every theme must define all keys: dir, file, link,
// exec, selBg, selFg, path, counter, status, divider + syntax: comment, str,
// num, kw, fn, type, bool, prop, pun.
const { state } = require('../state');

const THEMES = {
  sabi: require('./sabi'),
  dracula: require('./dracula'),
  nord: require('./nord'),
  gruvbox: require('./gruvbox'),
  monokai: require('./monokai'),
  'tokyo-night': require('./tokyo-night'),
  catppuccin: require('./catppuccin'),
  'solarized-dark': require('./solarized-dark'),
  'solarized-light': require('./solarized-light'),
  light: require('./light'),
  mono: require('./mono'),
  ocean: require('./ocean'),
  'cursor-dark': require('./cursor-dark'),
  'cursor-light': require('./cursor-light'),
  'github-dark': require('./github-dark'),
  'github-light': require('./github-light'),
  'claude-dark': require('./claude-dark'),
  'claude-light': require('./claude-light'),
  'codex-dark': require('./codex-dark'),
  'codex-light': require('./codex-light'),
};
const THEME_NAMES = Object.keys(THEMES);
function currentTheme() {
  return THEMES[state.theme] || THEMES.sabi;
}

// legacy aliases (kept for compat)
const TEAL = THEMES.sabi.dir;
const SEL_BG = THEMES.sabi.selBg + THEMES.sabi.selFg;

module.exports = { THEMES, THEME_NAMES, currentTheme, TEAL, SEL_BG };
