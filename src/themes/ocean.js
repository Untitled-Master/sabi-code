const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#5fb3b3'), file: hexFg('#c0c5ce'), link: hexFg('#c594c5'), exec: hexFg('#99c794'),
  selBg: hexBg('#1b2b34'), selFg: hexFg('#d8dee9'),
  path: hexFg('#65737e'), counter: hexFg('#65737e'), status: hexFg('#65737e'), divider: hexFg('#343d46'),
  comment: hexFg('#65737e'), str: hexFg('#99c794'), num: hexFg('#fac863'),
  kw: hexFg('#c594c5'), fn: hexFg('#6699cc'), type: hexFg('#5fb3b3'),
  bool: hexFg('#c594c5'), prop: hexFg('#c0c5ce'), var: hexFg('#c0c5ce'), pun: hexFg('#65737e'),
};
