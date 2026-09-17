// VSCode Light+ palette on the terminal's light UI colors.
const { hexFg, NONE, DIM } = require('../ansi');

module.exports = {
  dir: '\x1b[34m', file: NONE, link: '\x1b[35m', exec: '\x1b[32m',
  selBg: '\x1b[44m', selFg: '\x1b[37m',
  path: DIM, counter: DIM, status: DIM, divider: DIM,
  // VSCode Light+ palette
  comment: hexFg('#008000'), str: hexFg('#A31515'), num: hexFg('#098658'),
  kw: hexFg('#0000FF'), fn: hexFg('#795E26'), type: hexFg('#267F99'),
  bool: hexFg('#0000FF'), prop: hexFg('#001080'), var: hexFg('#001080'), pun: hexFg('#808080'),
};
