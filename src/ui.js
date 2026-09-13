// Screen rendering: flicker-free atomic frames (no full-clears).
// NOTE: requires explorer.js / editor.js / settings.js at runtime only (see
// explorer.js note on the UI-cluster require convention).
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { state, edit } = require('./state');
const { RESET, BOLD, WHITE, SYNC_ON, SYNC_OFF, stripAnsi, padVis } = require('./ansi');
const { currentTheme } = require('./themes');
const { highlight } = require('./highlight');
const { langOf } = require('./highlight/lang');
const explorer = require('./explorer');
const editor = require('./editor');
const grep = require('./grep');
const git = require('./git');
const settings = require('./settings');

function size() {
  return {
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

let lastRows = 0;
// Without full-clears, a shrunken terminal would keep stale bottom lines —
// wipe them once. Called by both render() and renderSettings().
function wipeShrunk(rows) {
  let s = '';
  if (rows < lastRows) {
    for (let r = rows + 1; r <= lastRows; r++) s += `\x1b[${r};1H\x1b[2K`;
  }
  lastRows = rows;
  return s;
}

// single source of truth for the split-pane layout
function paneGeometry() {
  const { cols, rows } = size();
  // files pane hidden (ctrl-b) → preview takes the full width
  const leftW = state.showFiles ? Math.max(20, Math.floor(cols * 0.45)) : 0;
  const rightX = leftW > 0 ? leftW + 2 : 1;
  const rightW = cols - rightX - 1;
  const listH = rows - 2; // top bar + status bar
  return { cols, rows, leftW, rightX, rightW, listH };
}

function render() {
  if (state.mode === 'settings') return settings.renderSettings();
  if (state.mode === 'grep') return grep.renderGrep();
  if (state.mode === 'git') return git.renderGit();
  const T = currentTheme();
  const { cols, rows, leftW, rightX, rightW, listH } = paneGeometry();

  // keep selection in view
  if (state.sel < state.scroll) state.scroll = state.sel;
  if (state.sel >= state.scroll + listH) state.scroll = state.sel - listH + 1;

  let out = `${SYNC_ON}\x1b[?25l\x1b[H`; // atomic frame; hide cursor, home (never full-clear: 2J flashes blank)
  out += wipeShrunk(rows);

  // top bar: cwd + counter
  const counter = state.entries.length ? `[${state.sel + 1}/${state.entries.length}]` : '[0/0]';
  const cwdDisp = state.cwd.length > cols - counter.length - 2
    ? '…' + state.cwd.slice(-(cols - counter.length - 3))
    : state.cwd;
  out += `\x1b[1;1H\x1b[2K${BOLD}${T.path}${cwdDisp}${RESET}`;
  out += `\x1b[1;${Math.max(1, cols - counter.length + 1)}H${T.counter}${counter}${RESET}`;

  // left list (skipped entirely when the files pane is hidden)
  for (let i = 0; i < listH && leftW > 0; i++) {
    const idx = state.scroll + i;
    const row = 2 + i;
    if (row > rows - 1) break;
    out += `\x1b[${row};1H\x1b[2K`;
    if (idx >= state.entries.length) {
      out += `\x1b[${row};${rightX - 1}H${T.divider}│${RESET}`;
      continue;
    }
    const e = state.entries[idx];
    let name = e.name;
    if (name.length > leftW) name = name.slice(0, leftW - 1) + '…';
    // NOTE: cursor must be back at column 1 before writing the name —
    // otherwise it lands in the preview area and gets overwritten.
    if (idx === state.sel) {
      out += `\x1b[${row};1H${T.selBg}${T.selFg}${name.padEnd(leftW)}${RESET}`;
    } else if (e.isDir) {
      out += `\x1b[${row};1H${T.dir}${name}${RESET}`;
    } else if (e.isLink) {
      out += `\x1b[${row};1H${T.link}${name}${RESET}`;
    } else if (e.isExec) {
      out += `\x1b[${row};1H${T.exec}${name}${RESET}`;
    } else {
      out += `\x1b[${row};1H${WHITE}${name}${RESET}`;
    }
    out += `\x1b[${row};${rightX - 1}H${T.divider}│${RESET}`;
  }

  // right preview — or the editable buffer in edit mode
  // (hlState carries block comments / triple-strings / fences across lines)
  const selEntry = state.entries[state.sel];
  const selFile = selEntry && !selEntry.isDir ? selEntry.full : null;
  const editing = state.mode === 'edit' && edit.file;
  const lines = editing ? [] : explorer.previewLines(listH, Math.max(10, rightW));
  const hlState = {};
  let editCtx = null;
  let textW = rightW;
  if (editing) {
    // gutter steals a few columns; the text pane (and its scrolling) adapt
    textW = Math.max(10, rightW - editor.editGutterWidth());
    editor.ensureEditVisible(listH, textW);
    editCtx = { file: edit.file, lang: langOf(edit.file), st: editor.computeHlState(edit.lines, edit.file, edit.scroll) };
  }
  for (let i = 0; i < listH; i++) {
    const row = 2 + i;
    if (row > rows - 1) break;
    out += `\x1b[${row};${rightX}H\x1b[K`; // position + clear to end of line
    if (editing) {
      const li = edit.scroll + i;
      if (li >= edit.lines.length) continue;
      out += editor.editGutter(li) + editor.drawEditLine(edit.lines[li] || '', editCtx, li === edit.row, textW, li);
      continue;
    }
    const line = lines[i];
    if (!line) continue;
    const txt = typeof line === 'string' ? line : line.text;
    const isDir = typeof line === 'object' && line.isDir;
    const rawClip = txt.length > rightW ? txt.slice(0, rightW - 1) + '…' : txt;
    if (isDir) out += `${T.dir}${rawClip}${RESET}`;
    else if (selFile && txt[0] !== '(') out += highlight(rawClip, selFile, hlState);
    else out += rawClip;
  }

  // modal confirm dialog floats above everything (drawn before status bar)
  if (state.dialog) out += drawDialog(T, cols, rows);

  // status bar: path/file/dot in edit mode, help otherwise
  if (state.mode === 'input') {
    const prompt = state.inputKind === 'discordId' ? 'discord client id: ' : 'new (end with / for folder): ';
    const buf = state.inputBuf.slice(Math.max(0, state.inputBuf.length - Math.max(0, cols - prompt.length - 2)));
    out += `\x1b[${rows};1H\x1b[2K${T.status}${prompt}${RESET}${BOLD}${WHITE}${buf}${RESET}${WHITE}█${RESET}`;
  } else if (state.mode === 'edit' && edit.file) {
    let label;
    if (edit.find) {
      const n = edit.find.matches.length;
      const pos = n ? `${edit.find.idx + 1}/${n}` : '0 matches';
      const maxQ = Math.max(0, cols - 40);
      const q = edit.find.query.length > maxQ ? '…' + edit.find.query.slice(-(maxQ - 1)) : edit.find.query;
      label = `find: ${q}█  ${pos} · enter next · esc close`;
    } else {
      // vim-style statusline: ✎ path ● · ln 12/340 · 35% · col 5 · 48w · 1200ch · 1.2KB
      // (position + buffer totals like g Ctrl-G). The file part shrinks first
      // so the numbers stay visible on narrow terminals.
      const text = edit.lines.join('\n');
      const pct = Math.round(((edit.row + 1) / edit.lines.length) * 100);
      const stats = `ln ${edit.row + 1}/${edit.lines.length} · ${pct}% · col ${edit.col + 1} · ${(text.match(/\S+/g) || []).length}w · ${[...text].length}ch · ${fmtSize(Buffer.byteLength(text, 'utf8'))}`;
      const base = `✎ ${edit.file}${edit.dirty ? ' ●' : ''}`;
      const maxBase = Math.max(8, cols - stats.length - 3);
      const disp = base.length > maxBase ? '…' + base.slice(-(maxBase - 1)) : base;
      label = `${disp} · ${stats}`;
    }
    if (label.length > cols) label = '…' + label.slice(-(cols - 1));
    out += `\x1b[${rows};1H\x1b[2K${T.status}${label}${RESET}`;
  } else {
    // browse bar: path + help/message on the left, git info pinned far right.
    // The path shrinks first so message + git stay visible when narrow.
    const help = 'j/k move · enter open · q quit';
    const msg = state.message || help;
    const sep = ' · ';
    const git = gitInfo(state.cwd);
    const pinned = git && git.length < cols ? git : '';
    const W = cols - (pinned ? pinned.length + 1 : 0); // left budget
    const maxPath = W - msg.length - sep.length;
    const disp = maxPath >= 8
      ? (state.cwd.length > maxPath ? '…' + state.cwd.slice(-(maxPath - 1)) : state.cwd)
      : '';
    const left = disp ? `${disp}${sep}${msg}` : msg.slice(0, W);
    out += `\x1b[${rows};1H\x1b[2K${T.status}${left}${RESET}`;
    // git segment gets the selection background so it reads as a badge;
    // selBg/selFg exist in every theme and contrast by construction
    if (pinned) out += `\x1b[${rows};${cols - pinned.length + 1}H${T.selBg}${T.selFg}${pinned}${RESET}`;
  }

  process.stdout.write(out + SYNC_OFF);
}

// human buffer size for the edit status bar (buffers cap at 512KB)
function fmtSize(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// --- git info for the browse status bar -----------------------------------
// Best-effort: '' when not a repo / git missing. Cached per directory with a
// short TTL so saves show up without spawning git on every render.
let gitCache = { dir: '', at: 0, info: '' };
const GIT_TTL_MS = 2000;
// git state may change without cwd changing (save/create/delete/reload all
// funnel through loadDir) — it calls this to force a fresh lookup
function dropGitCache() {
  gitCache = { dir: '', at: 0, info: '' };
}
function gitRun(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', timeout: 3000, windowsHide: true }).trim();
  } catch {
    return null;
  }
}
function gitRoot(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    try {
      const st = fs.statSync(path.join(cur, '.git'));
      if (st.isDirectory() || st.isFile()) return cur;
    } catch {}
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}
// 'owner/repo@main*' — repo falls back to the dir name outside GitHub,
// branch resolves detached HEADs, '*' means dirty
function gitInfo(dir) {
  const now = Date.now();
  if (dir === gitCache.dir && now - gitCache.at < GIT_TTL_MS) return gitCache.info;
  let info = '';
  const root = gitRoot(dir);
  if (root) {
    const sb = gitRun(['-C', root, 'status', '-sb', '--porcelain=v1'], root);
    if (sb !== null) {
      const lines = sb.split('\n');
      const head = lines[0] || '';
      let branch = '';
      const fresh = head.match(/^## No commits yet on (\S+)/);
      const m = head.match(/^## (\S+?)(?:\.\.\.|$|\s)/);
      if (fresh) branch = fresh[1];
      else if (m) branch = m[1];
      if (!branch || branch === 'HEAD') {
        branch = gitRun(['-C', root, 'rev-parse', '--short', 'HEAD'], root) || (branch === 'HEAD' ? 'HEAD' : '');
      }
      const dirty = lines.length > 1 ? '*' : '';
      let repo = '';
      const url = gitRun(['-C', root, 'config', '--get', 'remote.origin.url'], root) || '';
      const g = url.match(/github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i);
      if (g) repo = g[1];
      if (!repo) repo = path.basename(root) || root;
      info = branch ? `${repo}@${branch}${dirty}` : repo;
    }
  }
  gitCache = { dir, at: now, info };
  return info;
}

// centered modal: title, target name, [y]es / [n]o
function drawDialog(T, cols, rows) {
  const d = state.dialog;
  const title = d.kind === 'quit' ? 'Quit sabi?' : d.isDir ? 'Delete folder?' : 'Delete file?';
  let name = d.name || '';
  const maxName = Math.max(8, cols - 12);
  if (name.length > maxName) name = '…' + name.slice(-(maxName - 1));
  const keys = d.kind === 'quit'
    ? `${T.fn}[esc]${RESET} quit   ${T.fn}[enter]${RESET} cancel`
    : `${T.fn}[y]${RESET}es   ${T.fn}[n]${RESET}o`;
  const innerW = Math.min(
    cols - 6,
    Math.max(title.length, stripAnsi(name).length, stripAnsi(keys).length) + 4
  );
  const w = Math.max(10, innerW + 4);
  const lines = [
    `${BOLD}${WHITE}${title}${RESET}`,
    '',
    `${WHITE}${name}${RESET}`,
    '',
    keys,
  ];
  const top = Math.max(2, Math.floor((rows - (lines.length + 2)) / 2));
  const left = Math.max(1, Math.floor((cols - w) / 2) + 1);
  const bar = '─'.repeat(Math.max(2, w - 2));
  let out = `\x1b[${top};${left}H${T.dir}┌${bar}┐${RESET}`;
  lines.forEach((ln, i) => {
    out += `\x1b[${top + 1 + i};${left}H${T.dir}│${RESET} ${padVis(ln, w - 4)} ${T.dir}│${RESET}`;
  });
  out += `\x1b[${top + 1 + lines.length};${left}H${T.dir}└${bar}┘${RESET}`;
  return out;
}

Object.assign(module.exports, { size, paneGeometry, wipeShrunk, render, gitRoot, gitInfo, dropGitCache });
