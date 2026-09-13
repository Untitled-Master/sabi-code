const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#0969DA'), file: hexFg('#1F2328'), link: hexFg('#0969DA'), exec: hexFg('#1A7F37'),
  selBg: hexBg('#D6E8FF'), selFg: hexFg('#1F2328'),
  path: hexFg('#656D76'), counter: hexFg('#656D76'), status: hexFg('#656D76'), divider: hexFg('#D0D7DE'),
  comment: hexFg('#656D76'), str: hexFg('#0A3069'), num: hexFg('#0550AE'),
  kw: hexFg('#CF222E'), fn: hexFg('#8250DF'), type: hexFg('#953800'),
  bool: hexFg('#0550AE'), prop: hexFg('#0550AE'), pun: hexFg('#656D76'),
};
