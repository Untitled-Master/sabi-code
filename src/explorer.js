// Left pane: directory listing, file preview data, navigation actions.
// NOTE: this module and editor.js / ui.js require each other; that is safe
// under CommonJS as long as cross-module calls happen at runtime (inside
// functions), never at load time.
const fs = require('node:fs');
const path = require('node:path');
const { state } = require('./state');
const config = require('./config');
const discord = require('./discord');
const editor = require('./editor');
const ui = require('./ui');

function isExecutable(full, stat) {
  if (!stat || stat.isDirectory()) return false;
  if (process.platform === 'win32') {
    return /\.(exe|bat|cmd|ps1|com)$/i.test(full);
  }
  try {
    // eslint-disable-next-line no-bitwise
    return (stat.mode & 0o111) !== 0;
  } catch { return false; }
}

function loadDir() {
  let names;
  try {
    names = fs.readdirSync(state.cwd, { withFileTypes: true });
  } catch (e) {
    state.message = String(e.message).split('\n')[0];
    state.entries = [
      { name: './', full: state.cwd, isDir: true, isLink: false, isExec: false, size: 0, mtime: 0 },
      { name: '../', full: path.dirname(state.cwd), isDir: true, isLink: false, isExec: false, size: 0, mtime: 0 },
    ];
    state.sel = 0;
    state.scroll = 0;
    return;
  }
  let list = names.map((d) => {
    const full = path.join(state.cwd, d.name);
    let stat = null;
    try { stat = fs.lstatSync(full); } catch {}
    const isDir = d.isDirectory() || (stat ? stat.isDirectory() : false);
    const isLink = d.isSymbolicLink();
    return {
      name: d.name + (isDir ? '/' : ''),
      full,
      isDir,
      isLink,
      isExec: isExecutable(full, stat),
      size: stat ? stat.size : 0,
      mtime: stat ? stat.mtimeMs : 0,
    };
  });
  if (!state.showHidden) list = list.filter((e) => !e.name.startsWith('.'));
  list.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  // always pin ./ and ../ at top (classic explorer)
  const dots = [
    { name: './', full: state.cwd, isDir: true, isLink: false, isExec: false, size: 0, mtime: 0 },
    { name: '../', full: path.dirname(state.cwd), isDir: true, isLink: false, isExec: false, size: 0, mtime: 0 },
  ];
  state.entries = [...dots, ...list];
  if (state.sel >= state.entries.length) state.sel = Math.max(0, state.entries.length - 1);
  ui.dropGitCache();
  discord.refreshPresence();
}

function previewLines(maxLines, maxWidth) {
  const e = state.entries[state.sel];
  if (!e) return ['(empty)'];
  try {
    const st = fs.lstatSync(e.full);
    if (st.isDirectory()) {
      const kids = fs.readdirSync(e.full, { withFileTypes: true });
      kids.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      if (kids.length === 0) return ['(empty dir)'];
      return kids.slice(0, maxLines).map((k) => ({
        text: k.name + (k.isDirectory() ? '/' : ''),
        isDir: k.isDirectory(),
      }));
    }
    // file
    if (st.size === 0) return ['(empty file)'];
    if (st.size > 2 * 1024 * 1024) {
      return [`(${(st.size / 1024).toFixed(1)} KB — too large to preview)`];
    }
    const buf = fs.readFileSync(e.full);
    if (buf.includes(0)) {
      const ext = path.extname(e.full).toLowerCase();
      const imgExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp'];
      if (imgExts.includes(ext)) return [`(binary image: ${ext.slice(1).toUpperCase()}, ${(st.size / 1024).toFixed(1)} KB)`];
      return [`(binary file, ${(st.size / 1024).toFixed(1)} KB)`];
    }
    const text = buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\t/g, '  ');
    return text.split('\n').slice(0, maxLines).map((l) => ({
      text: l.slice(0, 1000), // raw; render clips to width then highlights
      isDir: false,
    }));
  } catch (err) {
    return [`(cannot preview: ${String(err.message).split('\n')[0]})`];
  }
}

function firstContentIndex() {
  // first entry that isn't ./ or ../ (falls back to 0, e.g. empty dirs)
  const i = state.entries.findIndex((e) => e.name !== './' && e.name !== '../');
  return i >= 0 ? i : 0;
}

function enterSelected() {
  const e = state.entries[state.sel];
  if (!e) return;
  try {
    const st = fs.lstatSync(e.full);
    if (st.isDirectory()) {
      state.cwd = e.full;
      state.scroll = 0;
      state.message = '';
      loadDir();
      state.sel = firstContentIndex();
    } else {
      editor.editOpen(e.full); // files always edit inside sabi (right pane)
      return;
    }
  } catch (err) {
    state.message = String(err.message).split('\n')[0];
  }
  ui.render();
}

function goUp() {
  const parent = path.dirname(state.cwd);
  if (parent === state.cwd) return;
  const base = path.basename(state.cwd);
  state.cwd = parent;
  loadDir();
  const idx = state.entries.findIndex((e) => e.name === base + '/' || e.name === base);
  state.sel = idx >= 0 ? idx : firstContentIndex();
  state.scroll = 0;
  state.message = '';
  ui.render();
}

function move(d) {
  if (!state.entries.length) return;
  state.sel = (state.sel + d + state.entries.length) % state.entries.length;
  state.message = '';
  ui.render();
}

// ctrl-b: show/hide the left files pane (selection is preserved)
function toggleFiles() {
  state.showFiles = !state.showFiles;
  config.saveSettings();
  ui.render();
}

// ctrl-d: ask to delete the selected file/folder (modal y/n dialog)
function requestDelete() {
  const e = state.entries[state.sel];
  if (!e) return;
  if (e.name === './' || e.name === '../') {
    state.message = 'cannot delete ./ or ../';
    return ui.render();
  }
  state.dialog = { kind: 'delete', name: e.name, full: e.full, isDir: e.isDir };
  state.message = '';
  ui.render();
}

function confirmDialog() {
  const d = state.dialog;
  state.dialog = null;
  if (d && d.kind === 'delete') {
    try {
      fs.rmSync(d.full, { recursive: true, force: true });
      state.message = `deleted ${d.name}`;
    } catch (err) {
      state.message = `cannot delete: ${String(err.message).split('\n')[0]}`;
    }
    loadDir(); // clamps selection; next entry slides into place
  }
  ui.render();
}

function cancelDialog() {
  state.dialog = null;
  state.message = '';
  ui.render();
}

// route a key pressed while a modal dialog is open.
// returns 'quit' when the app should exit, true when handled.
function dialogKey(key) {
  const d = state.dialog;
  if (!d) return false;
  if (d.kind === 'quit') {
    if (key === '\u001b' || key === 'q' || key === 'Q' || key === '\u0003') return 'quit'; // esc again quits
    if (key === '\r' || key === 'n' || key === 'N') cancelDialog(); // enter cancels
    return true;
  }
  if (key === 'y' || key === 'Y' || key === '\r') confirmDialog();
  else if (key === 'n' || key === 'N' || key === '\u001b' || key === '\u0003') cancelDialog();
  return true;
}

// esc in browse mode: ask before quitting (esc again quits, enter cancels)
function requestQuit() {
  state.dialog = { kind: 'quit' };
  state.message = '';
  ui.render();
}

Object.assign(module.exports, { isExecutable, loadDir, previewLines, firstContentIndex, enterSelected, goUp, move, toggleFiles, requestDelete, confirmDialog, cancelDialog, requestQuit, dialogKey });
