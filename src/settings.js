// Settings screen (opened with `s`): logo, theme picker with live previews,
// toggles, command reference.
// NOTE: requires ui.js at runtime only (see explorer.js note on the
// UI-cluster require convention).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pkg = require('../package.json');
const { state } = require('./state');
const { RESET, BOLD, WHITE, SYNC_ON, SYNC_OFF, stripAnsi, padVis } = require('./ansi');
const { THEMES, THEME_NAMES, currentTheme } = require('./themes');
const config = require('./config');
const editor = require('./editor');
const explorer = require('./explorer');
const discord = require('./discord');
const { highlightCode } = require('./highlight/code');
const ui = require('./ui');

function settingsItems() {
  return [
    ...THEME_NAMES.map((name) => ({ type: 'theme', name })),
    { type: 'hl' },
    { type: 'hidden' },
    { type: 'ln' },
    { type: 'head', text: 'auto-close' },
    ...editor.PAIRS.map((p) => ({ type: 'pair', key: p.key })),
    { type: 'head', text: 'discord' },
    { type: 'discord' },
    { type: 'discordId' },
    ...KEY_HELP,
  ];
}

// ASCII logo for the top of the settings page. Lives in assets/logo.txt so
// it's trivially editable — plain text, no escaping. Reloaded automatically
// when the file changes, so tweaks show up on the next open.
const ART_PATH = path.join(__dirname, '..', 'assets', 'logo.txt');
let artCache = null;
let artMtime = 0;
function loadArt() {
  try {
    const st = fs.statSync(ART_PATH);
    if (!artCache || st.mtimeMs !== artMtime) {
      artMtime = st.mtimeMs;
      artCache = fs.readFileSync(ART_PATH, 'utf8').replace(/\r\n/g, '\n').split('\n');
      while (artCache.length > 1 && artCache[artCache.length - 1] === '') artCache.pop();
    }
  } catch {
    if (!artCache) artCache = ['sabi'];
  }
  return artCache;
}

// every keybinding in the app, grouped for the reference section below the
// toggles. Keep in sync with main.js (browse/input/settings/dialog) and
// editor.js (edit).
const KEY_HELP = [
  { type: 'head', text: 'browse' },
  { type: 'key', keys: 'j / k · ↑ / ↓', desc: 'move' },
  { type: 'key', keys: 'enter / l / →', desc: 'open' },
  { type: 'key', keys: 'h / ← / backspace', desc: 'up a folder' },
  { type: 'key', keys: 'g / G', desc: 'first / last' },
  { type: 'key', keys: 'e', desc: 'edit file' },
  { type: 'key', keys: 'n', desc: 'new file / folder' },
  { type: 'key', keys: 'a / .', desc: 'hidden files' },
  { type: 'key', keys: 's', desc: 'settings' },
  { type: 'key', keys: 'r', desc: 'reload' },
  { type: 'key', keys: 'q', desc: 'quit' },
  { type: 'key', keys: 'esc', desc: 'quit (asks first)' },
  { type: 'key', keys: 'ctrl-b', desc: 'files pane' },
  { type: 'key', keys: 'ctrl-d', desc: 'delete' },
  { type: 'key', keys: 'ctrl+alt+f', desc: 'search all files' },
  { type: 'key', keys: 'ctrl-g', desc: 'git changes' },
  { type: 'head', text: 'edit' },
  { type: 'key', keys: 'type', desc: 'insert (paste works)' },
  { type: 'key', keys: 'backspace / del', desc: 'delete' },
  { type: 'key', keys: 'enter', desc: 'new line' },
  { type: 'key', keys: 'tab', desc: 'indent' },
  { type: 'key', keys: "() {} [] '' \"\"", desc: 'auto-close (settings)' },
  { type: 'key', keys: 'arrows', desc: 'move' },
  { type: 'key', keys: 'home / end', desc: 'line start / end' },
  { type: 'key', keys: 'pgup / pgdn', desc: 'scroll page' },
  { type: 'key', keys: 'ctrl-s', desc: 'save' },
  { type: 'key', keys: 'ctrl-a', desc: 'select all' },
  { type: 'key', keys: 'ctrl-c', desc: 'copy' },
  { type: 'key', keys: 'ctrl-x', desc: 'cut' },
  { type: 'key', keys: 'ctrl-v', desc: 'paste' },
  { type: 'key', keys: 'ctrl-z', desc: 'undo' },
  { type: 'key', keys: 'ctrl-u', desc: 'select word' },
  { type: 'key', keys: 'ctrl-l', desc: 'select line' },
  { type: 'key', keys: 'ctrl-f', desc: 'find in file' },
  { type: 'key', keys: 'shift+arrows', desc: 'extend selection' },
  { type: 'key', keys: 'shift+home/end', desc: 'to line ends' },
  { type: 'key', keys: 'ctrl+shift+arrows', desc: 'extend by word/line' },
  { type: 'key', keys: 'ctrl+left/right', desc: 'jump by word' },
  { type: 'key', keys: 'ctrl+up/down', desc: 'jump half page' },
  { type: 'key', keys: 'ctrl+home/end', desc: 'top / bottom' },
  { type: 'key', keys: 'fn+arrows (= home/end)', desc: 'with shift: select' },
  { type: 'key', keys: 'esc', desc: 'exit (twice discards)' },
  { type: 'head', text: 'project search' },
  { type: 'key', keys: 'type + enter', desc: 'run search' },
  { type: 'key', keys: 'j / k', desc: 'move' },
  { type: 'key', keys: 'enter', desc: 'open match' },
  { type: 'key', keys: 'esc', desc: 'back' },
  { type: 'head', text: 'git view' },
  { type: 'key', keys: 'j / k', desc: 'move' },
  { type: 'key', keys: 'enter / space', desc: 'checkout / diff' },
  { type: 'key', keys: 'e', desc: 'edit file' },
  { type: 'key', keys: 's / u', desc: 'stage / unstage' },
  { type: 'key', keys: 'r', desc: 'reload' },
  { type: 'key', keys: 'q / esc', desc: 'back' },
  { type: 'head', text: 'settings' },
  { type: 'key', keys: 'j / k', desc: 'move' },
  { type: 'key', keys: 'enter / space', desc: 'select' },
  { type: 'key', keys: 'h / l', desc: 'prev / next theme' },
  { type: 'key', keys: 's / esc', desc: 'close' },
  { type: 'head', text: 'new file/folder input' },
  { type: 'key', keys: 'enter', desc: 'confirm' },
  { type: 'key', keys: 'esc', desc: 'cancel' },
  { type: 'head', text: 'delete dialog' },
  { type: 'key', keys: 'y / enter', desc: 'yes' },
  { type: 'key', keys: 'n / esc', desc: 'no' },
];

function openSettings() {
  state.mode = 'settings';
  // jump to current theme
  const items = settingsItems();
  const idx = items.findIndex((it) => it.type === 'theme' && it.name === state.theme);
  state.settingsSel = idx >= 0 ? idx : 0;
  state.settingsScroll = 0; // render() clamps it into view below
  state.message = '';
  ui.render();
}

function closeSettings() {
  state.mode = 'browse';
  config.saveSettings();
  state.message = '';
  ui.render();
}

function settingsMove(d) {
  const items = settingsItems();
  state.settingsSel = (state.settingsSel + d + items.length) % items.length;
  ui.render();
}

function settingsActivate() {
  const items = settingsItems();
  const it = items[state.settingsSel];
  if (!it) return;
  if (it.type === 'theme') {
    config.setTheme(it.name);
    state.message = `theme: ${it.name}`;
  } else if (it.type === 'hl') {
    state.hl = !state.hl;
    config.saveSettings();
    state.message = state.hl ? 'syntax highlight on' : 'syntax highlight off';
  } else if (it.type === 'hidden') {
    state.showHidden = !state.showHidden;
    config.saveSettings();
    state.scroll = 0;
    explorer.loadDir();
    state.sel = explorer.firstContentIndex();
    state.message = state.showHidden ? 'hidden files shown' : 'hidden files hidden';
  } else if (it.type === 'pair') {
    const p = editor.PAIRS.find((q) => q.key === it.key);
    state.autoClose[it.key] = !state.autoClose[it.key];
    config.saveSettings();
    state.message = p ? `auto-close ${p.open}${p.close} ${state.autoClose[it.key] ? 'on' : 'off'}` : 'auto-close updated';
  } else if (it.type === 'ln') {
    const i = editor.LN_MODES.indexOf(state.lineNumbers);
    state.lineNumbers = editor.LN_MODES[(i + 1) % editor.LN_MODES.length];
    config.saveSettings();
    state.message = `line numbers: ${state.lineNumbers}`;
  } else if (it.type === 'discord') {
    state.discord.enabled = !state.discord.enabled;
    config.saveSettings();
    discord.refreshPresence();
    if (state.discord.enabled && !discord.effectiveClientId()) {
      state.message = 'discord on — enter a client id below';
    } else {
      state.message = `discord rich presence ${state.discord.enabled ? 'on' : 'off'}`;
    }
  } else if (it.type === 'discordId') {
    return openDiscordId();
  }
  ui.render();
}

// discord client-id prompt (reuses input mode — see state.inputKind)
function openDiscordId() {
  state.mode = 'input';
  state.inputKind = 'discordId';
  state.inputBuf = (state.discord && state.discord.clientId) || '';
  state.message = 'discord application id (digits)';
  ui.render();
}
function cancelDiscordId() {
  state.mode = 'settings';
  state.inputKind = 'create';
  state.inputBuf = '';
  state.message = '';
  ui.render();
}
function confirmDiscordId() {
  const raw = state.inputBuf.trim();
  state.mode = 'settings';
  state.inputKind = 'create';
  state.inputBuf = '';
  if (!raw) { state.message = ''; return ui.render(); }
  if (!/^\d{8,32}$/.test(raw)) {
    state.message = 'client id must be 8-32 digits';
    return ui.render();
  }
  state.discord.clientId = raw;
  config.saveSettings();
  discord.refreshPresence();
  state.message = 'discord client id saved';
  ui.render();
}

function settingsCycleTheme(d) {
  const i = THEME_NAMES.indexOf(state.theme);
  const next = THEME_NAMES[(i + d + THEME_NAMES.length) % THEME_NAMES.length];
  setTheme(next);
  const items = settingsItems();
  const idx = items.findIndex((it) => it.type === 'theme' && it.name === next);
  if (idx >= 0) state.settingsSel = idx;
  ui.render();
}

// live code preview under the logo, rendered in the theme under the cursor
// (or the active theme when the cursor is elsewhere) — scrolling themes
// previews each one without applying it. Lines stay short so the block also
// fits the narrow side panel.
const PREVIEW_LINES = [
  '// theme preview',
  'const total = sum(items, 42);',
  'function greet(name) {',
  '  return `hi, ${name}`;',
  '}',
  'if (enabled) launch(App);',
];

// highlighted sample code in an arbitrary theme (shared st across lines for
// multi-line constructs). Clips plain text first — never slice ANSI output.
function previewCodeLines(pvTheme, w) {
  const st = {};
  return PREVIEW_LINES.map((ln) => {
    const clip = ln.length > w ? ln.slice(0, w) : ln;
    return highlightCode(clip, 'js', pvTheme, st);
  });
}

function renderSettings() {
  const T = currentTheme();
  const { cols, rows } = ui.size();
  const items = settingsItems();
  if (state.settingsSel >= items.length) state.settingsSel = 0;

  let out = `${SYNC_ON}\x1b[?25l\x1b[H`; // atomic frame, no full-clear (avoids flicker)
  out += ui.wipeShrunk(rows);
  out += `\x1b[1;1H\x1b[2K${BOLD}${T.path}sabi settings${RESET}`;
  out += `\x1b[1;${Math.max(1, cols - 11)}H${T.counter}[theme ${THEME_NAMES.indexOf(state.theme) + 1}/${THEME_NAMES.length}]${RESET}`;

  // about block: version, description, author, os — sits under the header
  const infoLines = [
    `v${pkg.version || '?'} — ${pkg.description || 'sabi'}`,
    `by ${pkg.author || 'unknown'} · ${os.platform()} ${os.release()}`,
  ];
  infoLines.forEach((ln, i) => {
    const clip = ln.length > cols ? ln.slice(0, cols) : ln;
    out += `\x1b[${2 + i};1H\x1b[2K${T.status}${clip}${RESET}`;
  });
  const infoH = infoLines.length;

  // split-pane geometry: wide terminals put the logo + preview in the right
  // pane so the theme list gets the full height on the left (no dead space)
  const showSide = cols >= 80;
  const listW = showSide ? Math.max(38, Math.floor((cols - 3) / 2)) : cols;
  const rightX = listW + 3;
  const rightW = Math.max(1, cols - rightX + 1);

  // breathing room between the info block and the content below
  out += `\x1b[${2 + infoH};1H\x1b[2K`;

  // logo metrics (drawn after the list below, so the list's full-line
  // clears can't wipe it — it only clears to end-of-line from its column)
  const art = loadArt();
  const showArt = rows >= 20 && art.length > 0 && art.some((l) => l.length > 0);
  const artH = showArt ? art.length : 0;
  const artW = Math.max(0, ...art.map((l) => l.length));

  // preview target: the theme under the cursor, else the active theme —
  // scrolling previews each theme without applying it
  const hovered = items[state.settingsSel];
  const pvName = hovered && hovered.type === 'theme' && THEMES[hovered.name] ? hovered.name : state.theme;
  const pvTheme = THEMES[pvName] || T;
  // wide terminals get a side preview panel next to the list (the browse UI
  // is split-pane too); narrow ones keep the under-logo preview instead
  const showUnder = !showSide && rows >= 26 && cols >= 40;
  const previewW = showSide ? Math.min(48, rightW) : cols;
  const underLines = showUnder ? previewCodeLines(pvTheme, cols) : [];
  const previewH = showUnder ? underLines.length + 1 : 0;
  if (showUnder) {
    let pr = 3 + infoH + artH;
    out += `\x1b[${pr};1H\x1b[2K${T.status}preview · ${pvName}${RESET}`;
    underLines.forEach((hl, i) => {
      pr = 3 + infoH + artH + 1 + i;
      out += `\x1b[${pr};1H\x1b[2K${hl}${RESET}`;
    });
  }

  // side preview panel: title, sample code in the hovered theme, selection demo
  const sideBlock = [];
  if (showSide) {
    sideBlock.push(`${T.status}${(`preview · ${pvName}`).slice(0, previewW)}${RESET}`);
    sideBlock.push('');
    sideBlock.push(...previewCodeLines(pvTheme, previewW));
    sideBlock.push('');
    sideBlock.push(`${pvTheme.selBg}${pvTheme.selFg}${padVis(' selected text ', previewW)}${RESET}`);
  }

  // scrollable body: themes, toggles, then the command reference. In side
  // mode the list starts right under the info block (full height); the logo
  // lives in the right pane so nothing overlaps.
  const top = showSide ? 4 + infoH : 4 + infoH + artH + previewH;
  const bottom = rows - 1;
  const visN = Math.max(1, bottom - top + 1);
  if (state.settingsSel < state.settingsScroll) state.settingsScroll = state.settingsSel;
  if (state.settingsSel >= state.settingsScroll + visN) state.settingsScroll = state.settingsSel - visN + 1;

  let row = showSide ? 3 + infoH : 3 + infoH + artH + previewH;
  out += `\x1b[${row};1H\x1b[2K${T.status}theme · toggles · commands — j/k scrolls${RESET}`;

  const labelW = Math.max(10, Math.min(24, Math.floor(listW / 3)));
  const keyRows = items.filter((it) => it.type === 'key');
  const keyW = Math.min(24, Math.max(8, ...keyRows.map((it) => it.keys.length)));
  for (let i = 0; i < visN; i++) {
    const idx = state.settingsScroll + i;
    row = top + i;
    out += `\x1b[${row};1H\x1b[2K`;
    if (idx >= items.length) continue;
    const it = items[idx];
    const selected = idx === state.settingsSel;
    if (it.type === 'theme') {
      const th = THEMES[it.name];
      const active = it.name === state.theme;
      const cursor = selected ? '>' : ' ';
      const mark = active ? '●' : '○';
      // swatch rendered in the theme's own colors so you can compare
      const swatch = `${th.dir}dir/${RESET} ${th.str}"str"${RESET} ${th.kw}kw${RESET} ${th.num}42${RESET} ${th.comment}//c${RESET}`;
      let label = `${cursor} ${mark} ${it.name}`;
      // label is plain text, safe to slice; never slice the ANSI swatch
      if (label.length > labelW) label = label.slice(0, labelW - 1) + '…';
      else label = label.padEnd(labelW);
      const full = (labelW + 2 + stripAnsi(swatch).length <= listW) ? `${label}  ${swatch}` : label;
      if (selected) out += `${T.selBg}${T.selFg}${padVis(full, listW)}${RESET}`;
      else out += full;
      continue;
    }
    if (it.type === 'hl' || it.type === 'hidden' || it.type === 'ln' || it.type === 'pair' || it.type === 'discord' || it.type === 'discordId') {
      let label;
      if (it.type === 'ln') label = `line numbers: ${state.lineNumbers} (enter to cycle)`;
      else if (it.type === 'discord') {
        const on = !state.discord || state.discord.enabled !== false;
        label = `[${on ? 'x' : ' '}] discord rich presence`;
      } else if (it.type === 'discordId') {
        const id = (state.discord && state.discord.clientId) || '';
        label = `discord client id: ${id || 'not set'} (enter to edit)`;
      } else if (it.type === 'pair') {
        const p = editor.PAIRS.find((q) => q.key === it.key) || { open: '?', close: '?' };
        const on = !state.autoClose || state.autoClose[it.key] !== false;
        label = `[${on ? 'x' : ' '}] auto-close ${p.open}${p.close}`;
      }
      else {
        const on = it.type === 'hl' ? state.hl : state.showHidden;
        label = it.type === 'hl'
          ? `[${on ? 'x' : ' '}] syntax highlight`
          : `[${on ? 'x' : ' '}] show hidden files`;
      }
      if (selected) out += `${T.selBg}${T.selFg}${label.padEnd(listW)}${RESET}`;
      else out += label;
      continue;
    }
    if (it.type === 'head') {
      const head = `── ${it.text} ──`;
      if (selected) out += `${T.selBg}${T.selFg}${head.padEnd(listW)}${RESET}`;
      else out += `${T.status}${head}${RESET}`;
      continue;
    }
    // key reference row (plain data — safe to clip the description)
    const maxDl = Math.max(0, listW - (2 + keyW + 2));
    const dl = it.desc.length > maxDl ? it.desc.slice(0, Math.max(0, maxDl - 1)) + '…' : it.desc;
    if (selected) out += `${T.selBg}${T.selFg}${padVis(`  ${it.keys.padEnd(keyW)}  ${dl}`, listW)}${RESET}`;
    else out += `  ${WHITE}${it.keys.padEnd(keyW)}${RESET}  ${dl}`;
  }

  // logo, drawn after the list (its rows overlap the list's in side mode,
  // so drawing first would get wiped by the list's full-line clears). It
  // only clears to end-of-line from its own column, leaving the list intact.
  // In side mode it is left-aligned with the preview; otherwise centered.
  if (showArt) {
    const ax = showSide ? rightX : Math.max(1, Math.floor((cols - artW) / 2) + 1);
    const maxW = showSide ? rightW : cols;
    art.forEach((ln, i) => {
      const r = 3 + infoH + i;
      out += `\x1b[${r};${ax}H\x1b[K`;
      if (ln.length) {
        const line = ln.length > maxW ? ln.slice(0, maxW) : ln;
        out += `${T.fn}${line}${RESET}`;
      }
    });
  }

  // side preview panel + divider, drawn after the list (separate columns,
  // so ordering vs list rows doesn't matter). The preview starts below the
  // logo; when the logo is hidden it starts at the top.
  const pvTop = top + (showArt ? artH + 1 : 0);
  if (showSide) {
    for (let r = top; r <= bottom; r++) {
      out += `\x1b[${r};${listW + 1}H${T.divider}│${RESET}`;
      const cell = r >= pvTop ? sideBlock[r - pvTop] : null;
      // \x1b[K: the title varies in length with the theme name, so a shorter
      // title must erase a longer one from the previous frame
      if (cell) out += `\x1b[${r};${rightX}H\x1b[K${cell}`;
    }
  }

  const help = 'j/k move · enter select · h/l prev/next theme · s/esc close';
  const msg = state.message || help;
  out += `\x1b[${rows};1H\x1b[2K${T.status}${msg.slice(0, cols)}${RESET}`;
  process.stdout.write(out + SYNC_OFF);
}

Object.assign(module.exports, { settingsItems, openSettings, closeSettings, settingsMove, settingsActivate, settingsCycleTheme, renderSettings, loadArt, openDiscordId, cancelDiscordId, confirmDiscordId });
