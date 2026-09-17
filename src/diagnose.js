// Static diagnostics (squiggles + hover): a sound-by-construction checker.
// No language server exists under the zero-dependency rule, so this only
// reports what local syntax PROVES — never guesses:
//   ts/js/py: `x: number = "hi"` (annotation vs literal), `const` reassign,
//     duplicate let/const/class (js/ts)
//   ts/js only: literal-type reassignment (`let s = "a"; s = 5`)
//   code langs: unbalanced ()[]{} (strings/comments masked out first)
// Output: [{ row, col, end, msg, sev }] with raw buffer cols, memoized per
// keystroke. The editor underlines the ranges; the status bar shows the
// message under the cursor (the TUI equivalent of hover).
const { state, edit } = require('./state');
const { RESET, UNDER } = require('./ansi');
const { langOf } = require('./highlight/lang');
const { scanLine } = require('./highlight/scan');

const DIAG_MAX = 100;
const DIAG_MAX_LINE = 2000; // mirrors editor HL_MAX_LINE
const BRACKET_LANGS = new Set(['js', 'ts', 'py', 'go', 'rust', 'c', 'java', 'sql', 'json', 'yaml', 'ini', 'css']);
const TYPE_LANGS = new Set(['js', 'ts', 'py']);

const ERR_STYLE = `${UNDER}\x1b[31m`;
const WARN_STYLE = `${UNDER}\x1b[33m`;

// replace every non-code segment (strings, comments, jsx tags) with spaces
// so positions still line up with the original line
function maskLine(line, lang, st) {
  if (line.length > DIAG_MAX_LINE) return ' '.repeat(line.length);
  const segs = scanLine(line, lang, st);
  let out = '';
  for (const [kind, text] of segs) {
    out += kind === 'code' ? text : ' '.repeat(text.length);
  }
  if (lang === 'js' || lang === 'ts') out = maskRegex(out);
  return out;
}

// `/.../flags` is a regex literal (brackets inside don't count) unless it
// reads as division: previous code token ends in a word char, ) or ], or
// the slash is followed by = or another comment opener (already masked).
function maskRegex(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    if (code[i] !== '/' || code[i + 1] === '=') { out += code[i]; i++; continue; }
    const before = code.slice(0, i).replace(/\s+$/, '');
    const prev = before.slice(-1);
    const kw = /(?:return|typeof|case|do|else|in|of|new|delete|void|yield|await)$/.test(before);
    if (/[\w$)\]]/.test(prev) && !kw) { out += code[i]; i++; continue; }
    let j = i + 1;
    let cls = false;
    let closed = -1;
    while (j < code.length) {
      const c = code[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '[') cls = true;
      else if (c === ']') cls = false;
      else if (c === '/' && !cls) { closed = j; break; }
      else if (c === '\n') break;
      j++;
    }
    if (closed < 0) { out += code[i]; i++; continue; }
    let k = closed + 1;
    while (k < code.length && /[a-z]/.test(code[k])) k++;
    out += ' '.repeat(k - i);
    i = k;
  }
  return out;
}

function inferLiteral(raw, lang) {
  const s = raw.trim();
  if (!s) return null;
  const isPy = lang === 'py';
  if (s.length >= 2 && /^(['"`])/.test(s) && s.endsWith(s[0])) return isPy ? 'str' : 'string';
  if (/^-?\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[lLfFuU]*$/.test(s)) {
    if (isPy) return /\.|[eE]/.test(s) ? 'float' : 'int';
    return 'number';
  }
  if (isPy ? /^(True|False)$/.test(s) : /^(true|false)$/.test(s)) return isPy ? 'bool' : 'boolean';
  if (s[0] === '[') return isPy ? 'list' : 'array';
  if (s[0] === '{') return isPy ? 'dict' : 'object';
  if (/^(null|undefined|None)$/.test(s)) return 'nullish';
  if (/^function\b/.test(s) || /^(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(s)) return 'function';
  return null; // identifiers, calls, anything complex: unknown, skip
}

// annotated type members that we can verify (anything else → skip the check)
function knownMembers(annotated, lang) {
  const isPy = lang === 'py';
  const parts = annotated.split('|').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out = [];
  for (let p of parts) {
    p = p.replace(/\s+/g, '');
    if (/^(any|unknown)$/i.test(p)) return 'ANY';
    let m = null;
    if (isPy) {
      if (/^Optional\[(.+)\]$/.test(p)) { const q = /^Optional\[(.+)\]$/.exec(p)[1]; out.push(...(knownMembers(q, lang) || []), 'None'); continue; }
      if (/^(List|list)\[.*\]$/.test(p)) m = 'list';
      else if (/^(Dict|dict)\[.*\]$/.test(p)) m = 'dict';
      else if (/^(Set|set)\[.*\]$/.test(p)) m = 'set';
      else if (/^(Tuple|tuple)\[.*\]$/.test(p)) m = 'tuple';
      else if (/^(int|float|str|bool|list|dict|set|tuple|None)$/.test(p)) m = p;
    } else {
      if (/^\w+\[\]$/.test(p)) m = 'array';
      else if (/^Array<.*>$/.test(p)) m = 'array';
      else if (/^(number|string|boolean|bigint|symbol|undefined|null|void)$/.test(p)) m = p === 'void' ? 'undefined' : p;
      else if (p === 'object' || /^Record<.*>$/.test(p)) m = 'object';
      else if (/^\(.*\)\s*=>/.test(p) || p === 'Function' || p === 'function') m = 'function';
    }
    if (!m) return null; // custom class/interface/generic: unverifiable
    out.push(m);
  }
  return out;
}

function typeMatches(members, literal, lang) {
  if (members === 'ANY') return true;
  if (literal === 'nullish') return members.some((m) => /^(null|undefined|None|any|unknown)$/i.test(m));
  if (lang === 'py' && ((literal === 'int' && members.includes('float')) || (literal === 'float' && members.includes('int')))) return true; // numeric tower
  if (literal === 'array' && members.includes('object') && lang !== 'py') return true; // arrays are objects
  return members.includes(literal);
}

function displayType(t, lang) {
  if (lang === 'py') return { int: 'int', float: 'float', str: 'str', bool: 'bool', list: 'list', dict: 'dict', set: 'set', tuple: 'tuple' }[t] || t;
  return { number: 'number', string: 'string', boolean: 'boolean', array: 'any[]', object: 'object', function: 'Function' }[t] || t;
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// value extent: the statement `;` from the masked init (string contents
// can't hide one — they're masked out), trims + content from the raw init
// (same offsets), where quotes are visible
function valueSpan(maskedInit, rawLine, vStart) {
  let end = vStart + maskedInit.length;
  const semi = maskedInit.indexOf(';');
  if (semi >= 0) end = vStart + semi;
  const rawInit = rawLine.slice(vStart, end);
  const start = vStart + (rawInit.length - rawInit.trimStart().length);
  const trimmedEnd = vStart + rawInit.trimEnd().length;
  return { text: rawLine.slice(start, trimmedEnd), start, end: trimmedEnd };
}

function diagnose(lines, file) {
  const lang = langOf(file);
  const diags = [];
  if (!lang) return diags;
  const push = (row, col, end, msg, sev) => {
    if (diags.length >= DIAG_MAX) return;
    diags.push({ row, col: Math.max(0, col), end: Math.max(col + 1, end), msg, sev });
  };

  const st = {};
  const masked = lines.map((l) => maskLine(l || '', lang, st));
  const raw = lines.map((l) => l || '');

  // --- declarations + same-line init --------------------------------------
  const declared = new Map(); // name -> { type (annotated|null), inferred, kind }
  const isJs = lang === 'js' || lang === 'ts';
  const isPy = lang === 'py';
  if (TYPE_LANGS.has(lang)) {
    masked.forEach((line, row) => {
      let m;
      if (isJs) {
        const dm = /(?:^|[{\s;])(let|const|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*([^=;]+?))?\s*(?=(?:=[^=]|;|$))/.exec(line);
        if (dm) {
          const [, kind, name, annot] = dm;
          const nameCol = line.indexOf(name, dm.index);
          if (kind === 'let' || kind === 'const') {
            if (declared.has(name) && (declared.get(name).kind === 'let' || declared.get(name).kind === 'const')) {
              push(row, nameCol, nameCol + name.length, `Identifier '${name}' has already been declared.`, 'warn');
            } else {
              declared.set(name, { type: annot ? annot.trim() : null, inferred: null, kind, row });
            }
          } else if (!declared.has(name)) {
            declared.set(name, { type: annot ? annot.trim() : null, inferred: null, kind, row });
          }
          const rec = declared.get(name);
          const eq = /(=(?![=>]))/.exec(line.slice(nameCol + name.length));
          if (eq) {
            const vStart = nameCol + name.length + eq.index + 1;
            const span = valueSpan(line.slice(vStart), raw[row], vStart);
            const lit = inferLiteral(span.text, lang);
            if (rec.type) {
              const members = knownMembers(rec.type, lang);
              if (members && lit && lit !== 'nullish' && !typeMatches(members, lit, lang)) {
                push(row, span.start, span.end,
                  `Type '${displayType(lit, lang)}' is not assignable to type '${rec.type}'.`, 'err');
              }
            } else if (lit && lit !== 'nullish' && lang !== 'py') {
              rec.inferred = lit; // evolving-let, TS style
            }
          }
        }
        const cm = /(?:^|[{\s;])class\s+([A-Za-z_$][\w$]*)/.exec(line);
        if (cm) {
          const nameCol = line.indexOf(cm[1], cm.index);
          if (declared.has(cm[1]) && declared.get(cm[1]).kind === 'class') {
            push(row, nameCol, nameCol + cm[1].length, `Identifier '${cm[1]}' has already been declared.`, 'warn');
          } else if (!declared.has(cm[1])) {
            declared.set(cm[1], { type: null, inferred: null, kind: 'class', row });
          }
        }
      } else if (isPy) {
        const pm = /^\s*([A-Za-z_]\w*)\s*:\s*([^=;#]+?)\s*(?:=[^=]|$)/.exec(line);
        if (pm) {
          const [, name, annot] = pm;
          const nameCol = line.indexOf(name);
          if (!declared.has(name)) declared.set(name, { type: annot.trim(), inferred: null, kind: 'let', row });
          const rec = declared.get(name);
          const eq = /=(?![=>])/.exec(line.slice(nameCol + name.length));
          if (eq) {
            const vStart = nameCol + name.length + eq.index + 1;
            const span = valueSpan(line.slice(vStart), raw[row], vStart);
            const lit = inferLiteral(span.text, lang);
            const members = knownMembers(rec.type, lang);
            if (members && lit && lit !== 'nullish' && !typeMatches(members, lit, lang)) {
              push(row, span.start, span.end,
                `Type '${displayType(lit, lang)}' is not assignable to type '${rec.type}'.`, 'err');
            }
          }
        }
      }
    });

    // --- bare assignments + const writes ------------------------------------
    if (declared.size) {
      const names = [...declared.keys()].map(escRe).join('|');
      const assignRe = new RegExp(`\\b(${names})\\s*(=(?![=>])|\\+=|-=|\\*=|/=|%=|\\+\\+|--)`, 'g');
      masked.forEach((line, row) => {
        assignRe.lastIndex = 0;
        let m;
        while ((m = assignRe.exec(line))) {
          const rec = declared.get(m[1]);
          if (!rec) continue;
          const nameCol = m.index + m[0].indexOf(m[1]);
          if (rec.row === row) continue; // declaration's own init: handled above
          if (rec.kind === 'const' && isJs) {
            push(row, nameCol, nameCol + m[1].length, `Cannot assign to '${m[1]}' because it is a constant.`, 'err');
            continue;
          }
          if (m[2] !== '=') continue;
          const vStart = m.index + m[0].length;
          const span = valueSpan(line.slice(vStart), raw[row], vStart);
          const lit = inferLiteral(span.text, lang); // original text
          const want = rec.type ? knownMembers(rec.type, lang) : (rec.inferred ? [rec.inferred] : null);
          if (want && lit && lit !== 'nullish' && !typeMatches(want, lit, lang)) {
            push(row, span.start, span.end,
              `Type '${displayType(lit, lang)}' is not assignable to type '${rec.type || rec.inferred}'.`, 'err');
          }
        }
      });
    }
  }

  // --- bracket balance (code only — strings/comments already masked) ---------
  if (BRACKET_LANGS.has(lang)) {
    const stack = [];
    const open = { '(': ')', '[': ']', '{': '}' };
    const close = { ')': '(', ']': '[', '}': '{' };
    masked.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (open[ch]) stack.push({ ch, row, col });
        else if (close[ch]) {
          const top = stack[stack.length - 1];
          if (top && top.ch === close[ch]) stack.pop();
          else push(row, col, col + 1, `Unmatched '${ch}'.`, 'err');
        }
      }
    });
    for (const o of stack) push(o.row, o.col, o.col + 1, `Unclosed '${o.ch}'.`, 'err');
  }

  return diags;
}

// memoized over the live buffer: same file/tab/ref/length/chars → same list
let cache = null;
function forBuffer() {
  if (!edit.file || !edit.lines) return [];
  const lang = langOf(edit.file);
  if (!lang) return [];
  let chars = 0;
  for (const l of edit.lines) chars += (l || '').length;
  const key = `${edit.file}\n${edit.tabIdx}\n${edit.lines.length}\n${chars}`;
  if (cache && cache.key === key) return cache.diags;
  const diags = diagnose(edit.lines, edit.file);
  cache = { key, diags };
  return diags;
}

// diagnostic under the cursor (exact hit first, else first on the line)
function diagAtCursor(diags, row, col) {
  let lineHit = null;
  for (const d of diags) {
    if (d.row !== row) continue;
    if (col >= d.col && col < d.end) return d;
    if (!lineHit) lineHit = d;
  }
  return lineHit;
}

// overlay squiggles onto a HIGHLIGHTED line; ranges are display columns
function applyDiag(hl, ranges) {
  if (!ranges.length) return hl;
  const sorted = ranges.slice().sort((a, b) => a.s - b.s);
  let out = '';
  let vis = 0;
  let active = '';
  let mode = null;
  let ri = 0;
  const re = /\x1b\[[0-9;]*m|[\s\S]/g;
  let m;
  while ((m = re.exec(hl))) {
    const t = m[0];
    if (t[0] === '\x1b') {
      if (t === RESET) active = '';
      else active += t;
      out += t;
      if (mode) out += mode === 'err' ? ERR_STYLE : WARN_STYLE;
      continue;
    }
    while (ri < sorted.length && vis >= sorted[ri].e) ri++;
    const r = ri < sorted.length ? sorted[ri] : null;
    const want = r && vis >= r.s && vis < r.e ? r.sev : null;
    if (want !== mode) {
      if (mode) out += RESET + active;
      mode = want;
      if (mode) out += mode === 'err' ? ERR_STYLE : WARN_STYLE;
    }
    out += t;
    vis++;
  }
  if (mode) out += RESET;
  return out;
}

module.exports = { diagnose, forBuffer, diagAtCursor, applyDiag };
