const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#7dcfff'), file: hexFg('#c0caf5'), link: hexFg('#bb9af7'), exec: hexFg('#9ece6a'),
  selBg: hexBg('#28344a'), selFg: hexFg('#c0caf5'),
  path: hexFg('#565f89'), counter: hexFg('#565f89'), status: hexFg('#565f89'), divider: hexFg('#28344a'),
  comment: hexFg('#565f89'), str: hexFg('#9ece6a'), num: hexFg('#e0af68'),
  kw: hexFg('#bb9af7'), fn: hexFg('#7aa2f7'), type: hexFg('#7dcfff'),
  bool: hexFg('#bb9af7'), prop: hexFg('#c0caf5'), pun: hexFg('#565f89'),
};
