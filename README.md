# sabi — minimal vim-like explorer/editor

Fast, zero-dependency terminal file explorer + editor. Pure Node.js stdlib, CommonJS, no build step.

## Screenshots

| Browse | Edit |
| --- | --- |
| ![browse](assets/screenshots/browse.png) | ![edit](assets/screenshots/edit.png) |
| *Split-pane explorer (left) + preview (right)* | *Built-in editor with syntax highlight + statusline* |

| Settings / Themes | Git view |
| --- | --- |
| ![settings](assets/screenshots/settings.png) | ![git](assets/screenshots/git.png) |
| *`s` opens theme picker with live preview, toggles, key reference* | *`ctrl-g` — branches, commits, diffs, stage/unstage* |


## Features

- Split-pane explorer: file list (left) + live preview (right)
- Built-in editor: save, undo, selection/clipboard, auto-close pairs, find in file, tabs→spaces
- Autocomplete: member suggestions after `.`, word suggestions while typing, `ctrl-o` manual (`enter`/`tab` accept, `esc` dismiss)
- Multiple tabs (top bar): `ctrl-n` / `ctrl-shift-t` new empty tab, `shift+tab` cycle, `shift+1..9` / `alt+1..9` jump, `ctrl-w` close
- Project search (`ctrl+alt+f`): skips `.git`/`node_modules`/binaries, capped at 500 matches
- Git view (`ctrl-g`): branches, commits, per-file `+/-`, diffs, checkout, stage/unstage
- 20 themes with live preview, syntax highlight toggle
- File-type icons (`ts`/`js`/`py`…): `nerd` glyphs or `badge` tags + SVGs in `assets/icons` (cycle in settings; Windows defaults to `badge`)
- Line numbers: `off` / `normal` / `relative`
- Hidden files toggle, files-pane toggle, create file/folder, delete with confirm
- Git badge in status bar (`owner/repo@branch*`)
- Discord Rich Presence (opt-in, custom client id)
- Non-TTY fallback: pipes just list dir entries
- Editor limits: refuses >512KB, >10000 lines, or NUL-containing (binary) files

## Install

Requires Node.js 18+ (stdlib only, no deps).

```sh
git clone https://github.com/Untitled-Master/sabi-code sabi
cd sabi
# run directly
node bin/sabi.js [dir|file]

# optional: link globally
npm link
sabi [dir|file]
```

## Usage

```sh
node bin/sabi.js [dir|file]   # open dir (default: cwd)
node bin/sabi.js --list-themes
node bin/sabi.js --theme <name>
node bin/sabi.js settings     # or -s / --settings, opens settings first
SABI_CONFIG=/tmp/x.json node bin/sabi.js  # override config path (default ~/.sabi.json)
```

Piped / non-TTY just prints entries:

```sh
node bin/sabi.js | head
```

## Keybindings

### Browse

| Keys | Action |
| --- | --- |
| `j / k`, `↑ / ↓` | move |
| `enter / l / →` | open |
| `h / ← / backspace` | up a folder |
| `g / G` | first / last |
| `e` | edit file |
| `n` | new file / folder (end with `/` for folder) |
| `a / .` | hidden files |
| `s` | settings |
| `r` | reload |
| `q` | quit |
| `esc` | quit (asks first) |
| `ctrl-b` | files pane toggle |
| `ctrl-d` | delete (asks first) |
| `ctrl+alt+f` | search all files |
| `ctrl-g` | git changes |
| `ctrl-t` | terminal pane (lower half of preview) |
| `ctrl-shift-t` | new empty tab (`enter` on a file fills it) |
| `ctrl-n` | new empty tab (`enter` on a file fills it) |
| `shift+tab` | cycle tabs |
| `shift+1..9` | jump to tab |
| `ctrl-w` | close tab (twice discards unsaved) |

### Edit

| Keys | Action |
| --- | --- |
| type (paste works) | insert |
| `backspace / del` | delete |
| `enter` | new line |
| `tab` | indent (2 spaces) |
| `() {} [] '' ""` | auto-close (per-pair toggle in settings) |
| `arrows` | move |
| `home / end` | line start / end |
| `pgup / pgdn` | scroll page |
| `ctrl-s` | save |
| `ctrl-a` | select all |
| `ctrl-c` | copy (whole line when no selection) |
| `ctrl-x` | cut (whole line when no selection) |
| `ctrl-v` | paste |
| `ctrl-z` | undo (100 steps) |
| `ctrl-u` | select word / grow by word |
| `ctrl-l` | select line / grow by line |
| `ctrl-f` | find in file (`enter` next, `esc` close) |
| `ctrl-o` | autocomplete (manual trigger) |
| `alt-e / alt-E` | next / previous problem |
| `shift+arrows` | extend selection |
| `shift+home/end` | to line ends |
| `ctrl+shift+arrows` | extend by word / line |
| `ctrl+left/right` | jump by word |
| `ctrl+up/down` | jump half page |
| `ctrl+home/end` | top / bottom |
| `ctrl-t` | terminal pane |
| `ctrl-shift-t` | new empty tab |
| `ctrl-n` | new empty tab |
| `shift+tab` | cycle tabs |
| `alt+1..9` | jump to tab |
| `ctrl-w` | close tab (twice discards unsaved) |
| `esc` | exit to explorer, tabs kept (twice when unsaved) |

### Project search

| Keys | Action |
| --- | --- |
| type + `enter` | run search |
| `j / k` | move |
| `enter` | open match (jumps to exact spot) |
| `esc` | back |

### Git view

| Keys | Action |
| --- | --- |
| `j / k` | move |
| `enter / space` | checkout branch / open diff |
| `l` | focus diff |
| `e` | edit file |
| `s / u` | stage / unstage |
| `r` | reload |
| `q / esc` | back |

### Settings / dialogs

| Keys | Action |
| --- | --- |
| `j / k` | move |
| `enter / space` | select |
| `h / l` | prev / next theme |
| `s / esc` | close |
| `y / enter` → yes, `n / esc` → no | delete dialog |
| `enter` confirm, `esc` cancel | new file/folder input |

## Autocomplete

Typing `.` after a name suggests its methods (`user.` → `name`, `age`, …); typing 2+ word characters suggests keywords, buffer symbols, and words; `ctrl-o` triggers manually. Inside import strings (`from "./…`) it suggests file paths (`tab` on a folder drills in); `app.` after `import app from './app'` lists that file's exports (named/default/CJS/`__all__`, one re-export hop). Keep typing to filter, `up`/`down` to pick, `enter`/`tab` to accept, `esc` to dismiss. Suggestions combine built-in members (JS/TS: `String`/`Array`/`console`/`fs`/…, Python: `str`/`list`/`os`/`sys`/…) with types inferred from your code (`s = "…"` → string methods) and names used in the file. Static and offline — no language server.

## Problems

Type errors underline in red as you type (`num: number = "hi"` → `Type 'string' is not assignable to type 'number'`), `const` reassignment, duplicate declarations, and unbalanced brackets too. Put the cursor on one and the status bar shows its message (the hover); the bar also counts problems; `alt-e` / `alt-E` jump to the next / previous one. Annotations it can't verify (custom classes, function calls, `any`) are left alone — no guessing, no false positives.

## Terminal

<code>ctrl-t</code> opens an embedded shell in the lower half of the right pane (PowerShell on Windows, `$SHELL` elsewhere): prompt shows the shell's dir (`D:\proj>`), type a command + `enter` to run it. History (`up`/`down`), path completion (`tab`), output scroll (`pgup`/`pgdn`), `ctrl-c` stops a running command, `ctrl-l` clears, `esc` back to files, `exit` or <code>ctrl-t</code> closes. The `>` turns red after a failed command. Works from the file list and while typing in the editor. (`ctrl-shift-t` opens a new tab instead, but only fires where the terminal reports it distinctly from `ctrl-t` — Kitty-protocol mode.)

Pipe mode, not a full PTY (zero-dependency rule): single-line commands only, and full-screen TUIs (`vim`, `ssh`, …) won't work inside it.

## Themes

20 built-in: `sabi`, `dracula`, `nord`, `gruvbox`, `monokai`, `tokyo-night`, `catppuccin`, `solarized-dark`, `solarized-light`, `light`, `mono`, `ocean`, `cursor-dark`, `cursor-light`, `github-dark`, `github-light`, `claude-dark`, `claude-light`, `codex-dark`, `codex-light`.

Add one: drop a file in `src/themes/` + register in `THEMES` map in `src/themes/index.js`. Must define all keys: `dir,file,link,exec,selBg,selFg,path,counter,status,divider` + `syntax: comment,str,num,kw,fn,type,bool,prop,var,pun` — partial themes render broken colors silently.

Syntax highlight covers: `js/ts/jsx/tsx/json`, `py`, `go`, `rust`, `c/h/cpp/java/cs/kt/swift/php/dart/scala/rb/pl`, `sh/bash/zsh/fish`, `sql`, `css/scss/less`, `html/xml/vue/svelte`, `md`, `yaml`, `toml/ini/cfg/conf`.

## Icons

Two styles, cycled with `enter` on the `icons:` row in settings (`s`):

- `nerd` — file logos via Nerd Font glyphs (terminal font must be a Nerd Font)
- `badge` — plain-ASCII tags (`TS`, `JS`, `PY`, `DIR`) in brand colors, renders in any font
- `off` — no icons

Windows defaults to `badge`: stock console fonts (Consolas, Lucida Console) have no Nerd Font glyphs, so `nerd` shows boxes there (your screenshot = missing glyphs, not a bug). For the full logos on Windows:

1. Install a Nerd Font: `oh-my-posh font install meslo`, or download Cascadia Code NF / CaskaydiaCove NF from nerdfonts.com and install it.
2. Windows Terminal → Settings (`Ctrl+,`) → your profile → Appearance → Font face → pick the Nerd Font → Save, then restart the terminal.
3. Switch sabi to `nerd` in settings. Still boxes? The font isn't applied — repeat step 2 for every profile/terminal you use (VS Code: `Terminal › Integrated: Font Family`).

Legacy `powershell.exe` (conhost) only lists monospace fonts under Properties → Font — Windows Terminal is the smoother path.

## Config

`~/.sabi.json` (or `$SABI_CONFIG`):

```json
{
  "theme": "sabi",
  "showHidden": true,
  "showFiles": true,
  "showIcons": true,
  "iconStyle": "badge",
  "hl": true,
  "lineNumbers": "off",
  "autoClose": { "parens": true, "braces": true, "brackets": true, "dquote": true, "squote": true },
  "discord": { "enabled": true, "clientId": "" }
}
```

Logo on the settings page is `assets/logo.txt` (plain text, reloaded on open).

## Structure

```
bin/sabi.js      # launcher only, calls api.main()
src/
  index.js       # public API re-export only
  main.js        # CLI parsing + onKey/feedKey dispatch (browse|settings|input|edit|grep|git)
  state.js       # shared mutable singletons (state, edit)
  explorer.js / editor.js / settings.js / ui.js / create.js / grep.js / git.js
  config.js      # ~/.sabi.json load/save
  icons.js       # file-type icons (nerd/badge styles + assets/icons/*.svg)
  themes/ + highlight/  # theming + per-language highlighting
assets/
  logo.txt
  icons/         # svg file icons (ts, js, python, …)
  screenshots/   # place browse.png, edit.png, settings.png, git.png, search.png here
```

Note: `npm test` is a placeholder that always fails — do not use for verification.

## License

ISC — see `package.json` (`Ahmed Belmehnouf`).
