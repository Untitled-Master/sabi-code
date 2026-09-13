// Discord Rich Presence over the local Discord client IPC socket.
// Pure node:net stdlib — no new dependencies. Everything is best-effort:
// no Discord running / no client id => silently idle, never throws.
// NOTE: requires nothing at load time except state (safe for editor.js and
// explorer.js to require; see the UI-cluster convention in src/index.js).
const net = require('node:net');
const path = require('node:path');
const { state, edit } = require('./state');

const OPCodes = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const APP_IMAGE = 'sabi';
const APP_TEXT = 'sabi - code';
// built-in fallback so presence works with zero setup; env or config wins
const BUILTIN_CLIENT_ID = '1547981639693504543';
const RETRY_MS = 10000;
const CONNECT_GAP_MS = 5000;
const SEND_GAP_MS = 2000;

let sock = null;
let connected = false;
let recvBuf = Buffer.alloc(0);
let retryTimer = null;
let laterTimer = null;
let lastAttempt = 0;
let lastSend = 0;
let curKey = '';
let curStart = 0;
let lastSentKey = '';
let nonce = 0;

function effectiveClientId() {
  return process.env.SABI_DISCORD_CLIENT_ID
    || (state.discord && state.discord.clientId)
    || BUILTIN_CLIENT_ID;
}
function presenceWanted() {
  return (!state.discord || state.discord.enabled !== false) && !!effectiveClientId();
}

// what the user is doing, as plain data (no module access — testable)
function ctxOf(mode, file, cwd) {
  return { mode, file, cwd };
}
function ctxKey(c) {
  return c.mode === 'edit' && c.file ? `edit:${c.file}` : `browse:${c.cwd}`;
}
// extension -> [art-asset key, hover text] for the small language icon.
// Each key needs a matching upload (Rich Presence -> Art Assets) or Discord
// silently drops just the icon — presence itself keeps working.
const LANG_ICONS = {
  js: ['lang_javascript', 'JavaScript'],
  mjs: ['lang_javascript', 'JavaScript'],
  cjs: ['lang_javascript', 'JavaScript'],
  jsx: ['lang_react', 'React'],
  ts: ['lang_typescript', 'TypeScript'],
  mts: ['lang_typescript', 'TypeScript'],
  cts: ['lang_typescript', 'TypeScript'],
  tsx: ['lang_react', 'React'],
  json: ['lang_json', 'JSON'],
  jsonc: ['lang_json', 'JSON'],
  py: ['lang_python', 'Python'],
  pyw: ['lang_python', 'Python'],
  go: ['lang_go', 'Go'],
  rs: ['lang_rust', 'Rust'],
  c: ['lang_c', 'C'],
  h: ['lang_c', 'C'],
  cpp: ['lang_cpp', 'C++'],
  hpp: ['lang_cpp', 'C++'],
  cc: ['lang_cpp', 'C++'],
  cs: ['lang_csharp', 'C#'],
  java: ['lang_java', 'Java'],
  kt: ['lang_kotlin', 'Kotlin'],
  swift: ['lang_swift', 'Swift'],
  php: ['lang_php', 'PHP'],
  rb: ['lang_ruby', 'Ruby'],
  pl: ['lang_perl', 'Perl'],
  dart: ['lang_dart', 'Dart'],
  scala: ['lang_scala', 'Scala'],
  sh: ['lang_shell', 'Shell'],
  bash: ['lang_shell', 'Shell'],
  zsh: ['lang_shell', 'Shell'],
  fish: ['lang_shell', 'Shell'],
  sql: ['lang_sql', 'SQL'],
  css: ['lang_css', 'CSS'],
  scss: ['lang_css', 'CSS'],
  less: ['lang_css', 'CSS'],
  html: ['lang_html', 'HTML'],
  xml: ['lang_html', 'HTML'],
  vue: ['lang_vue', 'Vue'],
  svelte: ['lang_svelte', 'Svelte'],
  md: ['lang_markdown', 'Markdown'],
  markdown: ['lang_markdown', 'Markdown'],
  yaml: ['lang_yaml', 'YAML'],
  yml: ['lang_yaml', 'YAML'],
  toml: ['lang_toml', 'TOML'],
  ini: ['lang_ini', 'INI'],
  cfg: ['lang_ini', 'INI'],
  conf: ['lang_ini', 'INI'],
};
function langIconOf(file) {
  const ext = path.extname(file || '').toLowerCase().slice(1);
  if (ext && LANG_ICONS[ext]) return LANG_ICONS[ext];
  const base = path.basename(file || '').toLowerCase();
  if (base === 'dockerfile') return ['lang_docker', 'Docker'];
  if (base === 'makefile' || base === 'justfile') return ['lang_makefile', 'Makefile'];
  return null;
}

// details = file, state = project, timestamps = elapsed time
function buildActivity(c, startSec) {
  const project = path.basename(c.cwd) || c.cwd;
  const editing = c.mode === 'edit' && c.file;
  const assets = { large_image: APP_IMAGE, large_text: APP_TEXT };
  if (editing) {
    const icon = langIconOf(c.file);
    if (icon) {
      assets.small_image = icon[0];
      assets.small_text = icon[1];
    }
  }
  return {
    details: editing ? path.basename(c.file) : 'Browsing files',
    state: project,
    timestamps: { start: startSec },
    assets,
    instance: false,
  };
}

// frame: int32LE op + int32LE len + payload
function encodeFrame(op, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(payload.length, 4);
  return Buffer.concat([head, payload]);
}
// parse one frame from the head of buf; null when incomplete
function decodeFrame(buf) {
  if (buf.length < 8) return null;
  const op = buf.readInt32LE(0);
  const len = buf.readInt32LE(4);
  if (len < 0 || len > 16 * 1024 * 1024) return { op, error: 'bad-length' };
  if (buf.length < 8 + len) return null;
  let json = null;
  try { json = JSON.parse(buf.slice(8, 8 + len).toString('utf8')); } catch { /* keep null */ }
  return { op, json, rest: buf.slice(8 + len) };
}

function ipcPaths() {
  const out = [];
  if (process.platform === 'win32') {
    for (let i = 0; i < 10; i++) out.push(`\\\\?\\pipe\\discord-ipc-${i}`);
  } else {
    const dirs = [process.env.XDG_RUNTIME_DIR, process.env.TMPDIR, '/tmp'].filter(Boolean);
    const seen = new Set();
    for (const d of dirs) {
      if (seen.has(d)) continue;
      seen.add(d);
      for (let i = 0; i < 10; i++) out.push(path.join(d, `discord-ipc-${i}`));
    }
  }
  return out;
}

function later(ms, fn) {
  const t = setTimeout(() => {
    if (t === retryTimer) retryTimer = null;
    if (t === laterTimer) laterTimer = null;
    fn();
  }, ms);
  if (t.unref) t.unref();
  return t;
}
function scheduleRetry() {
  if (retryTimer || sock) return;
  if (!presenceWanted()) return;
  retryTimer = later(RETRY_MS, () => { refreshPresence(); });
}

function writeFrame(op, data) {
  if (!sock) return false;
  try {
    sock.write(encodeFrame(op, data));
    return true;
  } catch {
    drop();
    return false;
  }
}
function drop() {
  if (sock) { try { sock.destroy(); } catch {} }
  sock = null;
  connected = false;
  recvBuf = Buffer.alloc(0);
  scheduleRetry();
}

function onData(chunk) {
  recvBuf = Buffer.concat([recvBuf, chunk]);
  for (;;) {
    const f = decodeFrame(recvBuf);
    if (!f) return;
    if (f.error) return drop();
    recvBuf = f.rest;
    if (f.op === OPCodes.PING) { writeFrame(OPCodes.PONG, f.json || {}); continue; }
    if (f.op === OPCodes.CLOSE) return drop();
    if (f.op !== OPCodes.FRAME && f.op !== OPCodes.HANDSHAKE) continue;
    if (f.json && f.json.cmd === 'DISPATCH' && f.json.evt === 'READY') {
      connected = true;
      if (curKey && curKey !== lastSentKey) sendActivity(curKey);
    }
  }
}

function sendHandshake() {
  writeFrame(OPCodes.HANDSHAKE, { v: 1, client_id: effectiveClientId() });
}
function sendActivity(key) {
  const activity = buildActivity(
    ctxOf(state.mode, edit.file, state.cwd),
    curStart || Math.floor(Date.now() / 1000)
  );
  if (!writeFrame(OPCodes.FRAME, {
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity },
    nonce: String(++nonce),
  })) return;
  lastSend = Date.now();
  lastSentKey = key;
}

function tryConnect() {
  if (sock) return;
  const now = Date.now();
  if (now - lastAttempt < CONNECT_GAP_MS) return scheduleRetry();
  lastAttempt = now;
  const paths = ipcPaths();
  let i = 0;
  const attempt = () => {
    if (sock || i >= paths.length) return scheduleRetry();
    let s;
    try {
      s = net.createConnection(paths[i++]);
    } catch {
      return attempt();
    }
    const onErr = () => { try { s.destroy(); } catch {} attempt(); };
    s.once('error', onErr);
    s.once('connect', () => {
      s.removeListener('error', onErr);
      if (sock) { try { s.destroy(); } catch {} return; }
      sock = s;
      recvBuf = Buffer.alloc(0);
      s.on('data', onData);
      s.once('close', drop);
      s.once('error', drop);
      sendHandshake();
    });
  };
  attempt();
}

// Recompute what should be shown and sync it to Discord. Cheap (string
// compare) when nothing changed, throttled + deduped when it did — call it
// liberally from editOpen/editExit/loadDir.
function refreshPresence() {
  if (!presenceWanted()) {
    if (sock) stopPresence();
    return;
  }
  const key = ctxKey(ctxOf(state.mode, edit.file, state.cwd));
  if (key !== curKey) {
    curKey = key;
    curStart = Math.floor(Date.now() / 1000); // elapsed-time clock restarts here
  }
  if (!connected) { tryConnect(); return; }
  if (key === lastSentKey) return;
  if (Date.now() - lastSend < SEND_GAP_MS) {
    if (!laterTimer) laterTimer = later(SEND_GAP_MS, () => { refreshPresence(); });
    return;
  }
  sendActivity(key);
}

function stopPresence() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (laterTimer) { clearTimeout(laterTimer); laterTimer = null; }
  if (sock && connected) {
    try {
      sock.write(encodeFrame(OPCodes.FRAME, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: null },
        nonce: String(++nonce),
      }));
    } catch {}
  }
  if (sock) { try { sock.destroy(); } catch {} }
  sock = null;
  connected = false;
  recvBuf = Buffer.alloc(0);
  lastSentKey = '';
  curKey = '';
}

Object.assign(module.exports, {
  OPCodes, APP_IMAGE, APP_TEXT, LANG_ICONS, refreshPresence, stopPresence,
  effectiveClientId, presenceWanted, ctxOf, ctxKey, buildActivity, langIconOf,
  encodeFrame, decodeFrame, ipcPaths,
});
