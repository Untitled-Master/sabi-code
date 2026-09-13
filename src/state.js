// Shared mutable app state (singletons — always require by reference).
const state = {
  cwd: process.cwd(),
  entries: [],
  sel: 0,
  scroll: 0,
  showHidden: true,
  showFiles: true, // left files pane visible (ctrl-b toggles)
  hl: true,
  autoClose: { parens: true, braces: true, brackets: true, dquote: true, squote: true },
  lineNumbers: 'off', // 'off' | 'normal' | 'relative'
  theme: 'sabi',
  mode: 'browse', // 'browse' | 'settings' | 'input' | 'edit' | 'grep'
  settingsSel: 0,
  settingsScroll: 0,
  inputBuf: '',
  inputKind: 'create', // 'create' | 'discordId' — which prompt owns input mode
  discord: { enabled: true, clientId: '' },
  message: '',
  dialog: null, // modal confirm: { kind: 'delete', name, full, isDir }
  grep: null, // project search: { phase: 'input'|'results', buf, query, results, sel, scroll }
  git: null, // git view: { root, sel, scroll, data }
};

// Built-in editor buffer (only meaningful when state.mode === 'edit').
const edit = { file: null, lines: [], row: 0, col: 0, scroll: 0, colOff: 0, dirty: false, confirmDiscard: false, anchor: null, clip: '', undo: [], find: null };

module.exports = { state, edit };
