const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#89dceb'), file: hexFg('#cdd6e4'), link: hexFg('#cba6f7'), exec: hexFg('#a6e3a1'),
  selBg: hexBg('#313244'), selFg: hexFg('#cdd6e4'),
  path: hexFg('#6c7086'), counter: hexFg('#6c7086'), status: hexFg('#6c7086'), divider: hexFg('#313244'),
  comment: hexFg('#6c7086'), str: hexFg('#a6e3a1'), num: hexFg('#fab387'),
  kw: hexFg('#cba6f7'), fn: hexFg('#89b4fa'), type: hexFg('#89dceb'),
  bool: hexFg('#cba6f7'), prop: hexFg('#cdd6e4'), pun: hexFg('#6c7086'),
};
