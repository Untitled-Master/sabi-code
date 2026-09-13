// highlight() entry point: filename → language → per-language renderer.
// Pass a shared `st` object across consecutive lines for block comments,
// triple-strings, fences and html comments.
const { state } = require('../state');
const { currentTheme } = require('../themes');
const { langOf } = require('./lang');
const { highlightCode } = require('./code');
const { highlightCss } = require('./css');
const { highlightHtml } = require('./html');
const { highlightMd } = require('./markdown');

function highlight(line, file, st) {
  if (!state.hl) return line;
  const th = currentTheme();
  const lang = langOf(file);
  if (!lang) return line;
  st = st || {};
  if (lang === 'md') return highlightMd(line, th, st);
  if (lang === 'html') return highlightHtml(line, th, st);
  if (lang === 'css') return highlightCss(line, th, st);
  return highlightCode(line, lang, th, st);
}

module.exports = { highlight };
