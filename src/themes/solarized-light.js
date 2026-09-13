const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#268bd2'), file: hexFg('#657b83'), link: hexFg('#6c71c4'), exec: hexFg('#859900'),
  selBg: hexBg('#eee8d5'), selFg: hexFg('#002b36'),
  path: hexFg('#93a1a1'), counter: hexFg('#93a1a1'), status: hexFg('#93a1a1'), divider: hexFg('#eee8d5'),
  comment: hexFg('#93a1a1'), str: hexFg('#859900'), num: hexFg('#b58900'),
  kw: hexFg('#d33682'), fn: hexFg('#268bd2'), type: hexFg('#2aa198'),
  bool: hexFg('#d33682'), prop: hexFg('#657b83'), pun: hexFg('#93a1a1'),
};
