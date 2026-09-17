// Shared mutable app state (singletons — always require by reference).
const state = {
  cwd: process.cwd(),
  entries: [],
  sel: 0,
  scroll: 0,
  showHidden: true,
  showFiles: true, // left files pane visible (ctrl-b toggles)
  showIcons: true, // legacy master toggle (false forces icons off)
  iconStyle: process.platform === 'win32' ? 'badge' : 'nerd', // 'nerd' | 'badge' | 'off'
  hl: true,
  autoClose: { parens: true, braces: true, brackets: true, dquote: true, squote: true },
  lineNumbers: 'off', // 'off' | 'normal' | 'relative'
  theme: 'sabi',
  mode: 'browse', // 'browse' | 'settings' | 'input' | 'edit' | 'grep' | 'git' | 'term'
  settingsSel: 0,
  settingsScroll: 0,
  inputBuf: '',
  inputKind: 'create', // 'create' | 'discordId' — which prompt owns input mode
  discord: { enabled: true, clientId: '' },
  message: '',
  dialog: null, // modal confirm: { kind: 'delete', name, full, isDir }
  grep: null, // project search: { phase: 'input'|'results', buf, query, results, sel, scroll }
  git: null, // git view: { root, sel, scroll, data }
  term: null, // embedded shell pane (ctrl-t): { open, lines, buf, col, hist, ... } — see term.js
};

// Built-in editor buffer (only meaningful when state.mode === 'edit').
// Multi-tab: `tabs` holds every open tab (same shape as the active buffer
// minus clip/tabs/tabIdx, which stay global), `tabIdx` is the active index
// (-1 when nothing is open). The top-level fields mirror the active tab so
// existing buffer code keeps working; editor.js syncs them on switch/save.
const edit = { file: null, lines: [], row: 0, col: 0, scroll: 0, colOff: 0, dirty: false, confirmDiscard: false, anchor: null, clip: '', undo: [], find: null, tabs: [], tabIdx: -1 };

module.exports = { state, edit };
