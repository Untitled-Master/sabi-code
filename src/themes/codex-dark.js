const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#7DD3FC'), file: hexFg('#F5F5F5'), link: hexFg('#10A37F'), exec: hexFg('#19C37D'),
  selBg: hexBg('#2A2A2A'), selFg: hexFg('#FFFFFF'),
  path: hexFg('#8A8A8A'), counter: hexFg('#8A8A8A'), status: hexFg('#8A8A8A'), divider: hexFg('#292929'),
  comment: hexFg('#777777'), str: hexFg('#19C37D'), num: hexFg('#E69F68'),
  kw: hexFg('#B4A0E5'), fn: hexFg('#7AA2F7'), type: hexFg('#7DD3FC'),
  bool: hexFg('#10A37F'), prop: hexFg('#D6D6D6'), pun: hexFg('#777777'),
};
