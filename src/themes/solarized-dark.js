const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#2aa198'), file: hexFg('#839496'), link: hexFg('#6c71c4'), exec: hexFg('#859900'),
  selBg: hexBg('#073642'), selFg: hexFg('#fdf6e3'),
  path: hexFg('#586e75'), counter: hexFg('#586e75'), status: hexFg('#586e75'), divider: hexFg('#073642'),
  comment: hexFg('#586e75'), str: hexFg('#859900'), num: hexFg('#b58900'),
  kw: hexFg('#268bd2'), fn: hexFg('#2aa198'), type: hexFg('#cb4b16'),
  bool: hexFg('#d33682'), prop: hexFg('#839496'), pun: hexFg('#586e75'),
};
