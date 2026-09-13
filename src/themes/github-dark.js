const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#58A6FF'), file: hexFg('#E6EDF3'), link: hexFg('#58A6FF'), exec: hexFg('#7EE787'),
  selBg: hexBg('#264F78'), selFg: hexFg('#E6EDF3'),
  path: hexFg('#8B949E'), counter: hexFg('#8B949E'), status: hexFg('#8B949E'), divider: hexFg('#30363D'),
  comment: hexFg('#8B949E'), str: hexFg('#A5D6FF'), num: hexFg('#79C0FF'),
  kw: hexFg('#FF7B72'), fn: hexFg('#D2A8FF'), type: hexFg('#FFA657'),
  bool: hexFg('#79C0FF'), prop: hexFg('#79C0FF'), pun: hexFg('#8B949E'),
};
