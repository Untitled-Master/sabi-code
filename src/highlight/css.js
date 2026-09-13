// CSS highlighting: selectors, at-rules, properties, values with units.
const { RESET } = require('../ansi');
const { scanLine } = require('./scan');

const cssReCache = {};
function cssRegex() {
  if (cssReCache.re) return cssReCache.re;
  const units = 'px|em|rem|ex|ch|vw|vh|vmin|vmax|cm|mm|in|pt|pc|deg|ms|s|fr|%';
  const re = new RegExp(
    `(^\\s*[^@{}\\n;][^{}\\n]*?)(?=\\s*\\{)` +   // selector prelude
    `|(@[\\w-]+|!\\s*important)` +               // at-rules
    `|(:{1,2}[\\w-]+)` +                         // pseudo-classes
    `|([\\w-]+)(?=\\s*:)` +                      // properties
    `|(\\b\\d[\\d.]*(?:${units})?|\\B\\.\\d+(?:${units})?)(?![\\w%])` +
    `|([\\w-]+)(?=\\s*\\()` +                    // functions
    `|(\\$[\\w-]+)` +                            // scss variables
    `|([{}();:,.#>+~*\\[\\]=])`,                 // punctuation
    'g'
  );
  cssReCache.re = re;
  return re;
}

function subCssSel(sel, th) {
  return sel.replace(/(\[[^\]\n]*\])|(::?[\w-]+)|([.#][\w-]+)|([A-Za-z_*][\w$-]*)|([>+~,])/g,
    (m, attr, pseudo, cls, tag, comb) => {
      if (attr) return `${th.prop}${attr}${RESET}`;
      if (pseudo) return `${th.prop}${pseudo}${RESET}`;
      if (cls) return `${th.fn}${cls}${RESET}`;
      if (tag) return `${th.fn}${tag}${RESET}`;
      if (comb) return `${th.pun}${comb}${RESET}`;
      return m;
    });
}

function cssTokenize(seg, th) {
  const re = cssRegex();
  re.lastIndex = 0;
  return seg.replace(re, (m, sel, at, pseudo, prop, num, fn, vr, pun) => {
    if (sel) return subCssSel(sel, th);
    if (at) return `${th.kw}${at}${RESET}`;
    if (pseudo) return `${th.prop}${pseudo}${RESET}`;
    if (prop) return `${th.prop}${prop}${RESET}`;
    if (num) return `${th.num}${num}${RESET}`;
    if (fn) return `${th.fn}${fn}${RESET}`;
    if (vr) return `${th.prop}${vr}${RESET}`;
    if (pun) return `${th.pun}${pun}${RESET}`;
    return m;
  });
}

function highlightCss(line, th, st) {
  return scanLine(line, 'css', st).map(([kind, text]) => {
    if (kind === 'com') return `${th.comment}${text}${RESET}`;
    if (kind === 'str') return `${th.str}${text}${RESET}`;
    return cssTokenize(text, th);
  }).join('');
}

module.exports = { cssRegex, subCssSel, cssTokenize, highlightCss };
