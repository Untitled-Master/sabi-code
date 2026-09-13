// Quote-aware line scanner: splits a line into [kind, text, extra] segments so
// comment markers inside strings (and vice versa) never misfire.
// Tracks multi-line state in st: st.block = closer ('*/') while inside a block
// comment, st.triple = quotes while inside a python triple-string.
// kinds: code | str | com | jsx | prop (json object key, already includes quotes)
const { commentOf } = require('./lang');

// match a quoted string starting at line[i] (the quote char); null = not a string
function matchQuote(line, i, lang) {
  const q = line[i];
  if (q === '`' && lang !== 'js' && lang !== 'ts' && lang !== 'sql') return null;
  if (lang === 'rust' && q === "'") {
    // lifetimes like 'a look identical — only accept real char literals
    const m = /'(?:[^'\\\n]|\\.)'/.exec(line.slice(i, i + 8));
    return m && m.index === 0 ? m[0] : null;
  }
  let j = i + 1;
  while (j < line.length) {
    const c = line[j];
    if (c === '\\') { j += 2; continue; }
    if (c === q) return line.slice(i, j + 1);
    j++;
  }
  return line.slice(i); // unterminated: rest of line reads as a string
}

// try to match a JSX/TSX-generic tag starting at line[i] === '<'
function matchJsx(line, i) {
  if (!/[A-Za-z/]/.test(line[i + 1] || '')) return null;
  let j = i + 1;
  if (line[j] === '/') j++;
  const nm = /^[A-Za-z][\w.-]*/.exec(line.slice(j));
  if (!nm) return null;
  j += nm[0].length;
  let q = null;
  while (j < line.length && j - i < 240) {
    const c = line[j];
    if (q) {
      if (c === '\\') { j += 2; continue; }
      if (c === q) q = null;
      j++;
      continue;
    }
    if (c === '"' || c === "'") { q = c; j++; continue; }
    if (c === '>') return line.slice(i, j + 1);
    if (!/[\w\s\-.:=/{}\[\]"'+*?|&!%@#$,();]/.test(c)) return null;
    j++;
  }
  return null;
}

function scanLine(line, lang, st) {
  const segs = [];
  const cfg = commentOf(lang);
  const isJs = lang === 'js' || lang === 'ts';
  let buf = '';
  let i = 0;
  const flush = () => { if (buf) { segs.push(['code', buf]); buf = ''; } };

  // continue a construct left open by a previous line
  if (st.block || st.triple) {
    const close = st.block || st.triple;
    const end = line.indexOf(close);
    if (end < 0) { segs.push([st.block ? 'com' : 'str', line]); return segs; }
    segs.push([st.block ? 'com' : 'str', line.slice(0, end + close.length)]);
    st.block = null; st.triple = null;
    i = end + close.length;
  }

  while (i < line.length) {
    const ch = line[i];
    const three = line.substr(i, 3);

    // line comments (scanner only reaches here outside strings)
    let lc = null;
    if (cfg.line) for (const rule of cfg.line) {
      if (line.startsWith(rule.op, i)) {
        if (!rule.blank || i === 0 || /[\s;({|&]/.test(line[i - 1])) { lc = rule.op; break; }
      }
    }
    if (lc) { flush(); segs.push(['com', line.slice(i)]); return segs; }

    // block comment open
    if (cfg.block && ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      flush();
      if (end < 0) { segs.push(['com', line.slice(i)]); st.block = '*/'; return segs; }
      segs.push(['com', line.slice(i, end + 2)]);
      i = end + 2;
      continue;
    }

    // python triple-quoted string open
    if (lang === 'py' && (three === '"""' || three === "'''")) {
      const pre = (buf.match(/[A-Za-z_]+$/) || [''])[0];
      if (pre) buf = buf.slice(0, -pre.length);
      flush();
      const end = line.indexOf(three, i + 3);
      if (end < 0) { segs.push(['str', pre + line.slice(i), { prefix: pre, quote: three }]); st.triple = three; return segs; }
      segs.push(['str', pre + line.slice(i, end + 3), { prefix: pre, quote: three }]);
      i = end + 3;
      continue;
    }

    // JSX tag (js/ts) — consumes quoted attr values as part of the tag
    if (isJs && ch === '<') {
      const tag = matchJsx(line, i);
      if (tag) { flush(); segs.push(['jsx', tag]); i += tag.length; continue; }
      buf += ch; i++;
      continue;
    }

    // quoted strings
    if (ch === '"' || ch === "'" || ch === '`') {
      if (ch === "'" && i > 0 && /[A-Za-z0-9_$]/.test(line[i - 1])) { buf += ch; i++; continue; } // don't, can't, etc.
      if (lang === 'json' && ch === "'") { buf += ch; i++; continue; }
      const m = matchQuote(line, i, lang);
      if (!m) { buf += ch; i++; continue; }
      const pre = (buf.match(/[A-Za-z_]+$/) || [''])[0];
      if (pre) buf = buf.slice(0, -pre.length);
      flush();
      if (lang === 'json' && ch === '"' && /^\s*:/.test(line.slice(i + m.length))) {
        segs.push(['prop', pre + m]); // object key
      } else {
        segs.push(['str', pre + m, { prefix: pre, quote: ch }]);
      }
      i += m.length;
      continue;
    }

    buf += ch; i++;
  }
  flush();
  return segs;
}

module.exports = { matchQuote, matchJsx, scanLine };
