// Embedded shell pane (ctrl-t): a persistent shell living in the lower half
// of the right section. Pure-stdlib pipe mode — child_process.spawn with
// piped stdio, one line per Enter, output streamed into a scrollback grid
// with basic SGR colors, prompt `cwd>`, history, pgup/pgdn scroll and
// Tab path-completion. This is NOT a PTY (Node stdlib has none): no
// vim/ssh/full-screen TUIs, single-line commands only, ctrl-c kills and
// restarts the shell. PowerShell's `-Command -` stdin mode executes one
// statement at a time, which is exactly what this needs.
// NOTE: requires ui.js at runtime only (see explorer.js note on the
// UI-cluster require convention).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { state, edit } = require('./state');
const { BOLD, DIM } = require('./ansi');
const ui = require('./ui');

const isWin = process.platform === 'win32';
const TERM_MAX_LINES = 1000; // scrollback cap
const TERM_MAX_LINECH = 2048; // per-line char cap (runaway \r streams)
const TERM_HIST = 100;
const SHELL_HANDSHAKE_MS = 5000;

const PS_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'];
const HELLO = '__SABI_HELLO__';
const END_PREFIX = '__SABI_END__:';
const CWD_PREFIX = '__SABI_CWD__:';
const MARK_WIN = 'Write-Output "__SABI_END__:ok=$?"; Write-Output "__SABI_CWD__:$($PWD.Path)"';
const MARK_POSIX = 'echo "__SABI_END__:ok=$?"; echo "__SABI_CWD__:$(pwd)"';

let proc = null; // persistent shell (module-level; UI data lives in state.term)
let shellName = null;
let hs = null; // startup handshake { child, timer, done, settled }
let cur = null; // current (incomplete) output line { chars: [{ch, c}], pos }
let curFg = ''; // current SGR foreground code
let curBold = false;
let escStash = ''; // incomplete escape sequence split across chunks
let renderQueued = false;

function curC() {
  return (curBold ? BOLD : '') + curFg;
}

function termEnsure() {
  if (!state.term) {
    state.term = {
      open: false, lines: [], buf: '', col: 0,
      hist: [], histIdx: -1, draft: '', scroll: 0,
      cwd: state.cwd, running: false, ready: false, lastOk: true,
      _viewH: 10,
    };
  }
  if (!cur) cur = { chars: [], pos: 0 };
  return state.term;
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  setImmediate(() => { renderQueued = false; ui.render(); });
}

// --- scrollback grid ------------------------------------------------------
// Completed lines are { segs: [{ t, c }] } (c = ANSI prefix, '' = plain).
// The live line is a char grid so \r (progress bars) overwrites correctly.
function pushLine(t, segs) {
  t.lines.push({ segs });
  if (t.lines.length > TERM_MAX_LINES) t.lines.splice(0, t.lines.length - TERM_MAX_LINES);
  if (t.scroll > 0) t.scroll++; // keep the viewed region stable
}

function compactCur() {
  const segs = [];
  let run = null;
  for (const cell of cur.chars) {
    if (run && run.c === cell.c) run.t += cell.ch;
    else { run = { t: cell.ch, c: cell.c }; segs.push(run); }
  }
  return segs.length ? segs : [{ t: '', c: '' }];
}

function plainOf(segs) {
  return segs.map((s) => s.t).join('');
}

function newLine(t) {
  const segs = compactCur();
  cur = { chars: [], pos: 0 };
  const text = plainOf(segs);
  // shell bookkeeping markers never reach the scrollback
  if (text === HELLO) return onHello();
  if (text.startsWith(END_PREFIX)) {
    const m = text.match(/^__SABI_END__:ok=(True|False|\d+)/);
    t.lastOk = !m || m[1] === 'True' || m[1] === '0';
    t.running = false;
    return scheduleRender();
  }
  if (text.startsWith(CWD_PREFIX)) {
    const dir = text.slice(CWD_PREFIX.length).trim();
    if (dir) t.cwd = dir;
    return scheduleRender();
  }
  pushLine(t, segs);
  scheduleRender();
}

function putChar(t, ch) {
  if (cur.chars.length >= TERM_MAX_LINECH && cur.pos >= cur.chars.length) return;
  const cell = { ch, c: curC() };
  if (cur.pos < cur.chars.length) cur.chars[cur.pos] = cell;
  else cur.chars.push(cell);
  cur.pos++;
}

function pushText(t, s) {
  for (const ch of s) {
    if (ch === '\n') newLine(t);
    else if (ch === '\r') cur.pos = 0;
    else if (ch === '\b') cur.pos = Math.max(0, cur.pos - 1);
    else if (ch === '\t') { do { putChar(t, ' '); } while (cur.pos % 8 !== 0); }
    else if (ch >= ' ' && ch !== '\x7f') putChar(t, ch);
    // other control chars are dropped
  }
}

// minimal SGR: fg colors + bold survive, everything else is stripped
function applySgr(params) {
  const parts = String(params || '0').split(';');
  for (let raw of parts) {
    const n = raw === '' ? 0 : Number(raw);
    if (n === 0) { curFg = ''; curBold = false; }
    else if (n === 1) curBold = true;
    else if (n === 22) curBold = false;
    else if (n === 39) curFg = '';
    else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) curFg = `\x1b[${n}m`;
    // bg / underline / etc: ignored (panes have no background)
  }
}

function onOut(t, chunk) {
  let s = escStash + chunk.toString('utf8');
  escStash = '';
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) { pushText(t, plain); plain = ''; } };
  while (i < s.length) {
    const ch = s[i];
    if (ch !== '\x1b') { plain += ch; i++; continue; }
    const rest = s.slice(i);
    let m = rest.match(/^\x1b\]([^\x07\x1b]*)(?:\x07|\x1b\\)/); // OSC … BEL
    if (m) { flush(); i += m[0].length; continue; }
    m = rest.match(/^\x1b\[([0-9;?]*)?([A-Za-z~])/); // CSI
    if (m) { flush(); if (m[2] === 'm') applySgr(m[1]); i += m[0].length; continue; }
    if (rest === '\x1b' || /^\x1b[\[\(\)#][0-9;?]*$/.test(rest) || /^\x1b\][^\x07\x1b]*$/.test(rest)) {
      escStash = rest; // split across chunks — wait for more
      break;
    }
    flush(); // unknown escape — drop ESC + next char
    i += Math.min(rest.length, 2);
  }
  flush();
}

// --- shell process --------------------------------------------------------
function posixShell() {
  const sh = process.env.SHELL;
  if (sh && sh.trim()) return sh.trim();
  return 'sh';
}

function preamble() {
  if (!isWin) return [];
  return [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    "$ProgressPreference = 'SilentlyContinue'",
  ];
}

function markerLine() {
  return isWin ? MARK_WIN : MARK_POSIX;
}

function onHello() {
  if (hs && !hs.settled) {
    hs.settled = true;
    clearTimeout(hs.timer);
    const t = termEnsure();
    t.ready = true;
    shellName = hs.exe;
    const done = hs.done;
    hs = null;
    scheduleRender();
    if (done) done(true);
  }
}

function tryCandidate(t, cands, i, done) {
  if (i >= cands.length) {
    pushLine(t, [{ t: '(cannot start shell)', c: '' }]);
    t.running = false;
    scheduleRender();
    if (done) done(false);
    return;
  }
  const [exe, args] = cands[i];
  let child = null;
  try {
    child = spawn(exe, args, { cwd: t.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: process.env });
  } catch {
    return tryCandidate(t, cands, i + 1, done);
  }
  proc = child;
  curFg = ''; curBold = false; escStash = '';
  cur = { chars: [], pos: 0 };
  const timer = setTimeout(() => {
    if (!hs || hs.settled || hs.child !== child) return;
    hs.settled = true;
    try { child.kill(); } catch {}
    proc = null;
    hs = null;
    tryCandidate(t, cands, i + 1, done); // e.g. dead pwsh shim → powershell.exe
  }, SHELL_HANDSHAKE_MS);
  hs = { child, timer, done, settled: false, exe };
  child.on('error', () => {
    if (proc === child) proc = null;
    if (hs && !hs.settled && hs.child === child) {
      hs.settled = true;
      clearTimeout(hs.timer);
      hs = null;
      tryCandidate(t, cands, i + 1, done);
    }
  });
  child.on('exit', () => {
    if (proc === child) { proc = null; t.ready = false; shellName = null; }
    if (t.running) {
      t.running = false;
      pushLine(t, [{ t: '(shell exited)', c: '' }]);
    }
    scheduleRender();
  });
  child.stdout.on('data', (d) => onOut(t, d));
  child.stderr.on('data', (d) => onOut(t, d));
  for (const line of preamble()) child.stdin.write(line + '\n');
  child.stdin.write(`Write-Output "${HELLO}"\n`);
  if (!isWin) child.stdin.write(`echo "${HELLO}"\n`);
}

function startShell(t, done) {
  const cands = isWin
    ? [['pwsh.exe', PS_ARGS], ['powershell.exe', PS_ARGS]]
    : [[posixShell(), []]];
  tryCandidate(t, cands, 0, done);
}

function sendCmd(t, line) {
  if (!proc || !t.ready) return false;
  try {
    proc.stdin.write(line + '\n');
    proc.stdin.write(markerLine() + '\n');
  } catch {
    proc = null; t.ready = false;
    return false;
  }
  t.running = true;
  ui.render();
  return true;
}

function pushEcho(t, line) {
  pushLine(t, [{ t: `${t.cwd}>`, c: DIM }, { t: ` ${line}`, c: '' }]);
}

function histPush(t, line) {
  if (t.hist.length === 0 || t.hist[t.hist.length - 1] !== line) t.hist.push(line);
  if (t.hist.length > TERM_HIST) t.hist.splice(0, t.hist.length - TERM_HIST);
  t.histIdx = -1;
  t.draft = '';
}

function termRun(line) {
  const t = termEnsure();
  pushEcho(t, line);
  histPush(t, line);
  if (proc && t.ready) {
    if (!sendCmd(t, line)) startShell(t, (ok) => { if (ok) sendCmd(t, line); });
  } else {
    startShell(t, (ok) => { if (ok) sendCmd(t, line); });
  }
  ui.render();
}

// --- open / close / toggle ------------------------------------------------
function termOpen() {
  const t = termEnsure();
  t.open = true;
  t.returnMode = state.mode === 'edit' ? 'edit' : 'browse';
  state.mode = 'term';
  t.scroll = 0;
  if (!proc || !t.ready) startShell(t, null);
  ui.render();
}

// back to wherever the terminal was opened from (editor buffer kept)
function termBack() {
  const t = termEnsure();
  state.mode = (t.returnMode === 'edit' && edit.tabs.length > 0) ? 'edit' : 'browse';
}

function termClose() {
  const t = termEnsure();
  t.open = false;
  if (state.mode === 'term') termBack();
  ui.render();
}

// ctrl-t: focused → close · open-but-unfocused → focus · closed → open+focus
function termToggle() {
  const t = termEnsure();
  if (state.mode === 'term') return termClose();
  if (t.open) {
    t.returnMode = state.mode === 'edit' ? 'edit' : 'browse';
    state.mode = 'term';
    t.scroll = 0;
    return ui.render();
  }
  termOpen();
}

function termDispose() {
  if (hs) { clearTimeout(hs.timer); hs = null; }
  if (proc) { try { proc.kill(); } catch {} proc = null; }
}

// --- input ----------------------------------------------------------------
function isWordChar(ch) {
  return /[^ \t\/\\'"|&;()<>:]/.test(ch);
}

function histUp(t) {
  if (!t.hist.length) return;
  if (t.histIdx === -1) { t.draft = t.buf; t.histIdx = t.hist.length - 1; }
  else if (t.histIdx > 0) t.histIdx--;
  t.buf = t.hist[t.histIdx];
  t.col = t.buf.length;
}

function histDown(t) {
  if (t.histIdx === -1) return;
  if (t.histIdx < t.hist.length - 1) { t.histIdx++; t.buf = t.hist[t.histIdx]; }
  else { t.histIdx = -1; t.buf = t.draft || ''; }
  t.col = t.buf.length;
}

function completePath(t) {
  const before = t.buf.slice(0, t.col);
  const m = before.match(/(^|[ \t;"'|=:(,])([^ \t;"'|=:(,]*)$/);
  const token = m ? m[2] : before;
  let dir = t.cwd;
  let partial = token;
  const sep = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'));
  if (sep >= 0) {
    partial = token.slice(sep + 1);
    try { dir = path.resolve(t.cwd, token.slice(0, sep + 1)); } catch { return; }
  }
  let names = null;
  try { names = fs.readdirSync(dir); } catch { return; }
  const low = partial.toLowerCase();
  const matches = names.filter((n) => n.toLowerCase().startsWith(low));
  if (!matches.length) return;
  let prefix = matches[0];
  for (const n of matches.slice(1)) {
    let k = 0;
    while (k < prefix.length && prefix[k].toLowerCase() === (n[k] || '').toLowerCase()) k++;
    prefix = prefix.slice(0, k);
  }
  let insert = prefix.slice(partial.length);
  if (matches.length === 1) {
    let isDir = false;
    try { isDir = fs.statSync(path.join(dir, matches[0])).isDirectory(); } catch {}
    insert += isDir ? path.sep : ' ';
  }
  if (!insert) return;
  t.buf = t.buf.slice(0, t.col) + insert + t.buf.slice(t.col);
  t.col += insert.length;
}

function termSubmit(t) {
  const line = t.buf;
  t.buf = ''; t.col = 0; t.histIdx = -1; t.draft = ''; t.scroll = 0;
  const cmd = line.trim();
  if (!cmd) return ui.render();
  if (/^exit$/i.test(cmd)) return termClose();
  if (/^(cls|clear)$/i.test(cmd)) { t.lines = []; return ui.render(); }
  termRun(line);
}

function termKey(key) {
  const t = termEnsure();
  if (!t.open) { termBack(); return ui.render(); }
  if (key === '\x03') { // ctrl-c: stop the running command, else clear line
    if (t.running && proc) {
      try { proc.kill(); } catch {}
      proc = null; t.ready = false; t.running = false;
      pushLine(t, [{ t: '^C', c: '' }]);
    } else { t.buf = ''; t.col = 0; t.histIdx = -1; }
    return ui.render();
  }
  if (key === '\x1b') { termBack(); return ui.render(); } // esc: back where you came from
  if (key === '\r') return termSubmit(t);
  if (key === '\x7f' || key === '\x08') {
    if (t.col > 0) { t.buf = t.buf.slice(0, t.col - 1) + t.buf.slice(t.col); t.col--; t.histIdx = -1; }
    return ui.render();
  }
  if (key === '\x1b[3~') {
    if (t.col < t.buf.length) { t.buf = t.buf.slice(0, t.col) + t.buf.slice(t.col + 1); t.histIdx = -1; }
    return ui.render();
  }
  if (key === '\x1b[A') { histUp(t); return ui.render(); }
  if (key === '\x1b[B') { histDown(t); return ui.render(); }
  if (key === '\x1b[C') { if (t.col < t.buf.length) t.col++; return ui.render(); }
  if (key === '\x1b[D') { if (t.col > 0) t.col--; return ui.render(); }
  if (key === '\x1b[H' || key === '\x1b[1~' || key === '\x1b[7~' || key === '\x01') { t.col = 0; return ui.render(); }
  if (key === '\x1b[F' || key === '\x1b[4~' || key === '\x1b[8~' || key === '\x05') { t.col = t.buf.length; return ui.render(); }
  if (key === '\x1b[1;5D') { // ctrl+left: word back
    let p = t.col;
    while (p > 0 && !isWordChar(t.buf[p - 1])) p--;
    while (p > 0 && isWordChar(t.buf[p - 1])) p--;
    t.col = p;
    return ui.render();
  }
  if (key === '\x1b[1;5C') { // ctrl+right: word forward
    let p = t.col;
    while (p < t.buf.length && !isWordChar(t.buf[p])) p++;
    while (p < t.buf.length && isWordChar(t.buf[p])) p++;
    t.col = p;
    return ui.render();
  }
  if (key === '\x1b[5~') { t.scroll += (t._viewH || 10); return ui.render(); } // pgup
  if (key === '\x1b[6~') { t.scroll = Math.max(0, t.scroll - (t._viewH || 10)); return ui.render(); } // pgdn
  if (key === '\x0c') { t.lines = []; t.scroll = 0; return ui.render(); } // ctrl-l: clear
  if (key === '\x15') { t.buf = ''; t.col = 0; t.histIdx = -1; return ui.render(); } // ctrl-u: kill line
  if (key === '\t') { completePath(t); return ui.render(); }
  if (key[0] === '\x1b') return; // other escape sequences: ignore
  let changed = false;
  for (const ch of key) {
    if (ch === '\r') { termSubmit(t); return; }
    else if (ch === '\n') insertChar(t, ' ');
    else if (ch >= ' ' && ch !== '\x7f') insertChar(t, ch);
    else return; // control chars: ignore (never clobber the frame)
    changed = true;
  }
  if (changed) ui.render();
}

function insertChar(t, ch) {
  t.buf = t.buf.slice(0, t.col) + ch + t.buf.slice(t.col);
  t.col += ch.length;
  t.histIdx = -1;
}

Object.assign(module.exports, {
  termEnsure, termOpen, termClose, termToggle, termDispose, termKey, termRun,
  TERM_MAX_LINES,
});
