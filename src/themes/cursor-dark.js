const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#4D9FFF'), file: hexFg('#E6E6E6'), link: hexFg('#56D4DD'), exec: hexFg('#89D185'),
  selBg: hexBg('#24405E'), selFg: hexFg('#E6E6E6'),
  path: hexFg('#858585'), counter: hexFg('#858585'), status: hexFg('#858585'), divider: hexFg('#2A2A2A'),
  comment: hexFg('#858585'), str: hexFg('#89D185'), num: hexFg('#D19A66'),
  kw: hexFg('#C586C0'), fn: hexFg('#4D9FFF'), type: hexFg('#56D4DD'),
  bool: hexFg('#569CD6'), prop: hexFg('#9CDCFE'), pun: hexFg('#858585'),
};
