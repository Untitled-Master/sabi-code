// ANSI escapes + tiny color helpers shared across the codebase.
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const NONE = '';
const WHITE = '\x1b[97m'; // regular filenames are always bright white
const REV = '\x1b[7m'; // block cursor in edit mode
const UNDER = '\x1b[4m'; // non-current find matches
// synchronized output: terminal buffers the frame and paints it atomically,
// so big panes never show torn half-frames (ignored if unsupported)
const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';

function hexRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexFg = (h) => { const [r, g, b] = hexRgb(h); return `\x1b[38;2;${r};${g};${b}m`; };
const hexBg = (h) => { const [r, g, b] = hexRgb(h); return `\x1b[48;2;${r};${g};${b}m`; };
function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }
function padVis(s, w) { const v = stripAnsi(s).length; return v >= w ? s : s + ' '.repeat(w - v); }

module.exports = { RESET, BOLD, DIM, NONE, WHITE, REV, UNDER, SYNC_ON, SYNC_OFF, hexRgb, hexFg, hexBg, stripAnsi, padVis };
