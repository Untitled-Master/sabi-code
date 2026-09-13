// default theme: terminal UI palette + VSCode Dark+ syntax palette.
const { hexFg, NONE, DIM } = require('../ansi');

module.exports = {
  dir: '\x1b[36m', file: NONE, link: '\x1b[35m', exec: '\x1b[32m',
  selBg: '\x1b[46m', selFg: '\x1b[30m',
  path: DIM, counter: DIM, status: DIM, divider: DIM,
  // VSCode Dark+ palette
  comment: hexFg('#6A9955'), str: hexFg('#CE9178'), num: hexFg('#B5CEA8'),
  kw: hexFg('#569CD6'), fn: hexFg('#DCDCAA'), type: hexFg('#4EC9B0'),
  bool: hexFg('#569CD6'), prop: hexFg('#9CDCFE'), pun: hexFg('#808080'),
};
