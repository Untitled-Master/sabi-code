const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#83a598'), file: hexFg('#ebdbb2'), link: hexFg('#d3869b'), exec: hexFg('#b8bb26'),
  selBg: hexBg('#3c3836'), selFg: hexFg('#ebdbb2'),
  path: hexFg('#928374'), counter: hexFg('#928374'), status: hexFg('#928374'), divider: hexFg('#504945'),
  comment: hexFg('#928374'), str: hexFg('#b8bb26'), num: hexFg('#fabd2f'),
  kw: hexFg('#fb4934'), fn: hexFg('#83a598'), type: hexFg('#8ec07c'),
  bool: hexFg('#d3869b'), prop: hexFg('#ebdbb2'), pun: hexFg('#7c6f64'),
};
