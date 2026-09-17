const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#0369A1'), file: hexFg('#171717'), link: hexFg('#087F5B'), exec: hexFg('#0B8F68'),
  selBg: hexBg('#E5E5E5'), selFg: hexFg('#171717'),
  path: hexFg('#737373'), counter: hexFg('#737373'), status: hexFg('#737373'), divider: hexFg('#E5E5E5'),
  comment: hexFg('#737373'), str: hexFg('#087F5B'), num: hexFg('#C2410C'),
  kw: hexFg('#7C3AED'), fn: hexFg('#2563EB'), type: hexFg('#0369A1'),
  bool: hexFg('#087F5B'), prop: hexFg('#171717'), var: hexFg('#171717'), pun: hexFg('#737373'),
};
