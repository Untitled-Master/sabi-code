const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#8be9fd'), file: hexFg('#f8f8f2'), link: hexFg('#bd93f9'), exec: hexFg('#50fa7b'),
  selBg: hexBg('#44475a'), selFg: hexFg('#f8f8f2'),
  path: hexFg('#6272a4'), counter: hexFg('#6272a4'), status: hexFg('#6272a4'), divider: hexFg('#44475a'),
  comment: hexFg('#6272a4'), str: hexFg('#f1fa8c'), num: hexFg('#ffb86c'),
  kw: hexFg('#ff79c6'), fn: hexFg('#50fa7b'), type: hexFg('#8be9fd'),
  bool: hexFg('#bd93f9'), prop: hexFg('#f8f8f2'), var: hexFg('#f8f8f2'), pun: hexFg('#6272a4'),
};
