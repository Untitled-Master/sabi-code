// no-color theme: shape (bold/dim/reverse) carries meaning, not hue.
const { NONE, DIM, BOLD } = require('../ansi');

module.exports = {
  dir: NONE, file: NONE, link: NONE, exec: BOLD,
  selBg: '\x1b[7m', selFg: NONE,
  path: NONE, counter: NONE, status: DIM, divider: DIM,
  comment: DIM, str: NONE, num: NONE,
  kw: BOLD, fn: NONE, type: NONE,
  bool: BOLD, prop: NONE, pun: DIM,
};
