// Project search (ctrl+alt+f): literal case-insensitive search across all
// files. Query first, then a results list — enter opens the match in the
// built-in editor at the exact spot, esc goes back.
// NOTE: requires ui.js / explorer.js / editor.js at runtime only (see
// explorer.js note on the UI-cluster require convention).
const fs = require('node:fs');
const path = require('node:path');
const { state, edit } = require('./state');
const { RESET, BOLD, WHITE, SYNC_ON, SYNC_OFF } = require('./ansi');
const { currentTheme } = require('./themes');
const { highlight } = require('./highlight');
const explorer = require('./explorer');
const editor = require('./editor');
const ui = require('./ui');

const GREP_MAX_MATCHES = 500;
const GREP_MAX_SIZE = 1024 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

function grepOpen() {
  state.grep = { phase: 'input', buf: '', query: '', results: [], sel: 0, scroll: 0, fileCache: null };
  state.mode = 'grep';
  state.message = '';
  ui.render();
}

function grepExit() {
  state.grep = null;
  state.mode = 'browse';
  state.message = '';
  ui.render();
}

function grepKey(key) {
  const g = state.grep;
  if (!g) return ui.render();
  if (key === '\u0003' || key === '\u001b') return grepExit(); // esc / ctrl-c
  if (g.phase === 'input') {
    if (key === '\r') return grepRun();
    if (key === '\u007f' || key === '\x08') {
      g.buf = g.buf.slice(0, -1);
      return ui.render();
    }
    if (key[0] === '\x1b') return; // ignore arrows & co in the query box
    for (const ch of key) {
      if (ch >= ' ' && ch !== '\x7f') g.buf += ch;
    }
    return ui.render();
  }
  // results list
  if (key === 'j' || key === '\u001b[B') return grepMove(1);
  if (key === 'k' || key === '\u001b[A') return grepMove(-1);
  if (key === '\u001b[C' || key === '\u001b[D') return ui.render(); // ignore sideways
  if (key === 'g') { g.sel = 0; g.scroll = 0; return ui.render(); }
  if (key === 'G') { g.sel = g.results.length - 1; return ui.render(); }
  if (key === '\r' || key === 'l') return grepOpenMatch(g.results[g.sel]);
  if (key === 'q' || key === 'Q' || key === 'h' || key === '\u007f') return grepExit();
  return ui.render();
}

function grepMove(d) {
  const g = state.grep;
  if (!g.results.length) return ui.render();
  g.sel = (g.sel + d + g.results.length) % g.results.length;
  ui.render();
}

function grepRun() {
  const g = state.grep;
  const q = g.buf.trim();
  if (!q) return grepExit();
  g.query = q;
  g.results = grepWalk(state.cwd, q.toLowerCase());
  g.phase = 'results';
  g.sel = 0;
  g.scroll = 0;
  state.message = '';
  ui.render();
}

// depth-first walk; returns [{ file, rel, row, col, len, text }]. Skips
// dot-dirs, node_modules, big and binary files. Stops at the match cap.
function grepWalk(root, q) {
  const out = [];
  const seen = new Set();
  const stack = [root];
  while (stack.length && out.length < GREP_MAX_MATCHES) {
    const dir = stack.pop();
    let real;
    try { real = fs.realpathSync(dir); } catch { continue; }
    if (seen.has(real)) continue;
    seen.add(real);
    let names;
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch { continue; }
    names.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const d of names) {
      if (out.length >= GREP_MAX_MATCHES) break;
      const full = path.join(dir, d.name);
      let isDir = false;
      try { isDir = d.isDirectory(); } catch { continue; }
      if (isDir) {
        if (d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue;
        stack.push(full);
        continue;
      }
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile() || st.size > GREP_MAX_SIZE) continue;
      let buf;
      try { buf = fs.readFileSync(full); } catch { continue; }
      if (buf.includes(0)) continue; // binary
      const lines = buf.toString('utf8').split('\n');
      for (let r = 0; r < lines.length && out.length < GREP_MAX_MATCHES; r++) {
        const low = lines[r].toLowerCase();
        let c = -1;
        for (;;) {
          c = low.indexOf(q, c + 1);
          if (c < 0) break;
          out.push({ file: full, rel: path.relative(root, full), row: r, col: c, len: q.length, text: lines[r].slice(0, 200) });
        }
      }
    }
  }
  return out;
}

function grepFileLines(file) {
  const g = state.grep;
  if (g.fileCache && g.fileCache.file === file) return g.fileCache.lines;
  let lines = ['(cannot read file)'];
  try {
    lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  } catch {}
  g.fileCache = { file, lines };
  return lines;
}

function grepOpenMatch(m) {
  if (!m) return ui.render();
  if (editor.editOpen(m.file) !== 'ok') return;
  edit.anchor = { row: m.row, col: m.col };
  edit.row = m.row;
  edit.col = m.col + m.len;
  state.grep = null;
  ui.render();
}

function renderGrep() {
  const T = currentTheme();
  const { cols, rows } = ui.size();
  const g = state.grep;
  const leftW = Math.max(20, Math.floor(cols * 0.45));
  const rightX = leftW + 2;
  const rightW = cols - rightX - 1;
  const listH = rows - 2;

  let out = `${SYNC_ON}\x1b[?25l\x1b[H`;
  out += ui.wipeShrunk(rows);

  if (g.phase === 'input') {
    out += `\x1b[1;1H\x1b[2K${BOLD}${T.path}search all files${RESET}`;
    const prompt = 'find in files: ';
    const maxBuf = Math.max(0, cols - prompt.length - 2);
    const buf = g.buf.slice(-maxBuf);
    out += `\x1b[${rows};1H\x1b[2K${T.status}${prompt}${RESET}${BOLD}${WHITE}${buf}${RESET}${WHITE}█${RESET}`;
    process.stdout.write(out + SYNC_OFF);
    return;
  }

  // results: left = matches, right = file context around the selection
  const counter = g.results.length ? `[${g.sel + 1}/${g.results.length}]` : '[0/0]';
  const title = `search "${g.query}"${g.results.length >= GREP_MAX_MATCHES ? ' (capped)' : ''}`;
  out += `\x1b[1;1H\x1b[2K${BOLD}${T.path}${title.slice(0, cols - counter.length - 1)}${RESET}`;
  out += `\x1b[1;${Math.max(1, cols - counter.length + 1)}H${T.counter}${counter}${RESET}`;

  if (g.sel < g.scroll) g.scroll = g.sel;
  if (g.sel >= g.scroll + listH) g.scroll = g.sel - listH + 1;

  for (let i = 0; i < listH; i++) {
    const idx = g.scroll + i;
    const row = 2 + i;
    if (row > rows - 1) break;
    out += `\x1b[${row};1H\x1b[2K`;
    if (idx >= g.results.length) {
      if (g.results.length === 0 && i === 0) out += `${T.status}(no matches)${RESET}`;
      out += `\x1b[${row};${rightX - 1}H${T.divider}│${RESET}`;
      continue;
    }
    const m = g.results[idx];
    let name = `${m.rel}:${m.row + 1}: ${m.text.trim()}`;
    if (name.length > leftW) name = name.slice(0, leftW - 1) + '…';
    if (idx === g.sel) out += `\x1b[${row};1H${T.selBg}${T.selFg}${name.padEnd(leftW)}${RESET}`;
    else out += `\x1b[${row};1H${WHITE}${name}${RESET}`;
    out += `\x1b[${row};${rightX - 1}H${T.divider}│${RESET}`;
  }

  // right: context around the selected match, match line marked with >
  const hlState = {};
  const sel = g.results[g.sel];
  if (sel) {
    const fileLines = grepFileLines(sel.file);
    const start = Math.max(0, sel.row - 3);
    for (let i = 0; i < listH; i++) {
      const row = 2 + i;
      if (row > rows - 1) break;
      const li = start + i;
      if (li >= fileLines.length) break;
      const raw = fileLines[li].replace(/\t/g, '  ').slice(0, 1000);
      const clipped = raw.length > rightW - 2 ? raw.slice(0, rightW - 3) + '…' : raw;
      out += `\x1b[${row};${rightX}H\x1b[K`;
      if (li === sel.row) out += `${T.fn}> ${RESET}` + highlight(clipped, sel.file, hlState);
      else out += '  ' + highlight(clipped, sel.file, hlState);
    }
  }

  const help = `search "${g.query}" · ${g.results.length} matches · enter open · esc back`;
  out += `\x1b[${rows};1H\x1b[2K${T.status}${help.slice(0, cols)}${RESET}`;
  process.stdout.write(out + SYNC_OFF);
}

Object.assign(module.exports, { grepOpen, grepExit, grepKey, grepMove, grepRun, grepWalk, grepOpenMatch, renderGrep });
