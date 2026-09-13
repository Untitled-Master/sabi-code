// Quick create (`n`): an input on the status bar; trailing / makes a folder.
const fs = require('node:fs');
const path = require('node:path');
const { state } = require('./state');
const explorer = require('./explorer');
const ui = require('./ui');

function openCreate() {
  state.mode = 'input';
  state.inputKind = 'create';
  state.inputBuf = '';
  state.message = '';
  ui.render();
}

function cancelCreate() {
  state.mode = 'browse';
  state.inputBuf = '';
  state.message = '';
  ui.render();
}

function confirmCreate() {
  const raw = state.inputBuf.trim();
  state.mode = 'browse';
  state.inputBuf = '';
  if (!raw) { state.message = ''; return ui.render(); }
  const target = path.resolve(state.cwd, raw);
  const rel = path.relative(state.cwd, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    state.message = 'cannot create outside current dir';
    return ui.render();
  }
  const isDir = /[/\\]$/.test(raw);
  try {
    if (isDir) {
      fs.mkdirSync(target, { recursive: true });
    } else {
      if (fs.existsSync(target)) {
        state.message = `already exists: ${path.basename(target)}`;
        return ui.render();
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '');
    }
    explorer.loadDir();
    const base = path.basename(target);
    const idx = state.entries.findIndex((e) => e.name === base || e.name === base + '/');
    state.sel = idx >= 0 ? idx : explorer.firstContentIndex();
    state.message = isDir ? `created folder ${base}/` : `created file ${base}`;
  } catch (err) {
    state.message = `cannot create: ${String(err.message).split('\n')[0]}`;
  }
  ui.render();
}

Object.assign(module.exports, { openCreate, cancelCreate, confirmCreate });
