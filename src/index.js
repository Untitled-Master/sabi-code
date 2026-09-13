// Public API: everything tests and external tools may import.
// UI-cluster modules (explorer/editor/settings/ui/create/main) require each
// other — safe under CommonJS because (a) cross-module calls happen at
// runtime, never at load time, and (b) those modules mutate module.exports
// via Object.assign instead of reassigning it, so cyclic importers always see
// the final exports object. Keep both rules when adding modules.
const { state, edit } = require('./state');
const ansi = require('./ansi');
const themes = require('./themes');
const highlight = require('./highlight');
const { langOf, commentOf } = require('./highlight/lang');
const { matchQuote, matchJsx, scanLine } = require('./highlight/scan');
const { codeRegex } = require('./highlight/code');
const config = require('./config');
const explorer = require('./explorer');
const editor = require('./editor');
const create = require('./create');
const grep = require('./grep');
const git = require('./git');
const settings = require('./settings');
const discord = require('./discord');
const ui = require('./ui');
const main = require('./main');

module.exports = {
  // state
  state, edit,
  // ansi
  WHITE: ansi.WHITE,
  // themes
  THEMES: themes.THEMES,
  THEME_NAMES: themes.THEME_NAMES,
  currentTheme: themes.currentTheme,
  // highlight
  highlight: highlight.highlight,
  langOf, commentOf, matchQuote, matchJsx, scanLine, codeRegex,
  // config
  configPath: config.configPath,
  loadSettings: config.loadSettings,
  saveSettings: config.saveSettings,
  setTheme: config.setTheme,
  // explorer
  loadDir: explorer.loadDir,
  firstContentIndex: explorer.firstContentIndex,
  toggleFiles: explorer.toggleFiles,
  requestDelete: explorer.requestDelete,
  confirmDialog: explorer.confirmDialog,
  cancelDialog: explorer.cancelDialog,
  requestQuit: explorer.requestQuit,
  dialogKey: explorer.dialogKey,
  // editor
  editOpen: editor.editOpen,
  editKey: editor.editKey,
  editSave: editor.editSave,
  editExit: editor.editExit,
  sliceVis: editor.sliceVis,
  drawEditLine: editor.drawEditLine,
  computeHlState: editor.computeHlState,
  LN_MODES: editor.LN_MODES,
  PAIRS: editor.PAIRS,
  pairEnabled: editor.pairEnabled,
  editAutoClose: editor.editAutoClose,
  editGutterWidth: editor.editGutterWidth,
  editGutter: editor.editGutter,
  selActive: editor.selActive,
  editSelectAll: editor.editSelectAll,
  editCopy: editor.editCopy,
  editCut: editor.editCut,
  editPaste: editor.editPaste,
  applySel: editor.applySel,
  pushUndo: editor.pushUndo,
  editUndo: editor.editUndo,
  isWordChar: editor.isWordChar,
  wordForward: editor.wordForward,
  wordBackward: editor.wordBackward,
  editWordSelect: editor.editWordSelect,
  editLineSelect: editor.editLineSelect,
  // create
  openCreate: create.openCreate,
  cancelCreate: create.cancelCreate,
  confirmCreate: create.confirmCreate,
  // project search
  grepOpen: grep.grepOpen,
  grepExit: grep.grepExit,
  grepKey: grep.grepKey,
  grepRun: grep.grepRun,
  grepWalk: grep.grepWalk,
  grepOpenMatch: grep.grepOpenMatch,
  // git changes view
  gitOpen: git.gitOpen,
  gitExit: git.gitExit,
  gitKey: git.gitKey,
  gitActivate: git.gitActivate,
  gitCheckout: git.gitCheckout,
  reloadGit: git.reloadGit,
  renderGit: git.renderGit,
  // settings
  settingsItems: settings.settingsItems,
  settingsActivate: settings.settingsActivate,
  loadArt: settings.loadArt,
  // discord rich presence
  refreshPresence: discord.refreshPresence,
  stopPresence: discord.stopPresence,
  buildActivity: discord.buildActivity,
  effectiveClientId: discord.effectiveClientId,
  // ui
  render: ui.render,
  // main
  main: main.main,
  onKey: main.onKey,
  feedKey: main.feedKey,
};
