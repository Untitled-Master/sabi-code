const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#88c0d0'), file: hexFg('#eceff4'), link: hexFg('#b48ead'), exec: hexFg('#a3be8c'),
  selBg: hexBg('#3b4252'), selFg: hexFg('#eceff4'),
  path: hexFg('#4c566a'), counter: hexFg('#4c566a'), status: hexFg('#4c566a'), divider: hexFg('#3b4252'),
  comment: hexFg('#4c566a'), str: hexFg('#a3be8c'), num: hexFg('#d08770'),
  kw: hexFg('#81a1c1'), fn: hexFg('#88c0d0'), type: hexFg('#8fbcbb'),
  bool: hexFg('#b48ead'), prop: hexFg('#d8dee9'), pun: hexFg('#616e88'),
};
