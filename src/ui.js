// Screen rendering: flicker-free atomic frames (no full-clears).
// NOTE: requires explorer.js / editor.js / settings.js at runtime only (see
// explorer.js note on the UI-cluster require convention).
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { state, edit } = require('./state');
const { RESET, BOLD, DIM, WHITE, SYNC_ON, SYNC_OFF, stripAnsi, padVis } = require('./ansi');
const { currentTheme } = require('./themes');
const { highlight } = require('./highlight');
const { langOf } = require('./highlight/lang');
const explorer = require('./explorer');
const editor = require('./editor');
const grep = require('./grep');
const git = require('./git');
const settings = require('./settings');
const icons = require('./icons');
const complete = require('./complete');
const diagnose = require('./diagnose');

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
  // embedded terminal (ctrl-t): steals the lower half of the right pane.
  // The left list keeps full height; preview/edit shrink to viewH.
  const t = state.term;
  const termOpen = !!(t && t.open);
  const viewH = termOpen ? Math.max(6, Math.ceil(listH / 2)) : listH;
  const termTop = 2 + viewH; // divider row
  const termRows = listH - viewH; // divider + content rows
  // tabs live on the top bar (row 1, right side, above the code) — both
  // panes keep their full height no matter how many tabs are open
  const tabList = editor.tabEntries();

  // keep selection in view
  if (state.sel < state.scroll) state.scroll = state.sel;
  if (state.sel >= state.scroll + listH) state.scroll = state.sel - listH + 1;

  let out = `${SYNC_ON}\x1b[?25l\x1b[H`; // atomic frame; hide cursor, home (never full-clear: 2J flashes blank)
  out += wipeShrunk(rows);

  // top bar: cwd (left) + tabs (right, above the code) + counter (far right)
  const counter = state.entries.length ? `[${state.sel + 1}/${state.entries.length}]` : '[0/0]';
  const hasTabs = tabList.length > 0;
  // tabs start where the code pane starts (or after cwd when it is hidden)
  const cwdMax = hasTabs && state.showFiles
    ? Math.max(8, rightX - 3)
    : cols - counter.length - 2;
  const cwdDisp = state.cwd.length > cwdMax
    ? '…' + state.cwd.slice(-(cwdMax - 1))
    : state.cwd;
  const tabX = hasTabs && !state.showFiles ? cwdDisp.length + 2 : rightX;
  const tabsAvail = Math.max(0, cols - tabX - counter.length - 1);
  out += `\x1b[1;1H\x1b[2K${BOLD}${T.path}${cwdDisp}${RESET}`;
  if (hasTabs) out += drawTabRow(T, tabX, tabsAvail, tabList);
  out += `\x1b[1;${Math.max(1, cols - counter.length + 1)}H${T.counter}${counter}${RESET}`;

  // left list (skipped entirely when the files pane is hidden)
  // icon prefixes steal a few columns when on (nerd: 2, badge: 5)
  const iconPad = icons.prefixWidth();
  const nameW = iconPad ? Math.max(8, leftW - iconPad) : leftW;
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
    if (name.length > nameW) name = name.slice(0, nameW - 1) + '…';
    // NOTE: cursor must be back at column 1 before writing the name —
    // otherwise it lands in the preview area and gets overwritten.
    if (idx === state.sel) {
      const pre = icons.rowPrefix(e, null, { bg: T.selBg, fg: T.selFg });
      out += `\x1b[${row};1H${pre}${T.selBg}${T.selFg}${name.padEnd(nameW)}${RESET}`;
    } else if (e.isDir) {
      out += `\x1b[${row};1H${icons.rowPrefix(e, T.dir, null)}${T.dir}${name}${RESET}`;
    } else if (e.isLink) {
      out += `\x1b[${row};1H${icons.rowPrefix(e, T.link, null)}${T.link}${name}${RESET}`;
    } else if (e.isExec) {
      out += `\x1b[${row};1H${icons.rowPrefix(e, T.exec, null)}${T.exec}${name}${RESET}`;
    } else {
      out += `\x1b[${row};1H${icons.rowPrefix(e, WHITE, null)}${WHITE}${name}${RESET}`;
    }
    out += `\x1b[${row};${rightX - 1}H${T.divider}│${RESET}`;
  }

  // right preview — or the editable buffer in edit mode
  // (hlState carries block comments / triple-strings / fences across lines)
  const selEntry = state.entries[state.sel];
  const selFile = selEntry && !selEntry.isDir ? selEntry.full : null;
  // terminal focused after editing keeps the editor buffer on top (returnMode),
  // otherwise the right pane falls back to the file preview
  const editing = state.mode === 'edit' ||
    (state.mode === 'term' && t && t.returnMode === 'edit' && edit.tabs.length > 0);
  const lines = editing ? [] : explorer.previewLines(viewH, Math.max(10, rightW));
  const hlState = {};
  let editCtx = null;
  let textW = rightW;
  if (editing) {
    // gutter steals a few columns; the text pane (and its scrolling) adapt
    textW = Math.max(10, rightW - editor.editGutterWidth());
    editor.ensureEditVisible(viewH, textW);
    editCtx = { file: edit.file, lang: langOf(edit.file), st: editor.computeHlState(edit.lines, edit.file, edit.scroll) };
  }
  for (let i = 0; i < viewH; i++) {
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
    if (isDir) {
      const pre = icons.rowPrefix({ name: txt, isDir: true }, T.dir, null);
      if (!pre) {
        out += `${T.dir}${rawClip}${RESET}`;
      } else {
        const w = Math.max(8, rightW - icons.prefixWidth());
        const clip = txt.length > w ? txt.slice(0, w - 1) + '…' : txt;
        out += `${pre}${T.dir}${clip}${RESET}`;
      }
    }
    else if (selFile && txt[0] !== '(') out += highlight(rawClip, selFile, hlState);
    else out += rawClip;
  }

  // embedded terminal below the preview/edit area
  if (termOpen) out += drawTerm(T, rightX, rightW, termTop, termRows);

  // autocomplete popup floats above everything in the code area
  const cmpView = editing && !edit.find ? complete.view() : null;
  if (cmpView) out += drawComplete(T, rightX, rightW, rows, cmpView);
  else if (lastCmpRect) { out += eraseCmpRect(); lastCmpRect = null; }

  // modal confirm dialog floats above everything (drawn before status bar)
  if (state.dialog) out += drawDialog(T, cols, rows);

  // status bar: path/file/dot in edit mode, help otherwise
  if (state.mode === 'input') {
    const prompt = state.inputKind === 'discordId' ? 'discord client id: ' : 'new (end with / for folder): ';
    const buf = state.inputBuf.slice(Math.max(0, state.inputBuf.length - Math.max(0, cols - prompt.length - 2)));
    out += `\x1b[${rows};1H\x1b[2K${T.status}${prompt}${RESET}${BOLD}${WHITE}${buf}${RESET}${WHITE}█${RESET}`;
  } else if (state.mode === 'edit') {
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
      const tabTag = edit.tabs.length > 1 ? `[${edit.tabIdx + 1}/${edit.tabs.length}] ` : '';
      const base = edit.file
        ? `${tabTag}✎ ${edit.file}${edit.dirty ? ' ●' : ''}`
        : `${tabTag}+ new tab (empty)${edit.dirty ? ' ●' : ''}`; // untitled (ctrl-shift-t) tab
      const maxBase = Math.max(8, cols - stats.length - 3);
      const disp = base.length > maxBase ? '…' + base.slice(-(maxBase - 1)) : base;
      label = `${disp} · ${stats}`;
      // problems: count always, message for the one under the cursor (hover)
      const diags = diagnose.forBuffer();
      if (diags.length) {
        label += ` · ${diags.length} problem${diags.length === 1 ? '' : 's'}`;
        const cur = diagnose.diagAtCursor(diags, edit.row, edit.col);
        if (cur) label += ` · ${cur.sev === 'err' ? '✖' : '⚠'} ${cur.msg}`;
      }
    }
    if (label.length > cols) label = '…' + label.slice(-(cols - 1));
    out += `\x1b[${rows};1H\x1b[2K${T.status}${label}${RESET}`;
  } else if (state.mode === 'term') {
    const help = 'enter run · up/down history · tab complete · pgup/pgdn scroll · ctrl-c stop · esc back · ctrl-t close';
    out += `\x1b[${rows};1H\x1b[2K${T.status}${help.slice(0, cols)}${RESET}`;
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

// tab row (row 1, right side above the code, only when tabs are open):
// ` 1:file●  2:other ` cells, active tab in selection colors. Long names
// shrink; overflow windows around the active tab with ‹ › markers. The
// caller already cleared the line — cells pad to availW with spaces so a
// shorter tab row always erases the previous frame's.
function drawTabRow(T, tabX, availW, tabs) {
  if (availW <= 0) return '';
  const cols = availW;
  let out = `\x1b[1;${tabX}H`;
  let used = 0;
  // file-type icon rides in brand colors; the selection bg is preserved by
  // re-applying the cell fg after it (never RESET mid-cell). `text` stays
  // plain for the width math below (ANSI adds zero visible columns).
  const cells = tabs.map((t, i) => {
    let base = t.file ? path.basename(t.file) : '(untitled)';
    if (base.length > 16) base = base.slice(0, 15) + '…';
    const active = !!t.active;
    const label = ` ${i + 1}:${base}${t.dirty ? '●' : ''} `;
    const icon = icons.tabIcon(t.file, base, T, active);
    const at = label.indexOf(':') + 1;
    return { text: ` ${i + 1}:${icons.tabPrefix(t.file, base)}${base}${t.dirty ? '●' : ''} `, rich: label.slice(0, at) + icon + label.slice(at), active };
  });
  let lo = 0;
  let hi = cells.length;
  const width = (a, b) => cells.slice(a, b).reduce((n, c) => n + c.text.length + 1, 0);
  if (width(0, cells.length) > cols) {
    const ai = Math.max(0, cells.findIndex((c) => c.active));
    lo = ai; hi = ai + 1;
    while (lo > 0 && width(lo - 1, hi) <= cols - 2) lo--;
    while (hi < cells.length && width(lo, hi + 1) <= cols - 2) hi++;
  }
  if (lo > 0) { out += `${T.status}‹${RESET}`; used += 1; }
  for (let i = lo; i < hi; i++) {
    const c = cells[i];
    out += c.active ? `${T.selBg}${T.selFg}${c.rich}${RESET} ` : `${T.status}${c.rich}${RESET} `;
    used += c.text.length + 1;
  }
  if (hi < cells.length) { out += `${T.status}›${RESET}`; used += 1; }
  if (used < cols) out += ' '.repeat(cols - used); // erase previous frame's tail
  return out;
}

// embedded terminal (ctrl-t): divider row + scrollback tail + live prompt.
// Scrollback lines are { segs: [{ t, c }] }; clipping runs per segment so
// stored colors never split mid-escape.
function drawSegs(segs, w) {
  let out = '';
  let used = 0;
  for (const s of segs) {
    if (used >= w) break;
    const chunk = s.t.length > w - used ? s.t.slice(0, w - used) : s.t;
    if (!chunk.length) continue;
    used += chunk.length;
    out += (s.c || '') + chunk + (s.c ? RESET : '');
  }
  return out;
}

// live prompt `cwd>buf` with a block cursor; scrolls horizontally when it
// outgrows the pane. The `>` turns red after a failed command.
function drawTermPrompt(t, w) {
  let lead = `${t.cwd}>`;
  const maxLead = Math.max(8, w - 12);
  if (lead.length > maxLead) lead = '…' + lead.slice(-(maxLead - 1));
  const P = lead + t.buf;
  const ci = Math.min(lead.length + t.col, P.length);
  let off = 0;
  if (P.length > w) off = Math.min(Math.max(0, ci - w + 1), P.length - w);
  const vis = P.slice(off, off + w);
  const c0 = ci - off;
  let out = '';
  let run = '';
  let style = null;
  const push = () => { if (run) { out += (style || '') + run + (style ? RESET : ''); run = ''; } };
  for (let j = 0; j < vis.length; j++) {
    const i = off + j;
    let st = '';
    if (i === c0) st = '\x1b[7m';
    else if (i < lead.length - 1) st = DIM;
    else if (i === lead.length - 1) st = t.lastOk === false ? '\x1b[31m' : DIM;
    if (st !== style) { push(); style = st; }
    run += vis[j];
  }
  if (c0 >= vis.length) { // cursor past the last char
    if (style !== '\x1b[7m') { push(); style = '\x1b[7m'; }
    run += ' ';
  }
  push();
  return out;
}

function drawTerm(T, x, w, top, rows) {
  const t = state.term;
  let out = '';
  const title = t.running
    ? '─ terminal · running (ctrl-c stops) ─'
    : '─ terminal · esc back · exit close · pgup/pgdn scroll ─';
  let head = title.length > w ? title.slice(0, w) : title;
  if (t.scroll > 0) {
    const tag = ` ↑${t.scroll}`;
    head = (head + tag).length > w ? head.slice(0, w - tag.length) + tag : head + tag;
  }
  out += `\x1b[${top};${x}H\x1b[K${T.divider}${head}${RESET}`;
  const cap = Math.max(1, rows - 1); // content rows below the divider
  t._viewH = cap;
  const hidden = Math.min(Math.max(0, t.scroll), t.lines.length + 1);
  const showPrompt = hidden === 0;
  const room = showPrompt ? cap - 1 : cap;
  const end = Math.max(0, t.lines.length - hidden);
  const vis = t.lines.slice(Math.max(0, end - room), end);
  let r = top + 1;
  for (let k = vis.length; k < room; k++, r++) out += `\x1b[${r};${x}H\x1b[K`;
  for (const ln of vis) {
    out += `\x1b[${r};${x}H\x1b[K${drawSegs(ln.segs, w)}`;
    r++;
  }
  if (showPrompt) out += `\x1b[${r};${x}H\x1b[K${drawTermPrompt(t, w)}`;
  return out;
}

// autocomplete popup (ctrl-n / typing): overlay box anchored at the cursor,
// below it or above when space runs out. Selected row inverted, names in
// kind colors. The previous frame's footprint is erased first so a
// shrinking popup leaves no stale cells.
let lastCmpRect = null;
function eraseCmpRect() {
  const r = lastCmpRect;
  let out = '';
  for (let i = 0; i < r.h; i++) {
    const row = r.top + i;
    if (row < 2) continue;
    out += `\x1b[${row};${r.x}H${RESET}${' '.repeat(r.w)}`;
  }
  return out;
}
function drawComplete(T, rightX, rightW, rows, v) {
  const line = edit.lines[edit.row] || '';
  const gutterW = stripAnsi(editor.editGutter(edit.row)).length;
  const dc = Math.max(0, editor.editDispCol(line, edit.col) - edit.colOff);
  const items = v.items.slice(0, 8);
  const more = v.items.length - items.length;
  let pw = 8;
  for (const it of items) pw = Math.max(pw, it.w.length + 5);
  if (more > 0) pw = Math.max(pw, `… +${more} more`.length + 2);
  pw = Math.min(pw, Math.max(10, rightW));
  let x = rightX + gutterW + dc;
  x = Math.max(rightX, Math.min(x, rightX + Math.max(0, rightW - pw)));
  const crow = 2 + (edit.row - edit.scroll);
  const ph = items.length + (more > 0 ? 1 : 0);
  let top = crow + 1;
  if (top + ph > rows - 1) top = Math.max(2, crow - ph);
  let out = '';
  if (lastCmpRect) out += eraseCmpRect();
  const paint = (r, text) => {
    if (r < 2 || r > rows - 1) return;
    out += `\x1b[${r};${x}H${text}`;
  };
  items.forEach((it, i) => {
    const nm = it.w.length > pw - 3 ? it.w.slice(0, pw - 4) + '…' : it.w;
    const left = ` ${nm}`.padEnd(pw - 2, ' ');
    const rowText = left + ` ${it.k}`; // exactly pw visible columns
    if (i === v.sel) paint(top + i, `${T.selBg}${T.selFg}${rowText}${RESET}`);
    else paint(top + i, `${complete.kindColor(T, it.k)}${left}${RESET}${DIM} ${it.k}${RESET}`);
  });
  if (more > 0) paint(top + items.length, `${DIM}${(` … +${more} more`).padEnd(pw, ' ')}${RESET}`);
  lastCmpRect = { x, w: pw, top, h: ph };
  return out;
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

Object.assign(module.exports, { size, paneGeometry, wipeShrunk, render, drawTabRow, gitRoot, gitInfo, dropGitCache });
