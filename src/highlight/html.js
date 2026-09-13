// HTML highlighting, with <!-- --> comments tracked across lines via st.
const { RESET } = require('../ansi');

function highlightHtml(line, th, st) {
  let out = '';
  let rest = line;
  // continue a comment left open by a previous line
  if (st.block === '-->') {
    const end = rest.indexOf('-->');
    if (end < 0) return `${th.comment}${rest}${RESET}`;
    out += `${th.comment}${rest.slice(0, end + 3)}${RESET}`;
    rest = rest.slice(end + 3);
    st.block = null;
  }
  // split off a comment opened but not closed on this line
  let tail = '';
  const open = rest.indexOf('<!--');
  if (open >= 0 && rest.indexOf('-->', open + 4) < 0) {
    tail = rest.slice(open);
    rest = rest.slice(0, open);
    st.block = '-->';
  }
  out += rest.replace(/(<!--[\s\S]*?-->|<!DOCTYPE[^>\n]*>)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(<\/?[A-Za-z][^\s>/]*|\/?>)|([\w-]+)(?==)/g,
    (m, com, str, tag, attr) => {
      if (com) return `${th.comment}${com}${RESET}`;
      if (str) return `${th.str}${str}${RESET}`;
      if (tag) return `${th.kw}${tag}${RESET}`;
      if (attr) return `${th.prop}${attr}${RESET}`;
      return m;
    });
  if (tail) out += `${th.comment}${tail}${RESET}`;
  return out;
}

module.exports = { highlightHtml };
