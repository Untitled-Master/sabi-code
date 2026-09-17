const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#0969DA'), file: hexFg('#24292F'), link: hexFg('#8250DF'), exec: hexFg('#1A7F37'),
  selBg: hexBg('#D6E8FF'), selFg: hexFg('#24292F'),
  path: hexFg('#6E7781'), counter: hexFg('#6E7781'), status: hexFg('#6E7781'), divider: hexFg('#D0D7DE'),
  comment: hexFg('#6E7781'), str: hexFg('#1A7F37'), num: hexFg('#953800'),
  kw: hexFg('#8250DF'), fn: hexFg('#0969DA'), type: hexFg('#0B7A75'),
  bool: hexFg('#0550AE'), prop: hexFg('#0550AE'), var: hexFg('#0550AE'), pun: hexFg('#6E7781'),
};
