// Persistent settings (~/.sabi.json, override via SABI_CONFIG).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { state } = require('./state');
const { THEMES, THEME_NAMES } = require('./themes');
const editor = require('./editor');

function configPath() {
  return process.env.SABI_CONFIG || path.join(os.homedir(), '.sabi.json');
}
function loadSettings() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const cfg = JSON.parse(raw);
    if (typeof cfg.showHidden === 'boolean') state.showHidden = cfg.showHidden;
    if (typeof cfg.showFiles === 'boolean') state.showFiles = cfg.showFiles;
    if (typeof cfg.showIcons === 'boolean') state.showIcons = cfg.showIcons;
    if (typeof cfg.iconStyle === 'string' && ['nerd', 'badge', 'off'].includes(cfg.iconStyle)) state.iconStyle = cfg.iconStyle;
    else if (cfg.showIcons === false) state.iconStyle = 'off'; // legacy config
    if (typeof cfg.hl === 'boolean') state.hl = cfg.hl;
    if (typeof cfg.theme === 'string' && THEMES[cfg.theme]) state.theme = cfg.theme;
    if (typeof cfg.lineNumbers === 'string' && editor.LN_MODES.includes(cfg.lineNumbers)) state.lineNumbers = cfg.lineNumbers;
    if (cfg.discord && typeof cfg.discord === 'object') {
      if (typeof cfg.discord.enabled === 'boolean') state.discord.enabled = cfg.discord.enabled;
      if (typeof cfg.discord.clientId === 'string') state.discord.clientId = cfg.discord.clientId;
    }
    if (cfg.autoClose && typeof cfg.autoClose === 'object') {
      for (const p of editor.PAIRS) {
        if (typeof cfg.autoClose[p.key] === 'boolean') state.autoClose[p.key] = cfg.autoClose[p.key];
      }
    }
  } catch {}
}
function saveSettings() {
  try {
    fs.writeFileSync(
      configPath(),
      JSON.stringify({ theme: state.theme, showHidden: state.showHidden, showFiles: state.showFiles, showIcons: state.iconStyle !== 'off', iconStyle: state.iconStyle, hl: state.hl, autoClose: state.autoClose, discord: state.discord, lineNumbers: state.lineNumbers }, null, 2)
    );
  } catch (e) {
    state.message = `cannot save settings: ${String(e.message).split('\n')[0]}`;
  }
}
function setTheme(name) {
  if (!THEMES[name]) {
    state.message = `unknown theme: ${name} (try: ${THEME_NAMES.join(', ')})`;
    return false;
  }
  state.theme = name;
  saveSettings();
  return true;
}

Object.assign(module.exports, { configPath, loadSettings, saveSettings, setTheme });
