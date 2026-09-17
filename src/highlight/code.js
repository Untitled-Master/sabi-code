// Token pass over `code` segments: numbers, booleans, keywords, builtin and
// capitalized types, calls, properties, decorators, $vars, yaml anchors,
// ini sections/keys, punctuation, and bare identifiers (variables, last).
const { RESET } = require('../ansi');
const { BOOLS, KW, TYPES } = require('./keywords');
const { scanLine } = require('./scan');

const reCache = {};
function codeRegex(lang) {
  if (reCache[lang]) return reCache[lang];
  const alt = (list) => (list && list.length ? `\\b(?:${list.join('|')})\\b` : '(?!)');
  const kwPat = alt(KW[lang]);
  const tyPat = alt(TYPES[lang]);
  const boolPat = alt(BOOLS);
  // NOTE: these three stay capturing groups even when inactive (((?!)x) can
  // never match, not even empty) so group numbering is identical for every language.
  const never = '((?!)x)';
  const anchorPat = lang === 'yaml' ? `([*&][\\w-]+)` : never;
  const sectPat = lang === 'ini' ? `(^\\s*\\[[^\\]\\n]+\\])` : never;
  const keyPat = lang === 'ini' ? `(^\\s*[^=;\\s][^=;]*?)(?=\\s*=)` : never;
  const re = new RegExp(
    `(\\b(?:0[xX][\\dA-Fa-f_]+|0[bB][01_]+|0[oO][0-7_]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[lLfFuUnN]*)\\b)` +
    `|(${boolPat})` +
    `|(${kwPat})` +
    `|(${tyPat})` +
    `|(\\b[A-Z][A-Za-z0-9_]*)` +
    `|([A-Za-z_$][\\w$]*)(?=\\s*\\()` +
    `|([A-Za-z_$][\\w$]*)(?=\\s*:(?![:/]))` +
    `|(?<=\\.)([A-Za-z_$][\\w$]*)` +
    `|(@[A-Za-z_][\\w.]*)` +
    `|(\\$[A-Za-z_][\\w]*|\\$\\{[^}\\n]*\\})` +
    `|${anchorPat}|${sectPat}|${keyPat}` +
    `|([{}()\\[\\];,.])` +
    `|([-+*/%=<>!&|^~?:]+)` +
    `|([A-Za-z_$][\\w$]*)`, // bare identifiers = variables (last: everything else won)
    'g'
  );
  reCache[lang] = re;
  return re;
}

function tokenize(seg, lang, th) {
  const re = codeRegex(lang);
  const vc = th.var || th.prop; // fallback keeps third-party themes working
  re.lastIndex = 0;
  return seg.replace(re, (m, num, bool, kw, bt, cap, fn, pc, pd, deco, vr, anc, sect, pe, pb, po, va) => {
    if (num) return `${th.num}${num}${RESET}`;
    if (bool) return `${th.bool}${bool}${RESET}`;
    if (kw) return `${th.kw}${kw}${RESET}`;
    if (bt) return `${th.type}${bt}${RESET}`;
    if (cap) return `${th.type}${cap}${RESET}`;
    if (fn) return `${th.fn}${fn}${RESET}`;
    if (pc) return `${th.prop}${pc}${RESET}`;
    if (pd) return `${th.prop}${pd}${RESET}`;
    if (deco) return `${th.fn}${deco}${RESET}`;
    if (vr) return `${th.prop}${vr}${RESET}`;
    if (anc) return `${th.prop}${anc}${RESET}`;
    if (sect) return `${th.type}${sect}${RESET}`;
    if (pe) return `${th.prop}${pe}${RESET}`;
    if (pb) return `${th.pun}${pb}${RESET}`;
    if (po) return `${th.pun}${po}${RESET}`;
    if (va) return `${vc}${va}${RESET}`;
    return m;
  });
}

function subJsx(tag, th) {
  let first = true;
  return tag.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(<\/?|\/?>)|([A-Za-z][\w.-]*)|([=:])/g,
    (m, s, br, word, eq) => {
      if (s) return `${th.str}${s}${RESET}`;
      if (br) return `${th.pun}${br}${RESET}`;
      if (eq) return `${th.pun}${eq}${RESET}`;
      if (word) {
        if (first) {
          first = false;
          return /^[A-Z]/.test(word) ? `${th.fn}${word}${RESET}` : `${th.kw}${word}${RESET}`;
        }
        return `${th.prop}${word}${RESET}`;
      }
      return m;
    });
}

// @tags inside comments (JSDoc-style) get the function color
function hlAtTags(text, th) {
  return text.replace(/@[A-Za-z_][\w-]*/g, (m) => `${th.fn}${m}${th.comment}`);
}

// index just past the brace matching the opener; depth-aware, skips quoted
// bits. -1 = unbalanced.
function matchBrace(s, i) {
  let d = 1;
  let q = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) {
      if (c === '\\') j++;
      else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return j + 1; }
  }
  return -1;
}

// re-color ${…} (template literals) and {…} (f-strings) inside a string segment
function interpStr(text, extra, th, lang, depth) {
  const prefix = (extra && extra.prefix) || '';
  const quote = (extra && extra.quote) || '';
  const isTpl = quote === '`';
  const isF = /[fF]/.test(prefix) && (quote === '"' || quote === "'");
  if ((!isTpl && !isF) || depth > 1 || text.length < prefix.length + 2) {
    return `${th.str}${text}${RESET}`;
  }
  const open = text.slice(0, prefix.length + 1);
  const body = text.slice(prefix.length + 1, -1);
  const close = text.slice(-1);
  let out = `${th.str}${open}${RESET}`;
  let i = 0;
  let plain = '';
  const flushPlain = () => { if (plain) { out += `${th.str}${plain}${RESET}`; plain = ''; } };
  while (i < body.length) {
    if (isTpl && body.startsWith('${', i)) {
      const end = matchBrace(body, i + 2);
      if (end < 0) { plain += body.slice(i); break; }
      flushPlain();
      const inner = highlightCodeSegs(scanLine(body.slice(i + 2, end - 1), lang, { block: null, triple: null }), th, lang, depth + 1);
      out += `${th.pun}\${${RESET}${inner}${th.pun}}${RESET}`;
      i = end;
      continue;
    }
    if (isF && body[i] === '{') {
      if (body[i + 1] === '{') { plain += '{{'; i += 2; continue; }
      const end = matchBrace(body, i + 1);
      if (end < 0) { plain += body.slice(i); break; }
      flushPlain();
      const inner = highlightCodeSegs(scanLine(body.slice(i + 1, end - 1), lang, { block: null, triple: null }), th, lang, depth + 1);
      out += `${th.pun}{${RESET}${inner}${th.pun}}${RESET}`;
      i = end;
      continue;
    }
    plain += body[i]; i++;
  }
  flushPlain();
  out += `${th.str}${close}${RESET}`;
  return out;
}

function highlightCodeSegs(segs, th, lang, depth) {
  return segs.map(([kind, text, extra]) => {
    if (kind === 'com') return `${th.comment}${hlAtTags(text, th)}${RESET}`;
    if (kind === 'str') return interpStr(text, extra, th, lang, depth);
    if (kind === 'jsx') return subJsx(text, th);
    if (kind === 'prop') return `${th.prop}${text}${RESET}`;
    return tokenize(text, lang, th);
  }).join('');
}

function highlightCode(line, lang, th, st) {
  return highlightCodeSegs(scanLine(line, lang, st), th, lang, 0);
}

module.exports = { codeRegex, tokenize, subJsx, hlAtTags, matchBrace, interpStr, highlightCodeSegs, highlightCode };
