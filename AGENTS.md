# AGENTS.md — sabi (minimal vim-like explorer/editor)

Pure Node.js stdlib, CommonJS (`"type": "commonjs"`). Zero dependencies, no build, no tests, no lint/CI.

## Run

- `node bin/sabi.js [dir|file]` — TTY app; pipes/non-TTY just list dir entries (`src/main.js:54`).
- `node bin/sabi.js --list-themes` / `--theme <name>` / `settings` (`-s`) — non-interactive CLI paths.
- `SABI_CONFIG=/tmp/x.json node bin/sabi.js` — override config path (default `~/.sabi.json`).
- `npm test` is a placeholder that always fails — do not use for verification.

## Structure (`src/`)

- `index.js` — public API re-export only; `bin/sabi.js` just calls `api.main()`.
- `main.js` — CLI parsing + `onKey`/`feedKey` dispatch. `state.mode` routes: `browse|settings|input|edit|grep`.
- `state.js` — shared mutable singletons (`state`, `edit`); always require by reference.
- `explorer.js` / `editor.js` / `settings.js` / `ui.js` / `create.js` — UI cluster.
- `config.js` — `~/.sabi.json` load/save (`theme, showHidden, showFiles, hl, lineNumbers`).
- `themes/` + `highlight/` — theming and per-language syntax highlighting.

## Gotchas (agent would miss)

- Cyclic requires are intentional: UI-cluster modules require each other but MUST only call cross-module functions at runtime, never at load time, and MUST extend exports via `Object.assign(module.exports, …)`, never reassign (see `src/index.js:1-6`). Breaking either rule yields partially-initialized exports.
- ESC handling: lone ESC is delayed 60ms in `feedKey` (`src/main.js:75-97`) to recombine split escape sequences — don't "fix" the delay.
- Editor refuses files >512KB or >10000 lines and NUL-containing (binary) buffers (`src/editor.js:15-34`).
- Highlight: pass one shared `st = {}` across consecutive lines for block comments/fences; fresh object per file (`src/highlight/index.js:3-4`).
- New theme: drop file in `src/themes/` + register in `THEMES` map (`src/themes/index.js`); must define ALL keys: `dir,file,link,exec,selBg,selFg,path,counter,status,divider + syntax: comment,str,num,kw,fn,type,bool,prop,pun` — partial themes render broken colors silently.
- Global keys: `ctrl-b` toggles pane in every mode; dialogs capture all keys (`src/main.js:99-107`).
