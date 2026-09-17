// filename → language id (null = no highlighting)
const path = require('node:path');

function langOf(file) {
  if (!file) return null; // untitled tabs have no filename yet
  const ext = path.extname(file).toLowerCase().slice(1);
  if (!ext) {
    const base = path.basename(file).toLowerCase();
    if (['dockerfile', 'makefile', 'justfile'].includes(base)) return 'sh';
    return null;
  }
  if (['ts', 'tsx', 'mts', 'cts'].includes(ext)) return 'ts';
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return 'js';
  if (['json', 'jsonc'].includes(ext)) return 'json';
  if (['py', 'pyw'].includes(ext)) return 'py';
  if (['go'].includes(ext)) return 'go';
  if (['rs'].includes(ext)) return 'rust';
  if (['c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'java', 'kt', 'swift', 'php', 'dart', 'scala', 'rb', 'pl'].includes(ext)) return ext === 'rb' || ext === 'pl' ? 'py' : ext === 'cpp' || ext === 'hpp' || ext === 'cc' ? 'c' : ['cs', 'java', 'kt', 'swift', 'php', 'dart', 'scala'].includes(ext) ? 'java' : ext;
  if (['sh', 'bash', 'zsh', 'fish', 'mk', 'dockerfile'].includes(ext)) return 'sh';
  if (['sql'].includes(ext)) return 'sql';
  if (['css', 'scss', 'less'].includes(ext)) return 'css';
  if (['html', 'xml', 'vue', 'svelte'].includes(ext)) return 'html';
  if (['md', 'markdown'].includes(ext)) return 'md';
  if (['yaml', 'yml'].includes(ext)) return 'yaml';
  if (['toml', 'ini', 'cfg', 'conf'].includes(ext)) return 'ini';
  return null;
}

// comment syntax per language; `blank` = opener only counts after whitespace/start
function commentOf(lang) {
  switch (lang) {
    case 'py': return { line: [{ op: '#', blank: false }], block: false };
    case 'sh':
    case 'yaml': return { line: [{ op: '#', blank: true }], block: false };
    case 'ini': return { line: [{ op: '#', blank: true }, { op: ';', blank: true }], block: false };
    case 'sql': return { line: [{ op: '--', blank: false }, { op: '#', blank: false }], block: true };
    case 'css': return { line: [], block: true };
    default: return { line: [{ op: '//', blank: false }], block: true }; // js ts json go rust c java
  }
}

module.exports = { langOf, commentOf };
