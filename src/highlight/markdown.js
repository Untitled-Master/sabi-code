// Markdown highlighting; fenced code blocks are tracked across lines via st.
const { RESET, BOLD } = require('../ansi');

function highlightMd(line, th, st) {
  // fenced code blocks span lines — track them, render content plain
  if (/^\s*```/.test(line)) {
    st.fence = !st.fence;
    return `${th.comment}${line}${RESET}`;
  }
  if (st.fence) return line;
  if (/^#{1,6}\s/.test(line)) return `${BOLD}${th.kw}${line}${RESET}`;
  if (/^\s*(---+\s*|\*\*\*+\s*)$/.test(line)) return `${th.pun}${line}${RESET}`;
  if (/^\s*>/.test(line)) return `${th.comment}${line}${RESET}`;
  return line
    .replace(/^(\s*(?:[-*+]|\d+\.)\s+)/, (m) => `${th.pun}${m}${RESET}`)
    .replace(/(`[^`\n]*`)|(\*\*[^*\n]+\*\*|\*[^*\n]+\*|__[^_\n]+__)|(\[[^\]\n]*\]\([^)\n]*\))/g,
      (m, code, bold, link) => {
        if (code) return `${th.str}${code}${RESET}`;
        if (bold) return `${BOLD}${bold}${RESET}`;
        if (link) return `${th.fn}${link}${RESET}`;
        return m;
      });
}

module.exports = { highlightMd };
