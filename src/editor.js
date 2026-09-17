// Built-in editor: buffer ops, key handling, and edit-pane drawing.
// NOTE: requires explorer.js / ui.js at runtime only (see explorer.js note
// on the UI-cluster require convention).
const fs = require('node:fs');
const path = require('node:path');
const { state, edit } = require('./state');
const { RESET, REV, BOLD, WHITE, UNDER } = require('./ansi');
const { currentTheme } = require('./themes');
const { highlight } = require('./highlight');
const { langOf, commentOf } = require('./highlight/lang');
const { scanLine } = require('./highlight/scan');
const explorer = require('./explorer');
const discord = require('./discord');
const ui = require('./ui');
const complete = require('./complete');
const diagnose = require('./diagnose');

const EDIT_MAX_SIZE = 512 * 1024;
const EDIT_MAX_LINES = 10000;

// 'ok' (editing, already rendered) | 'error' (message set, rendered)
// The file opens in the current tab when it is clean (including a pristine
// ctrl-shift-t tab, which then takes the file's name) or a new one when the
// current tab has unsaved work. Files already open just activate their
// tab — never duplicated, never reloaded over unsaved changes.
function editOpen(file) {
  complete.dismiss();
  const refuse = (why) => {
    state.message = `${path.basename(file)} ${why}`;
    ui.render();
    return 'error';
  };
  let buf;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > EDIT_MAX_SIZE) return refuse('— too large to edit in sabi');
    buf = fs.readFileSync(file);
    if (buf.includes(0)) return refuse('is binary — cannot edit');
  } catch (err) {
    state.message = `cannot open: ${String(err.message).split('\n')[0]}`;
    ui.render();
    return 'error';
  }
  const lines = buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length > EDIT_MAX_LINES) return refuse('— too large to edit in sabi');
  const existing = findTab(file);
  if (existing >= 0) {
    if (existing !== edit.tabIdx || state.mode !== 'edit') loadTab(existing);
    else { state.message = ''; ui.render(); }
    return 'ok';
  }
  activateBuffer(file, lines, { reuse: true });
  return 'ok';
}

// ctrl-shift-t: a new empty tab (file: null), then straight back to the file
// explorer so you can pick its file — enter on a file while this tab is
// pristine fills the tab and names it.
function editNewEmptyTab() {
  complete.dismiss();
  if (isPristineEmpty()) { state.message = 'new tab — enter opens a file into it'; state.mode = 'browse'; return ui.render(); } // no tab spam
  persistActive();
  const tab = {
    file: null, lines: [''],
    row: 0, col: 0, scroll: 0, colOff: 0,
    dirty: false, confirmDiscard: false, anchor: null, undo: [], find: null,
  };
  edit.tabs.push(tab);
  edit.tabIdx = edit.tabs.length - 1;
  edit.file = null; edit.lines = tab.lines;
  edit.row = 0; edit.col = 0; edit.scroll = 0; edit.colOff = 0;
  edit.dirty = false; edit.confirmDiscard = false; edit.anchor = null;
  edit.undo = tab.undo; edit.find = null;
  state.mode = 'browse';
  state.message = 'new tab — enter opens a file into it';
  discord.refreshPresence();
  ui.render();
}

// an untitled tab with nothing typed yet — safe to fill or drop
function isPristineEmpty() {
  return !edit.file && !edit.dirty && edit.lines.length <= 1 && (edit.lines[0] || '') === '';
}

// Put a freshly loaded buffer on screen: reuse the active tab slot when
// allowed (clean + requested), otherwise push a new tab. Caller guarantees
// the file is not already open.
function activateBuffer(file, lines, opts) {
  const reuse = !!opts.reuse && edit.tabIdx >= 0 && edit.tabIdx < edit.tabs.length && !edit.dirty;
  const tab = {
    file, lines,
    row: 0, col: 0, scroll: 0, colOff: 0,
    dirty: false, confirmDiscard: false, anchor: null, undo: [], find: null,
  };
  if (reuse) {
    persistActive();
    edit.tabs[edit.tabIdx] = tab;
  } else {
    persistActive();
    edit.tabs.push(tab);
    edit.tabIdx = edit.tabs.length - 1;
  }
  edit.file = file; edit.lines = lines;
  edit.row = 0; edit.col = 0; edit.scroll = 0; edit.colOff = 0;
  edit.dirty = false; edit.confirmDiscard = false; edit.anchor = null;
  edit.undo = tab.undo; edit.find = null;
  state.mode = 'edit';
  state.message = '';
  discord.refreshPresence();
  ui.render();
}

function editSave() {
  if (!edit.file) {
    state.message = 'untitled tab — esc for files, enter opens one here';
    return ui.render();
  }
  try {
    fs.writeFileSync(edit.file, edit.lines.join('\n'));
  } catch (err) {
    state.message = `cannot save: ${String(err.message).split('\n')[0]}`;
    ui.render();
    return;
  }
  edit.dirty = false;
  edit.confirmDiscard = false;
  persistActive();
  state.message = `saved ${path.basename(edit.file)}`;
  explorer.loadDir();
  ui.render();
}

// esc: leave the editor but keep every tab (unsaved work stays intact).
// A pristine ctrl-shift-t tab is just dropped — esc works as "never mind".
function editExit() {
  complete.dismiss();
  if (isPristineEmpty()) return closeTab();
  if (edit.dirty && !edit.confirmDiscard) {
    edit.confirmDiscard = true;
    persistActive();
    state.message = 'unsaved changes — esc again to discard, ctrl-s to save';
    return ui.render();
  }
  persistActive();
  const base = edit.file ? path.basename(edit.file) : null;
  edit.confirmDiscard = false;
  persistActive();
  state.mode = 'browse';
  state.message = '';
  explorer.loadDir();
  if (base) {
    const idx = state.entries.findIndex((e) => e.name === base || e.name === base + '/');
    if (idx >= 0) { state.sel = idx; state.scroll = 0; }
  }
  discord.refreshPresence();
  ui.render();
}

// --- tabs ---------------------------------------------------------------
// Tab entries mirror the editor buffer shape (clip/tabs/tabIdx stay global).
function findTab(file) {
  if (!file) return -1;
  return edit.tabs.findIndex((t) => t && t.file === file);
}

// Copy the live buffer into its tab slot (cheap field copy; the lines array
// travels by reference). Called before leaving the active tab.
function persistActive() {
  if (edit.tabIdx < 0 || edit.tabIdx >= edit.tabs.length) return;
  const t = edit.tabs[edit.tabIdx];
  if (!t) return;
  t.file = edit.file; t.lines = edit.lines;
  t.row = edit.row; t.col = edit.col; t.scroll = edit.scroll; t.colOff = edit.colOff;
  t.dirty = edit.dirty; t.confirmDiscard = edit.confirmDiscard;
  t.anchor = edit.anchor ? { row: edit.anchor.row, col: edit.anchor.col } : null;
  t.undo = edit.undo; t.find = edit.find;
}

// Make tab i live (persists the previous one first).
function loadTab(i) {
  complete.dismiss();
  if (!edit.tabs.length) return;
  const n = ((i % edit.tabs.length) + edit.tabs.length) % edit.tabs.length;
  if (n !== edit.tabIdx) persistActive();
  const t = edit.tabs[n];
  edit.file = t.file; edit.lines = t.lines;
  edit.row = t.row; edit.col = t.col; edit.scroll = t.scroll; edit.colOff = t.colOff;
  edit.dirty = t.dirty; edit.confirmDiscard = false;
  edit.anchor = t.anchor ? { row: t.anchor.row, col: t.anchor.col } : null;
  edit.undo = Array.isArray(t.undo) ? t.undo : [];
  t.undo = edit.undo;
  edit.find = t.find || null;
  edit.tabIdx = n;
  state.mode = 'edit';
  state.message = '';
  discord.refreshPresence();
  ui.render();
}

// Jump to tab i (0-based, wraps). From browse this also enters the editor.
function switchTab(i) {
  if (!edit.tabs.length) { state.message = 'no tabs open'; return ui.render(); }
  const n = ((i % edit.tabs.length) + edit.tabs.length) % edit.tabs.length;
  if (n === edit.tabIdx && state.mode === 'edit') { state.message = ''; return ui.render(); }
  loadTab(n);
}

// shift+tab: cycle tabs (wraps both directions)
function nextTab(d) {
  if (!edit.tabs.length) { state.message = 'no tabs open'; return ui.render(); }
  if (edit.tabs.length === 1) {
    if (state.mode !== 'edit' || edit.tabIdx !== 0) loadTab(0);
    else { state.message = ''; ui.render(); }
    return;
  }
  loadTab(edit.tabIdx + (d || 1));
}

// ctrl-w: close the active tab (twice when dirty — first warns).
function closeTab() {
  complete.dismiss();
  if (!edit.tabs.length || edit.tabIdx < 0) {
    state.mode = 'browse';
    state.message = '';
    return ui.render();
  }
  if (edit.dirty && !edit.confirmDiscard) {
    edit.confirmDiscard = true;
    persistActive();
    state.message = 'unsaved changes — ctrl-w again to discard, ctrl-s to save';
    return ui.render();
  }
  const was = edit.tabIdx;
  edit.tabs.splice(was, 1);
  if (!edit.tabs.length) {
    edit.file = null; edit.lines = [];
    edit.row = 0; edit.col = 0; edit.scroll = 0; edit.colOff = 0;
    edit.dirty = false; edit.confirmDiscard = false; edit.anchor = null;
    edit.undo = []; edit.find = null;
    edit.tabIdx = -1;
    state.mode = 'browse';
    state.message = '';
    explorer.loadDir();
    discord.refreshPresence();
    return ui.render();
  }
  const t = edit.tabs[Math.min(was, edit.tabs.length - 1)];
  const n = edit.tabs.indexOf(t);
  edit.file = t.file; edit.lines = t.lines;
  edit.row = t.row; edit.col = t.col; edit.scroll = t.scroll; edit.colOff = t.colOff;
  edit.dirty = t.dirty; edit.confirmDiscard = false;
  edit.anchor = t.anchor ? { row: t.anchor.row, col: t.anchor.col } : null;
  edit.undo = Array.isArray(t.undo) ? t.undo : [];
  t.undo = edit.undo;
  edit.find = t.find || null;
  edit.tabIdx = n;
  state.mode = 'edit';
  state.message = '';
  discord.refreshPresence();
  ui.render();
}

// Tab bar data for ui.js. The active slot merges the live buffer so dirty
// flags and file names are never stale between persists.
function tabEntries() {
  return edit.tabs.map((t, i) => {
    if (i === edit.tabIdx) return { file: edit.file || (t && t.file), dirty: edit.dirty, active: true };
    return { file: t && t.file, dirty: !!(t && t.dirty), active: false };
  });
}

// 0-based tab index for a jump key, or -1. editOnly skips the bare symbols
// (they type text in the buffer — only Alt/CSI-u sequences count there).
function tabIndexFromKey(key, editOnly) {
  if (typeof key !== 'string') return -1;
  const alt = key.match(/^\x1b([1-9])$/);
  if (alt) return Number(alt[1]) - 1;
  const csi = key.match(/^\x1b\[(\d+);2u$/);
  if (csi) {
    const code = Number(csi[1]);
    if (code >= 49 && code <= 57) return code - 49; // kitty shift+1..9
    if (code === 48) return 9; // shift+0 → tab 10
  }
  if (!editOnly) {
    if (key === ')') return 9; // shift+0
    const sym = '!@#$%^&*(';
    if (key.length === 1 && sym.indexOf(key) >= 0) return sym.indexOf(key);
  }
  return -1;
}

// --- auto-close pairs ------------------------------------------------------
// Per-pair toggles live in settings; all default to on (missing = on, so old
// configs keep working).
const PAIRS = [
  { key: 'parens', open: '(', close: ')' },
  { key: 'braces', open: '{', close: '}' },
  { key: 'brackets', open: '[', close: ']' },
  { key: 'dquote', open: '"', close: '"' },
  { key: 'squote', open: "'", close: "'" },
];
function pairEnabled(k) {
  return !state.autoClose || state.autoClose[k] !== false;
}
// Handle one typed char (single keystroke only — pasted text goes through
// verbatim). The caller passes snap() so the undo snapshot lands BEFORE any
// mutation. Returns 'skip' (stepped over an auto-inserted closer, no text
// change), true (inserted something), or false (not handled).
function editAutoClose(ch, key, snap) {
  if (key.length !== 1) return false;
  const pair = PAIRS.find((p) => p.open === ch || p.close === ch);
  if (!pair || !pairEnabled(pair.key)) return false;
  if (selActive()) {
    if (ch !== pair.open) return false; // closer + selection: default replace
    const s = selNorm();
    if (!s || s.r1 !== s.r2) return false; // multi-line selection: default replace
    snap();
    const text = selText();
    deleteSelection();
    editInsert(pair.open + text + pair.close); // cursor ends up after the pair
    return true;
  }
  const line = edit.lines[edit.row] || '';
  if (ch === pair.close && (line[edit.col] || '') === pair.close) {
    edit.col++; // step over the auto-inserted closer
    return 'skip';
  }
  if (ch !== pair.open) return false;
  snap();
  editInsert(pair.open + pair.close);
  edit.col--; // park the cursor inside the pair
  return true;
}

function editInsert(s) {
  const line = edit.lines[edit.row] || '';
  edit.lines[edit.row] = line.slice(0, edit.col) + s + line.slice(edit.col);
  edit.col += s.length;
}

function editBackspace() {
  if (edit.col > 0) {
    const line = edit.lines[edit.row] || '';
    const before = line[edit.col - 1] || '';
    const after = line[edit.col] || '';
    // erase an empty auto-closed pair in one go: (|) -> |
    const pair = PAIRS.find((p) => p.open === before && p.close === after);
    if (pair && pairEnabled(pair.key)) {
      edit.lines[edit.row] = line.slice(0, edit.col - 1) + line.slice(edit.col + 1);
      edit.col--;
      return;
    }
    edit.lines[edit.row] = line.slice(0, edit.col - 1) + line.slice(edit.col);
    edit.col--;
  } else if (edit.row > 0) {
    const cur = edit.lines[edit.row] || '';
    const prev = edit.lines[edit.row - 1] || '';
    edit.lines[edit.row - 1] = prev + cur;
    edit.lines.splice(edit.row, 1);
    edit.row--;
    edit.col = prev.length;
  }
}

function editDeleteForward() {
  const line = edit.lines[edit.row] || '';
  if (edit.col < line.length) {
    edit.lines[edit.row] = line.slice(0, edit.col) + line.slice(edit.col + 1);
  } else if (edit.row < edit.lines.length - 1) {
    edit.lines[edit.row] = line + (edit.lines[edit.row + 1] || '');
    edit.lines.splice(edit.row + 1, 1);
  }
}

function editNewline() {
  const line = edit.lines[edit.row] || '';
  edit.lines[edit.row] = line.slice(0, edit.col);
  edit.lines.splice(edit.row + 1, 0, line.slice(edit.col));
  edit.row++;
  edit.col = 0;
}

function editMove(dx, dy) {
  edit.row = Math.max(0, Math.min(edit.lines.length - 1, edit.row + dy));
  const len = (edit.lines[edit.row] || '').length;
  edit.col = dx ? Math.max(0, Math.min(len, edit.col + dx)) : Math.min(edit.col, len);
}

// --- undo (ctrl-z) -------------------------------------------------------
// snapshots are cheap: the lines array is copied, strings are shared.
const UNDO_MAX = 100;
function pushUndo() {
  edit.undo.push({
    lines: edit.lines.slice(),
    row: edit.row,
    col: edit.col,
    anchor: edit.anchor ? { row: edit.anchor.row, col: edit.anchor.col } : null,
  });
  if (edit.undo.length > UNDO_MAX) edit.undo.splice(0, edit.undo.length - UNDO_MAX);
}

function editUndo() {
  complete.dismiss();
  const s = edit.undo.pop();
  if (!s) return ui.render();
  edit.lines = s.lines;
  edit.row = s.row;
  edit.col = s.col;
  edit.anchor = s.anchor;
  edit.dirty = true;
  edit.confirmDiscard = false;
  ui.render();
}

// --- selection + clipboard -----------------------------------------------
// Selection = anchor (fixed end) + cursor (active end). Empty when equal.
function selActive() {
  return !!edit.anchor && (edit.anchor.row !== edit.row || edit.anchor.col !== edit.col);
}

// normalized raw-coordinate range, or null
function selNorm() {
  if (!selActive()) return null;
  const a = edit.anchor;
  if (a.row < edit.row || (a.row === edit.row && a.col <= edit.col)) {
    return { r1: a.row, c1: a.col, r2: edit.row, c2: edit.col };
  }
  return { r1: edit.row, c1: edit.col, r2: a.row, c2: a.col };
}

// normalized DISPLAY-column range (tabs count as 2), or null
function selNormDisplay() {
  const s = selNorm();
  if (!s) return null;
  return {
    r1: s.r1, r2: s.r2,
    d1: editDispCol(edit.lines[s.r1] || '', s.c1),
    d2: editDispCol(edit.lines[s.r2] || '', s.c2),
  };
}

// visible-column range of the selection on buffer line li, or null
function selRangeForLine(li) {
  const s = selNormDisplay();
  if (!s || li === undefined || li < s.r1 || li > s.r2) return null;
  return { s: li === s.r1 ? s.d1 : 0, e: li === s.r2 ? s.d2 : Infinity };
}

function selText() {
  const s = selNorm();
  if (!s) return '';
  if (s.r1 === s.r2) return (edit.lines[s.r1] || '').slice(s.c1, s.c2);
  const parts = [(edit.lines[s.r1] || '').slice(s.c1)];
  for (let r = s.r1 + 1; r < s.r2; r++) parts.push(edit.lines[r] || '');
  parts.push((edit.lines[s.r2] || '').slice(0, s.c2));
  return parts.join('\n');
}

// delete the selection, park the cursor at its start. True if deleted.
function deleteSelection() {
  const s = selNorm();
  if (!s) return false;
  const tail = (edit.lines[s.r2] || '').slice(s.c2);
  edit.lines[s.r1] = (edit.lines[s.r1] || '').slice(0, s.c1) + tail;
  if (s.r2 > s.r1) edit.lines.splice(s.r1 + 1, s.r2 - s.r1);
  edit.row = s.r1;
  edit.col = s.c1;
  edit.anchor = null;
  return true;
}

function selAnchor() {
  if (!edit.anchor) edit.anchor = { row: edit.row, col: edit.col };
}

// --- word / line selection (ctrl-u, ctrl-l, ctrl-shift+arrows) -------------

function isWordChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch || '');
}

// end of the word at/after col (same line; stops at end of line)
function wordForward(line, col) {
  let i = Math.min(Math.max(col, 0), line.length);
  if (i < line.length && isWordChar(line[i])) {
    while (i < line.length && isWordChar(line[i])) i++;
    return i;
  }
  while (i < line.length && !isWordChar(line[i])) i++;
  while (i < line.length && isWordChar(line[i])) i++;
  return i;
}

// start of the word at/before col (same line; stops at column 0)
function wordBackward(line, col) {
  let i = Math.max(0, Math.min(col, line.length));
  if (i > 0 && isWordChar(line[i - 1])) {
    while (i > 0 && isWordChar(line[i - 1])) i--;
    return i;
  }
  while (i > 0 && !isWordChar(line[i - 1])) i--;
  while (i > 0 && isWordChar(line[i - 1])) i--;
  return i;
}

// ctrl-u: select the current word, or grow the active selection one word
// further away from the anchor (stays on the cursor's line)
function editWordSelect() {
  complete.dismiss();
  const line = edit.lines[edit.row] || '';
  if (!selActive()) {
    let a = edit.col;
    let b = edit.col;
    if (b < line.length && isWordChar(line[b])) {
      while (a > 0 && isWordChar(line[a - 1])) a--;
      while (b < line.length && isWordChar(line[b])) b++;
      edit.anchor = { row: edit.row, col: a };
      edit.col = b;
    } else {
      while (b < line.length && !isWordChar(line[b])) b++;
      if (b < line.length) {
        a = b;
        while (b < line.length && isWordChar(line[b])) b++;
        edit.anchor = { row: edit.row, col: a };
        edit.col = b;
      } else {
        // no word ahead — take the previous one (anchor right, cursor left)
        a = edit.col;
        while (a > 0 && !isWordChar(line[a - 1])) a--;
        if (a <= 0) return ui.render();
        b = a;
        while (a > 0 && isWordChar(line[a - 1])) a--;
        edit.anchor = { row: edit.row, col: b };
        edit.col = a;
      }
    }
    return ui.render();
  }
  const a = edit.anchor;
  const fwd = edit.row > a.row || (edit.row === a.row && edit.col >= a.col);
  edit.col = fwd ? wordForward(line, edit.col) : wordBackward(line, edit.col);
  ui.render();
}

// ctrl-l: select the whole current line; repeat to grow line by line
function editLineSelect() {
  complete.dismiss();
  const last = edit.lines.length - 1;
  const a = edit.anchor;
  const lineWise = !!a && a.col === 0 && edit.col === 0 && a.row !== edit.row;
  if (lineWise) {
    if (edit.row > a.row) {
      if (edit.row >= last) return ui.render();
      edit.row++;
    } else {
      if (edit.row <= 0) return ui.render();
      edit.row--;
    }
    edit.col = 0;
    return ui.render();
  }
  edit.anchor = { row: edit.row, col: 0 };
  if (edit.row >= last) {
    edit.col = (edit.lines[edit.row] || '').length;
  } else {
    edit.row++;
    edit.col = 0;
  }
  ui.render();
}

// best-effort system clipboard sync (ignored by terminals without OSC 52)
function copyToSystem(text) {
  if (!text) return;
  try {
    process.stdout.write(`\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`);
  } catch {}
}

function editSelectAll() {
  complete.dismiss();
  if (!edit.lines.length) return ui.render();
  edit.anchor = { row: 0, col: 0 };
  edit.row = edit.lines.length - 1;
  edit.col = (edit.lines[edit.row] || '').length;
  ui.render();
}

function editCopy() {
  // no selection → copy the whole current line (VSCode behavior)
  const t = selActive() ? selText() : (edit.lines[edit.row] || '') + '\n';
  edit.clip = t;
  copyToSystem(t);
  ui.render();
}

function editCut() {
  complete.dismiss();
  pushUndo();
  if (selActive()) {
    const t = selText();
    edit.clip = t;
    copyToSystem(t);
    deleteSelection();
  } else {
    const line = edit.lines[edit.row] || '';
    edit.clip = line + '\n';
    copyToSystem(edit.clip);
    if (edit.lines.length > 1) {
      edit.lines.splice(edit.row, 1);
      edit.row = Math.min(edit.row, edit.lines.length - 1);
      edit.col = Math.min(edit.col, (edit.lines[edit.row] || '').length);
    } else {
      edit.lines[0] = '';
      edit.col = 0;
    }
  }
  edit.dirty = true;
  edit.confirmDiscard = false;
  ui.render();
}

function editPaste() {
  complete.dismiss();
  const clip = edit.clip || '';
  if (!clip) return ui.render();
  pushUndo();
  if (clip.endsWith('\n')) {
    // line mode (copied/cut whole line): insert below the current line
    edit.lines.splice(edit.row + 1, 0, ...clip.slice(0, -1).split('\n'));
  } else {
    const parts = clip.split('\n');
    if (parts.length === 1) {
      editInsert(clip);
    } else {
      const line = edit.lines[edit.row] || '';
      edit.lines[edit.row] = line.slice(0, edit.col) + parts[0];
      const last = parts[parts.length - 1] + line.slice(edit.col);
      edit.lines.splice(edit.row + 1, 0, ...parts.slice(1, -1), last);
      edit.row += parts.length - 1;
      edit.col = parts[parts.length - 1].length;
    }
  }
  edit.dirty = true;
  edit.confirmDiscard = false;
  ui.render();
}

// recolor one visible range of an already-highlighted line with the theme's
// selection colors (token colors outside the range are untouched)
function applySel(hl, range, T) {
  if (!range || !(range.s < range.e)) return hl;
  const SEL = `${T.selBg}${T.selFg}`;
  let out = '';
  let vis = 0;
  let active = '';
  let inSel = false;
  const re = /\x1b\[[0-9;]*m|[\s\S]/g;
  let m;
  while ((m = re.exec(hl))) {
    const t = m[0];
    if (t[0] === '\x1b') {
      if (t === RESET) active = '';
      else active += t;
      out += t;
      if (inSel) out += SEL;
      continue;
    }
    const want = vis >= range.s && vis < range.e;
    if (want && !inSel) { inSel = true; out += SEL; }
    else if (!want && inSel) { inSel = false; out += RESET + active; }
    out += t;
    vis++;
  }
  if (inSel) out += RESET;
  return out;
}

// cursor movement keys shared by normal editing and find mode.
// Returns true when the key moved the cursor. Never redraws (caller does).
function editNavKey(key) {
  if (key === '\u001b[A' || key === '\x1bOA') { edit.anchor = null; editMove(0, -1); }
  else if (key === '\u001b[B' || key === '\x1bOB') { edit.anchor = null; editMove(0, 1); }
  else if (key === '\u001b[C' || key === '\x1bOC') { edit.anchor = null; editMove(1, 0); }
  else if (key === '\u001b[D' || key === '\x1bOD') { edit.anchor = null; editMove(-1, 0); }
  else if (key === '\u001b[1;5C' || key === '\x1bOc') {
    // ctrl+right: jump a word (SS3 variant = application-cursor mode)
    edit.anchor = null;
    edit.col = wordForward(edit.lines[edit.row] || '', edit.col);
  }
  else if (key === '\u001b[1;5D' || key === '\x1bOd') {
    // ctrl+left: jump a word back
    edit.anchor = null;
    edit.col = wordBackward(edit.lines[edit.row] || '', edit.col);
  }
  else if (key === '\u001b[1;5A' || key === '\x1bOa' || key === '\u001b[1;5B' || key === '\x1bOb') {
    // ctrl+up/down: jump half a page (viewport follows the cursor)
    edit.anchor = null;
    const half = Math.max(1, Math.floor(((process.stdout.rows || 24) - 2) / 2));
    editMove(0, key === '\u001b[1;5A' || key === '\x1bOa' ? -half : half);
  }
  else if (key === '\u001b[1;5H') { edit.anchor = null; edit.row = 0; edit.col = 0; }
  else if (key === '\u001b[1;5F') {
    edit.anchor = null;
    edit.row = edit.lines.length - 1;
    edit.col = (edit.lines[edit.row] || '').length;
  }
  else if (key === '\u001b[1;2A') { selAnchor(); editMove(0, -1); }
  else if (key === '\u001b[1;2B') { selAnchor(); editMove(0, 1); }
  else if (key === '\u001b[1;2C') { selAnchor(); editMove(1, 0); }
  else if (key === '\u001b[1;2D') { selAnchor(); editMove(-1, 0); }
  else if (key === '\x1b[a' || key === '\x1b[b' || key === '\x1b[c' || key === '\x1b[d') {
    // rxvt-style shift+arrows: up / down / right / left
    selAnchor();
    if (key === '\x1b[a') editMove(0, -1);
    else if (key === '\x1b[b') editMove(0, 1);
    else if (key === '\x1b[c') editMove(1, 0);
    else editMove(-1, 0);
  }
  else if (key === '\u001b[1;6C' || key === '\u001b[1;6D') {
    // ctrl-shift+left/right: extend by words
    selAnchor();
    const line = edit.lines[edit.row] || '';
    edit.col = key === '\u001b[1;6C' ? wordForward(line, edit.col) : wordBackward(line, edit.col);
  }
  else if (key === '\u001b[1;6A' || key === '\u001b[1;6B') {
    // ctrl-shift+up/down: extend by lines (like shift+up/down)
    selAnchor();
    editMove(0, key === '\u001b[1;6A' ? -1 : 1);
  }
  else if (key === '\u001b[5~' || key === '\u001b[6~') {
    // pgup/pgdn: move a full page, the viewport follows the cursor
    edit.anchor = null;
    const page = Math.max(1, (process.stdout.rows || 24) - 2);
    editMove(0, key === '\u001b[5~' ? -page : page);
  }
  else if (key === '\u001b[5;2~' || key === '\u001b[6;2~') {
    // shift-pgup/pgdn: extend the selection a full page
    selAnchor();
    const page = Math.max(1, (process.stdout.rows || 24) - 2);
    editMove(0, key === '\u001b[5;2~' ? -page : page);
  }
  else if (key === '\u001b[H' || key === '\u001b[1~') { edit.anchor = null; edit.col = 0; }
  else if (key === '\u001b[F' || key === '\u001b[4~') { edit.anchor = null; edit.col = (edit.lines[edit.row] || '').length; }
  else if (key === '\u001b[1;2H' || key === '\u001b[1;2F') {
    selAnchor();
    edit.col = key === '\u001b[1;2H' ? 0 : (edit.lines[edit.row] || '').length;
  }
  else return false;
  return true;
}

// --- find in file (ctrl-f) -------------------------------------------------
// Case-insensitive literal search. Typing edits the query, enter jumps to the
// next match (selecting it), esc closes. Arrows move the buffer cursor while
// the find stays open.
const FIND_MAX_MATCHES = 500;

function editFindOpen() {
  complete.dismiss();
  edit.find = { query: '', matches: [], idx: 0 };
  ui.render();
}

function editFindClose() {
  complete.dismiss();
  edit.find = null;
  ui.render();
}

function editFindUpdate() {
  const f = edit.find;
  f.matches = [];
  if (!f.query) { f.idx = 0; return; }
  const q = f.query.toLowerCase();
  for (let r = 0; r < edit.lines.length && f.matches.length < FIND_MAX_MATCHES; r++) {
    const line = edit.lines[r];
    const low = line.toLowerCase();
    let c = -1;
    for (;;) {
      c = low.indexOf(q, c + 1);
      if (c < 0) break;
      f.matches.push({
        row: r, col: c, len: f.query.length,
        dcol: editDispCol(line, c),
        dlen: editDispCol(line, c + f.query.length) - editDispCol(line, c),
      });
    }
  }
  f.idx = 0;
  for (let i = 0; i < f.matches.length; i++) {
    const m = f.matches[i];
    if (m.row > edit.row || (m.row === edit.row && m.col >= edit.col)) { f.idx = i; break; }
  }
}

function editFindNext() {
  const f = edit.find;
  if (!f.query) return editFindClose();
  if (!f.matches.length) return ui.render();
  f.idx = (f.idx + 1) % f.matches.length;
  const m = f.matches[f.idx];
  edit.anchor = { row: m.row, col: m.col };
  edit.row = m.row;
  edit.col = m.col + m.len;
  ui.render();
}

function editFindKey(key) {
  const f = edit.find;
  if (key === '\u001b') return editFindClose(); // esc
  if (key === '\r') return editFindNext();
  if (key === '\u007f' || key === '\x08') {
    if (!f.query.length) return ui.render();
    f.query = f.query.slice(0, -1);
    editFindUpdate();
    return ui.render();
  }
  if (key === '\u001b[3~') return ui.render(); // del: nothing to delete in a query
  if (key[0] === '\x1b') {
    if (editNavKey(key)) return ui.render();
    return; // ignore the rest
  }
  let changed = false;
  for (const ch of key) {
    if (ch >= ' ' && ch !== '\x7f') { f.query += ch; changed = true; }
  }
  if (changed) { editFindUpdate(); ui.render(); }
}

// display-column diagnostic ranges on buffer line li (raw cols → disp cols,
// tabs count as 2 — mirrors editDispCol).
function diagRangesForLine(li) {
  const out = [];
  if (state.mode !== 'edit') return out;
  const line = edit.lines[li] || '';
  for (const d of diagnose.forBuffer()) {
    if (d.row !== li) continue;
    out.push({ s: editDispCol(line, d.col), e: editDispCol(line, d.end), sev: d.sev });
  }
  return out;
}

// alt-e / alt-shift-e: jump to the next / previous problem, wrapping
function diagJump(d) {
  complete.dismiss();
  const diags = diagnose.forBuffer().slice().sort((a, b) => a.row - b.row || a.col - b.col);
  if (!diags.length) { state.message = 'no problems'; return ui.render(); }
  let t = null;
  if (d > 0) t = diags.find((x) => x.row > edit.row || (x.row === edit.row && x.col > edit.col)) || diags[0];
  else {
    const prev = diags.filter((x) => x.row < edit.row || (x.row === edit.row && x.col < edit.col));
    t = prev.length ? prev[prev.length - 1] : diags[diags.length - 1];
  }
  edit.row = t.row;
  edit.col = Math.min(t.col, (edit.lines[t.row] || '').length);
  edit.anchor = null;
  state.message = '';
  ui.render();
}

function findRangesForLine(li) {
  const f = edit.find;
  if (!f || !f.query || !f.matches.length) return [];
  const out = [];
  for (let i = 0; i < f.matches.length; i++) {
    const m = f.matches[i];
    if (m.row === li) out.push({ s: m.dcol, e: m.dcol + m.dlen, cur: i === f.idx });
  }
  return out;
}

// current match in selection colors, the rest underlined; token colors
// outside the matches are untouched
function applyFind(hl, ranges, T) {
  if (!ranges.length) return hl;
  const SEL = `${T.selBg}${T.selFg}`;
  const OTHER = UNDER;
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
      if (mode) out += mode === 'cur' ? SEL : OTHER;
      continue;
    }
    while (ri < ranges.length && vis >= ranges[ri].e) ri++;
    const r = ri < ranges.length ? ranges[ri] : null;
    const want = r && vis >= r.s && vis < r.e ? (r.cur ? 'cur' : 'other') : null;
    if (want !== mode) {
      if (mode) out += RESET + active;
      mode = want;
      if (mode) out += mode === 'cur' ? SEL : OTHER;
    }
    out += t;
    vis++;
  }
  if (mode) out += RESET;
  return out;
}

function editKey(key) {
  if (key === '\u0013') return editSave(); // ctrl-s
  if (key === '\x01') return editSelectAll(); // ctrl-a
  if (key === '\x03') return editCopy(); // ctrl-c copies (esc exits)
  if (key === '\x18') return editCut(); // ctrl-x
  if (key === '\x16') return editPaste(); // ctrl-v
  if (key === '\x1a') return editUndo(); // ctrl-z
  if (key === '\x15') return editWordSelect(); // ctrl-u: select by words
  if (key === '\x0c') return editLineSelect(); // ctrl-l: select by lines
  if (key === '\x06') return edit.find ? editFindClose() : editFindOpen(); // ctrl-f toggles find
  if (key === '\x17') return closeTab(); // ctrl-w: close tab (twice when dirty)
  if (key === '\x1b[Z') return nextTab(1); // shift+tab: cycle tabs
  const tabJump = tabIndexFromKey(key, true); // alt+1..9 / kitty shift+1..9
  if (tabJump >= 0) return switchTab(tabJump);
  if (edit.find) return editFindKey(key);
  if (key === '\x0f') return complete.manual(); // ctrl-o: autocomplete
  let pushed = false;
  const snap = () => { if (!pushed) { pushUndo(); pushed = true; } };
  if (complete.popupKey(key, snap)) return; // popup nav/accept first
  if (key === '\u001b') { // esc
    if (edit.dirty && !edit.confirmDiscard) {
      edit.confirmDiscard = true;
      state.message = 'unsaved changes — esc again to discard, ctrl-s to save';
      return ui.render();
    }
    return editExit();
  }
  if (key[0] === '\x1b') {
    if (key === '\x1be') return diagJump(1); // alt-e: next problem
    if (key === '\x1bE') return diagJump(-1); // alt-shift-e: prev problem
    if (key === '\u001b[3~') {
      const len = (edit.lines[edit.row] || '').length;
      if (selActive() || edit.col < len || edit.row < edit.lines.length - 1) pushUndo();
      if (!deleteSelection()) editDeleteForward();
      edit.dirty = true;
      complete.afterType();
      return ui.render();
    }
    if (editNavKey(key)) { complete.dismiss(); return ui.render(); }
    return; // ignore other sequences without redrawing
  }
  if (key === '\r') { pushUndo(); deleteSelection(); editNewline(); edit.dirty = true; edit.confirmDiscard = false; complete.dismiss(); return ui.render(); }
  let changed = false;
  for (const ch of key) {
    if (ch === '\r') { snap(); deleteSelection(); editNewline(); changed = true; }
    else if (ch === '\u007f' || ch === '\x08') {
      if (selActive() || edit.col > 0 || edit.row > 0) snap();
      if (!deleteSelection()) editBackspace();
      changed = true;
    }
    else if (ch === '\t') { snap(); deleteSelection(); editInsert('  '); changed = true; }
    else if (ch >= ' ' && ch !== '\x7f') {
      if (!editAutoClose(ch, key, snap)) { snap(); deleteSelection(); editInsert(ch); }
      changed = true;
    }
  }
  if (changed) { edit.dirty = true; edit.confirmDiscard = false; complete.afterType(); ui.render(); }
}

function ensureEditVisible(listH, rightW) {
  if (edit.row < edit.scroll) edit.scroll = edit.row;
  if (edit.row >= edit.scroll + listH) edit.scroll = edit.row - listH + 1;
  const line = edit.lines[edit.row] || '';
  const dc = editDispCol(line, edit.col);
  if (dc < edit.colOff) edit.colOff = dc;
  if (dc >= edit.colOff + rightW) edit.colOff = dc - rightW + 1;
}

// lines longer than this render unhighlighted (keeps minified files fast)
const HL_MAX_LINE = 2000;

// line-number gutter modes (cycled from settings)
const LN_MODES = ['off', 'normal', 'relative'];

function editGutterWidth() {
  if ((state.lineNumbers || 'off') === 'off') return 0;
  return String(edit.lines.length).length + 1;
}

// gutter cell for buffer line li (empty when numbers are off). Relative mode
// keeps the absolute number on the cursor line, distances elsewhere.
function editGutter(li) {
  if ((state.lineNumbers || 'off') === 'off') return '';
  const w = String(edit.lines.length).length;
  const n = state.lineNumbers === 'relative'
    ? (li === edit.row ? li + 1 : Math.abs(li - edit.row))
    : li + 1;
  const label = String(n).padStart(w, ' ') + ' ';
  if (li === edit.row) return `${BOLD}${WHITE}${label}${RESET}`;
  return `${currentTheme().status}${label}${RESET}`;
}

function expandTabs(s) { return s.replace(/\t/g, '  '); }

// display column of a raw (UTF-16) column — tabs count as 2
function editDispCol(line, col) {
  return expandTabs(line.slice(0, col)).length;
}

// slice a highlighted string by VISIBLE columns, carrying active colors across
function sliceVis(s, start, len) {
  if (len <= 0) return '';
  let out = '';
  let vis = 0;
  let active = '';
  let started = false;
  const re = /\x1b\[[0-9;]*m|[\s\S]/g;
  let m;
  while ((m = re.exec(s))) {
    const t = m[0];
    if (t[0] === '\x1b') {
      if (t === RESET) active = '';
      else active += t;
      if (started) out += t;
      continue;
    }
    if (vis >= start && vis < start + len) {
      if (!started) { started = true; out += active; }
      out += t;
    }
    vis++;
    if (vis >= start + len) break;
  }
  return out;
}

function seal(s) {
  return s === '' || s.endsWith(RESET) ? s : s + RESET;
}

// advance block-comment / triple-string / fence / html-comment state for lines
// too long to highlight (indexOf scan only — quotes are ignored here)
function cheapStateScan(line, lang, st) {
  if (lang === 'md') {
    if (/^\s*```/.test(line)) st.fence = !st.fence;
    return;
  }
  let rest = line;
  if (st.block) {
    const e = rest.indexOf(st.block);
    if (e < 0) return;
    rest = rest.slice(e + st.block.length);
    st.block = null;
  } else if (st.triple) {
    const e = rest.indexOf(st.triple);
    if (e < 0) return;
    rest = rest.slice(e + st.triple.length);
    st.triple = null;
  }
  if (lang === 'html') {
    const o = rest.indexOf('<!--');
    if (o >= 0 && rest.indexOf('-->', o + 4) < 0) st.block = '-->';
    return;
  }
  if (lang === 'py') {
    let r = rest;
    for (;;) {
      const i3d = r.indexOf('"""');
      const i3s = r.indexOf("'''");
      let qi = -1;
      let q = null;
      if (i3d >= 0 && (i3s < 0 || i3d < i3s)) { qi = i3d; q = '"""'; }
      else if (i3s >= 0) { qi = i3s; q = "'''"; }
      if (qi < 0) return;
      const end = r.indexOf(q, qi + 3);
      if (end < 0) { st.triple = q; return; }
      r = r.slice(end + 3);
    }
  }
  if (commentOf(lang).block) {
    let r = rest;
    for (;;) {
      const o = r.indexOf('/*');
      if (o < 0) return;
      const e = r.indexOf('*/', o + 2);
      if (e < 0) { st.block = '*/'; return; }
      r = r.slice(e + 2);
    }
  }
}

// run the state trackers over lines [0, upto) so the viewport starts with the
// right block-comment / triple-string / fence context (mirrors highlight())
function computeHlState(lines, file, upto) {
  const st = {};
  const lang = langOf(file);
  if (!lang) return st;
  for (let i = 0; i < upto && i < lines.length; i++) {
    const line = lines[i];
    if (line.length > HL_MAX_LINE) { cheapStateScan(line, lang, st); continue; }
    if (lang === 'md') {
      if (/^\s*```/.test(line)) st.fence = !st.fence;
    } else if (lang === 'html') {
      let rest = line;
      if (st.block === '-->') {
        const e = rest.indexOf('-->');
        if (e < 0) continue;
        rest = rest.slice(e + 3);
        st.block = null;
      }
      const o = rest.indexOf('<!--');
      if (o >= 0 && rest.indexOf('-->', o + 4) < 0) st.block = '-->';
    } else {
      scanLine(line, lang, st);
    }
  }
  return st;
}

// syntax-highlighted edit line with selection + block cursor; slicing is done
// in visible columns so ANSI codes never disturb the cursor math
function drawEditLine(raw, ctx, isCursor, w, li) {
  const disp = expandTabs(raw);
  let hl;
  if (!state.hl || raw.length > HL_MAX_LINE) {
    if (raw.length > HL_MAX_LINE) cheapStateScan(raw, ctx.lang, ctx.st);
    hl = disp;
  } else {
    hl = highlight(disp, ctx.file, ctx.st);
  }
  const range = selRangeForLine(li);
  const th = currentTheme();
  if (range) hl = applySel(hl, range, th);
  hl = applyFind(hl, findRangesForLine(li), th);
  hl = diagnose.applyDiag(hl, diagRangesForLine(li));
  if (!isCursor) return seal(sliceVis(hl, edit.colOff, w));
  const dc = editDispCol(raw, edit.col);
  const rel = dc - edit.colOff;
  const before = sliceVis(hl, edit.colOff, rel);
  const after = sliceVis(hl, edit.colOff + rel + 1, w - rel - 1);
  const ch = disp[dc] || ' ';
  return `${before}${REV}${ch}${RESET}${seal(after)}`;
}

Object.assign(module.exports, {
  EDIT_MAX_SIZE, EDIT_MAX_LINES, LN_MODES, PAIRS, pairEnabled, editAutoClose,
  editOpen, editNewEmptyTab, editSave, editExit,
  findTab, persistActive, loadTab, switchTab, nextTab, closeTab,
  tabEntries, tabIndexFromKey,
  editInsert, editBackspace, editDeleteForward, editNewline, editMove, editKey,
  ensureEditVisible, HL_MAX_LINE, expandTabs, editDispCol, sliceVis, seal,
  cheapStateScan, computeHlState, drawEditLine, editGutterWidth, editGutter,
  selActive, selText, deleteSelection, editSelectAll, editCopy, editCut, editPaste, applySel,
  pushUndo, editUndo, isWordChar, wordForward, wordBackward, editWordSelect, editLineSelect,
});
