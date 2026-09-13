const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#277B75'), file: hexFg('#2C2C2C'), link: hexFg('#C15F3C'), exec: hexFg('#3F7655'),
  selBg: hexBg('#E5DCC8'), selFg: hexFg('#2C2C2C'),
  path: hexFg('#77736B'), counter: hexFg('#77736B'), status: hexFg('#77736B'), divider: hexFg('#DDD9CF'),
  comment: hexFg('#77736B'), str: hexFg('#3F7655'), num: hexFg('#B85C42'),
  kw: hexFg('#C15F3C'), fn: hexFg('#456A9F'), type: hexFg('#8A6815'),
  bool: hexFg('#76549A'), prop: hexFg('#456A9F'), pun: hexFg('#77736B'),
};
