// App entry: CLI parsing, keyboard dispatch, process wiring.
const fs = require('node:fs');
const path = require('node:path');
const { state } = require('./state');
const { SYNC_OFF } = require('./ansi');
const { THEME_NAMES } = require('./themes');
const config = require('./config');
const explorer = require('./explorer');
const editor = require('./editor');
const create = require('./create');
const grep = require('./grep');
const settings = require('./settings');
const git = require('./git');
const discord = require('./discord');
const ui = require('./ui');

function quit() {
  discord.stopPresence();
  process.stdout.write(`\x1b[?25h\x1b[0m${SYNC_OFF}\x1b[2J\x1b[H`);
  process.exit(0);
}

function isExistingPath(p) {
  try { fs.statSync(path.resolve(p)); return true; } catch { return false; }
}

function main() {
  const args = process.argv.slice(2);
  config.loadSettings();

  // CLI: `sabi --list-themes`, `sabi --theme <name>`, `sabi settings`
  if (args.includes('--list-themes')) {
    console.log(THEME_NAMES.join('\n'));
    return;
  }
  const ti = args.indexOf('--theme');
  if (ti !== -1 && args[ti + 1]) {
    if (!config.setTheme(args[ti + 1])) { console.error(state.message); process.exitCode = 1; return; }
    console.log(`theme: ${state.theme}`);
    return;
  }
  let startArg = args[0];
  let openSettingsFirst = false;
  if (startArg === '--settings' || startArg === '-s') { openSettingsFirst = true; startArg = null; }
  else if ((startArg === 'settings' || startArg === 's') && !isExistingPath(startArg)) {
    openSettingsFirst = true; startArg = null;
  }
  const startDir = startArg ? path.resolve(startArg) : process.cwd();
  try {
    if (fs.statSync(startDir).isDirectory()) state.cwd = startDir;
  } catch {}
  // persist toggles made via keys
  explorer.loadDir();
  state.sel = explorer.firstContentIndex();
  state.scroll = 0;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    // non-interactive fallback: just list
    for (const e of state.entries) console.log(e.name);
    return;
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  if (openSettingsFirst) settings.openSettings();
  else ui.render();

  const onResize = () => { ui.render(); };
  process.stdout.on('resize', onResize);

  process.stdin.on('data', feedKey);

  process.on('SIGWINCH', onResize);
  process.on('exit', () => process.stdout.write(`\x1b[?25h\x1b[0m${SYNC_OFF}`));
}

// Lone ESC may be the head of a split multi-byte sequence (alt chords like
// ctrl+alt+f, or an arrow key torn across reads). Hold it briefly: if more
// input arrives in time, recombine; otherwise it was a real Esc.
let pendingEsc = null;
function feedKey(key) {
  if (pendingEsc) {
    clearTimeout(pendingEsc);
    pendingEsc = null;
    if (key === '\u001b') {
      // esc right after esc: first acts now, second arms again
      onKey('\u001b');
      pendingEsc = setTimeout(() => { pendingEsc = null; onKey('\u001b'); }, 60);
      return;
    }
    onKey('\x1b' + key);
    return;
  }
  if (key === '\u001b') {
    pendingEsc = setTimeout(() => { pendingEsc = null; onKey('\u001b'); }, 60);
    return;
  }
  onKey(key);
}

function onKey(key) {
  // ctrl-b toggles the files pane — global, works in every mode
  if (key === '\x02') return explorer.toggleFiles();
  // confirm dialogs capture everything except their own answers
  if (state.dialog) {
    if (explorer.dialogKey(key) === 'quit') return quit();
    return;
  }
  // project search navigates like a list
  if (state.mode === 'grep') { grep.grepKey(key); return; }
  // git changes view navigates like a list
  if (state.mode === 'git') { git.gitKey(key); return; }
  // edit mode: everything goes to the buffer
  if (state.mode === 'edit') { editor.editKey(key); return; }
  // input mode: filename prompt (`n`) or discord client-id prompt — see
  // state.inputKind. Typing is shared; confirm/cancel depend on the owner.
  if (state.mode === 'input') {
    const confirm = () => (state.inputKind === 'discordId' ? settings.confirmDiscordId() : create.confirmCreate());
    const cancel = () => (state.inputKind === 'discordId' ? settings.cancelDiscordId() : create.cancelCreate());
    if (key === '' || key === '') return cancel(); // ctrl-c / esc
    if (key === '\r') return confirm();
    if (key[0] === '') return; // ignore arrows & other escape sequences
    let changed = false;
    for (const ch of key) {
      if (ch === '\r') { confirm(); return; }
      else if (ch === '') { state.inputBuf = state.inputBuf.slice(0, -1); changed = true; }
      else if (ch >= ' ' && ch !== '') { state.inputBuf += ch; changed = true; }
    }
    if (changed) ui.render();
    return;
  }
  // settings mode has its own bindings
  if (state.mode === 'settings') {
    if (key === '\u0003') return quit();
    if (key === '\u001b' || key === 's' || key === 'S' || key === 'q' || key === 'Q') return settings.closeSettings();
    if (key === 'j' || key === '\u001b[B') return settings.settingsMove(1);
    if (key === 'k' || key === '\u001b[A') return settings.settingsMove(-1);
    if (key === '\r' || key === ' ' || key === 'l' || key === '\u001b[C') return settings.settingsActivate();
    if (key === 'h' || key === '\u001b[D') {
      const it = settings.settingsItems()[state.settingsSel];
      if (it && it.type === 'theme') return settings.settingsCycleTheme(-1);
      return settings.settingsActivate();
    }
    return;
  }
  if (key === '\u0003' || key === 'q' || key === 'Q') return quit(); // ctrl-c / q quit instantly
  if (key === '\u001b') return explorer.requestQuit(); // esc asks first
  if (key === '\x1b\x06') return grep.grepOpen(); // ctrl+alt+f: search all files
  if (key === '\r' || key === 'l' || key === '\u001b[C') return explorer.enterSelected();
  if (key === '\u007f' || key === 'h' || key === '\u001b[D') return explorer.goUp();
  if (key === 'j' || key === '\u001b[B') return explorer.move(1);
  if (key === 'k' || key === '\u001b[A') return explorer.move(-1);
  if (key === 'g') { state.sel = 0; state.scroll = 0; return ui.render(); }
  if (key === 'G') { state.sel = state.entries.length - 1; return ui.render(); }
  if (key === 'e' || key === 'E') {
    const e = state.entries[state.sel];
    if (e && !e.isDir) { editor.editOpen(e.full); return; }
    state.message = 'select a file to edit';
    return ui.render();
  }
  if (key === 'a' || key === '.') {
    state.showHidden = !state.showHidden;
    config.saveSettings();
    state.scroll = 0;
    explorer.loadDir();
    state.sel = explorer.firstContentIndex();
    return ui.render();
  }
  if (key === 's' || key === 'S') return settings.openSettings();
  if (key === 'n') return create.openCreate();
  if (key === '\x04') return explorer.requestDelete(); // ctrl-d
  if (key === 'r') { explorer.loadDir(); return ui.render(); }
  if (key === '') return git.gitOpen(); // ctrl-g: git changes
}

module.exports = { main, quit, isExistingPath, onKey, feedKey };
