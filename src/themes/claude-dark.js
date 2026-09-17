const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#7CE8D4'), file: hexFg('#E8E4DC'), link: hexFg('#F4845F'), exec: hexFg('#7EC699'),
  selBg: hexBg('#3D3933'), selFg: hexFg('#E8E4DC'),
  path: hexFg('#9A958B'), counter: hexFg('#9A958B'), status: hexFg('#9A958B'), divider: hexFg('#3A3935'),
  comment: hexFg('#9A958B'), str: hexFg('#7EC699'), num: hexFg('#F4A58A'),
  kw: hexFg('#F4845F'), fn: hexFg('#7CACE8'), type: hexFg('#E8C47C'),
  bool: hexFg('#C49BE8'), prop: hexFg('#C49BE8'), var: hexFg('#C49BE8'), pun: hexFg('#9A958B'),
};
