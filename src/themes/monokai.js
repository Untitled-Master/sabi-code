const { hexFg, hexBg } = require('../ansi');

module.exports = {
  dir: hexFg('#66d9ef'), file: hexFg('#f8f8f2'), link: hexFg('#ae81ff'), exec: hexFg('#a6e22e'),
  selBg: hexBg('#49483e'), selFg: hexFg('#f8f8f2'),
  path: hexFg('#75715e'), counter: hexFg('#75715e'), status: hexFg('#75715e'), divider: hexFg('#49483e'),
  comment: hexFg('#75715e'), str: hexFg('#e6db74'), num: hexFg('#ae81ff'),
  kw: hexFg('#f92672'), fn: hexFg('#a6e22e'), type: hexFg('#66d9ef'),
  bool: hexFg('#ae81ff'), prop: hexFg('#f8f8f2'), var: hexFg('#f8f8f2'), pun: hexFg('#75715e'),
};
