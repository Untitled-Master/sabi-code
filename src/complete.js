// Autocomplete (IntelliSense-lite): chained static sources, no LSP server.
// Real IntelliSense needs per-language server binaries over JSON-RPC —
// unavailable under the zero-dependency rule — so this follows the Vim
// omni-completion pattern instead, all synchronous and offline:
//   member (`recv.`): known globals/modules → imported-file exports →
//     literal-type inference from the buffer → `recv.prop` usages → words
//   path (inside import strings): fs entries + node_modules packages
//   word: language keywords/types → buffer symbols → buffer words
// Popup state is module-level and validated against (file, tabIdx, row) on
// every use; stale popups vanish silently. Triggers: `.` (member), 2+ word
// chars (word), path chars in strings, ctrl-n (manual). Enter/Tab accept
// (Tab on a directory keeps completing), up/down navigate, esc dismisses,
// anything else filters or dismisses.
// NOTE: requires ui.js at runtime only (see explorer.js note on the
// UI-cluster require convention). Never requires editor.js (editor requires
// this module) — buffer edits go through edit.* directly, undo snapshots
// arrive via the snap() callback from editKey.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { state, edit } = require('./state');
const { langOf } = require('./highlight/lang');
const { BOOLS, KW, TYPES } = require('./highlight/keywords');
const { scanLine } = require('./highlight/scan');
const ui = require('./ui');

// kinds: m method · f function · v variable · k keyword · c class/type ·
// p property · d directory · w buffer word/file. Colors map in kindColor().
function L(s) {
  return s.split(' ').map((t) => {
    const i = t.indexOf(':');
    return { w: t.slice(0, i), k: t.slice(i + 1) };
  });
}

// --- JS/TS catalogs --------------------------------------------------------
const JS_STRING = L('length:p charAt:m charCodeAt:m codePointAt:m at:m concat:m endsWith:m includes:m indexOf:m lastIndexOf:m localeCompare:m match:m matchAll:m normalize:m padEnd:m padStart:m repeat:m replace:m replaceAll:m search:m slice:m split:m startsWith:m substring:m toLowerCase:m toUpperCase:m toString:m trim:m trimEnd:m trimStart:m valueOf:m substr:m');
const JS_ARRAY = L('length:p at:m concat:m copyWithin:m entries:m every:m fill:m filter:m find:m findIndex:m findLast:m findLastIndex:m flat:m flatMap:m forEach:m includes:m indexOf:m join:m keys:m lastIndexOf:m map:m pop:m push:m reduce:m reduceRight:m reverse:m shift:m slice:m some:m sort:m splice:m toReversed:m toSorted:m toSpliced:m with:m toString:m unshift:m values:m');
const JS_NUMBER = L('toExponential:m toFixed:m toPrecision:m toString:m valueOf:m isFinite:m isInteger:m isNaN:m isSafeInteger:m parseFloat:m parseInt:m MAX_VALUE:p MIN_VALUE:p MAX_SAFE_INTEGER:p MIN_SAFE_INTEGER:p EPSILON:p NaN:p POSITIVE_INFINITY:p NEGATIVE_INFINITY:p');
const JS_BOOLEAN = L('toString:m valueOf:m');
const JS_MATH = L('abs:m acos:m acosh:m asin:m asinh:m atan:m atan2:m atanh:m cbrt:m ceil:m clz32:m cos:m cosh:m exp:m expm1:m floor:m fround:m hypot:m imul:m log:m log2:m log10:m max:m min:m pow:m random:m round:m sign:m sin:m sinh:m sqrt:m tan:m tanh:m trunc:m E:p LN2:p LN10:p LOG2E:p LOG10E:p PI:p SQRT2:p SQRT1_2:p');
const JS_JSON = L('parse:m stringify:m');
const JS_OBJECT = L('assign:m create:m defineProperties:m defineProperty:m entries:m freeze:m fromEntries:m getOwnPropertyDescriptor:m getOwnPropertyDescriptors:m getOwnPropertyNames:m getPrototypeOf:m hasOwn:m is:m isExtensible:m isFrozen:m isSealed:m keys:m preventExtensions:m seal:m setPrototypeOf:m values:m hasOwnProperty:m toString:m valueOf:m');
const JS_PROMISE = L('then:m catch:m finally:m resolve:m reject:m all:m allSettled:m race:m any:m withResolvers:m');
const JS_MAP = L('get:m set:m has:m delete:m clear:m size:p keys:m values:m entries:m forEach:m');
const JS_SET = L('add:m has:m delete:m clear:m size:p values:m keys:m entries:m forEach:m union:m intersection:m difference:m symmetricDifference:m isSubsetOf:m isSupersetOf:m isDisjointFrom:m');
const JS_DATE = L('now:m parse:m UTC:m getDate:m getDay:m getFullYear:m getHours:m getMilliseconds:m getMinutes:m getMonth:m getSeconds:m getTime:m getTimezoneOffset:m setDate:m setFullYear:m setHours:m setMinutes:m setMonth:m setSeconds:m setTime:m toDateString:m toISOString:m toJSON:m toLocaleDateString:m toLocaleString:m toLocaleTimeString:m toString:m toTimeString:m valueOf:m');
const JS_REGEXP = L('test:m exec:m compile:m source:p flags:p global:p ignoreCase:p multiline:p dotAll:p unicode:p sticky:p lastIndex:p');
const JS_ERROR = L('message:p stack:p name:p cause:p');
const JS_CONSOLE = L('log:m error:m warn:m info:m debug:m table:m time:m timeEnd:m timeLog:m assert:m count:m countReset:m clear:m dir:m group:m groupEnd:m trace:m');
const JS_PROCESS = L('argv:p env:p exit:m cwd:m chdir:m stdout:p stdin:p stderr:p version:p versions:p platform:p arch:p pid:p ppid:p uptime:m memoryUsage:m hrtime:m nextTick:m emitWarning:m on:m once:m off:m title:p execPath:p');
const JS_BUFFER = L('from:m alloc:m allocUnsafe:m byteLength:m concat:m isBuffer:m isEncoding:m toString:m fill:m copy:m slice:m subarray:m write:m length:p poolSize:p');
const JS_GLOBALS = L('console:v Math:v JSON:v Object:v Array:v String:v Number:v Boolean:v Promise:v Map:v Set:v WeakMap:v WeakSet:v Date:v RegExp:v Error:v RangeError:v TypeError:v SyntaxError:v ReferenceError:v Symbol:v BigInt:v Proxy:v Reflect:v Intl:v process:v Buffer:v require:v module:v exports:v __dirname:v __filename:v globalThis:v setTimeout:v clearTimeout:v setInterval:v clearInterval:v setImmediate:v clearImmediate:v queueMicrotask:v fetch:v URL:v URLSearchParams:v TextEncoder:v TextDecoder:v structuredClone:v performance:v crypto:v window:v document:v localStorage:v alert:v');
const JS_FS = L('readFileSync:m writeFileSync:m appendFileSync:m readFile:m writeFile:m appendFile:m readdirSync:m readdir:m statSync:m stat:m lstatSync:m existsSync:m mkdirSync:m mkdir:m rmSync:m rm:m renameSync:m rename:m copyFileSync:m copyFile:m unlinkSync:m unlink:m createReadStream:m createWriteStream:m watch:m promises:m constants:p openSync:m closeSync:m');
const JS_PATH = L('join:m resolve:m basename:m dirname:m extname:m parse:m format:m normalize:m relative:m isAbsolute:m toNamespacedPath:m posix:m win32:m sep:p delimiter:p');
const JS_OS = L('platform:m arch:m homedir:m tmpdir:m hostname:m cpus:m freemem:m totalmem:m release:m type:m version:m uptime:m loadavg:m networkInterfaces:m userInfo:m EOL:p constants:m');
const JS_TYPE_MEMBERS = {
  String: JS_STRING, Array: JS_ARRAY, Number: JS_NUMBER, Boolean: JS_BOOLEAN,
  Object: JS_OBJECT, Promise: JS_PROMISE, Map: JS_MAP, Set: JS_SET,
  Date: JS_DATE, RegExp: JS_REGEXP, Error: JS_ERROR,
};
const JS_KNOWN = {
  console: JS_CONSOLE, Math: JS_MATH, JSON: JS_JSON, Object: JS_OBJECT,
  Promise: JS_PROMISE, process: JS_PROCESS, Buffer: JS_BUFFER,
  Number: JS_NUMBER, Boolean: JS_BOOLEAN, Date: JS_DATE,
};
const JS_MODULES = { fs: JS_FS, path: JS_PATH, os: JS_OS };

// --- Python catalogs -------------------------------------------------------
const PY_BUILTINS = L('print:f len:f range:f str:f int:f float:f bool:f list:f dict:f set:f tuple:f frozenset:f open:f abs:f min:f max:f sum:f sorted:f reversed:f enumerate:f zip:f map:f filter:f all:f any:f type:f isinstance:f issubclass:f hasattr:f getattr:f setattr:f delattr:f callable:f super:f input:f repr:f round:f pow:f divmod:f chr:f ord:f hex:f oct:f bin:f id:f hash:f vars:f dir:f iter:f next:f slice:f compile:f eval:f exec:f globals:f locals:f breakpoint:f staticmethod:f classmethod:f property:f');
const PY_STR = L('capitalize:m casefold:m center:m count:m encode:m endswith:m expandtabs:m find:m format:m index:m isalnum:m isalpha:m isdecimal:m isdigit:m islower:m isnumeric:m isspace:m istitle:m isupper:m join:m ljust:m lower:m lstrip:m partition:m removeprefix:m removesuffix:m replace:m rfind:m rindex:m rjust:m rpartition:m rsplit:m rstrip:m split:m splitlines:m startswith:m strip:m swapcase:m title:m translate:m upper:m zfill:m');
const PY_LIST = L('append:m clear:m copy:m count:m extend:m index:m insert:m pop:m remove:m reverse:m sort:m');
const PY_DICT = L('clear:m copy:m fromkeys:m get:m items:m keys:m pop:m popitem:m setdefault:m update:m values:m');
const PY_SET = L('add:m clear:m copy:m difference:m discard:m intersection:m isdisjoint:m issubset:m issuperset:m pop:m remove:m symmetric_difference:m union:m update:m');
const PY_TUPLE = L('count:m index:m');
const PY_INT = L('as_integer_ratio:m bit_length:m conjugate:m to_bytes:m from_bytes:m is_integer:m denominator:p numerator:p real:p imag:p');
const PY_OS = L('getcwd:m listdir:m mkdir:m makedirs:m remove:m rename:m rmdir:m stat:m walk:m scandir:m system:m getenv:m environ:p sep:p pathsep:p curdir:p pardir:p name:p path:m strerror:m');
const PY_SYS = L('argv:p exit:m path:p version:p version_info:p platform:p stdin:p stdout:p stderr:p modules:p executable:p maxsize:p');
const PY_JSON = L('load:m loads:m dump:m dumps:m');
const PY_MATH = L('acos:m asin:m atan:m ceil:m cos:m degrees:m exp:m factorial:m floor:m gcd:m hypot:m isclose:m isfinite:m isinf:m isnan:m log:m log2:m log10:m pow:m radians:m sin:m sqrt:m tan:m trunc:m pi:p e:p tau:p inf:p nan:p');
const PY_RE = L('compile:m match:m search:m findall:m finditer:m fullmatch:m split:m sub:m subn:m escape:m error:c');
const PY_EXC = L('BaseException:c Exception:c ArithmeticError:c AssertionError:c AttributeError:c EOFError:c FileNotFoundError:c ImportError:c IndexError:c KeyError:c LookupError:c MemoryError:c NameError:c OSError:c OverflowError:c RuntimeError:c StopIteration:c SyntaxError:c TypeError:c ValueError:c ZeroDivisionError:c');
const PY_TYPE_MEMBERS = {
  str: PY_STR, list: PY_LIST, dict: PY_DICT, set: PY_SET, tuple: PY_TUPLE,
  int: PY_INT, float: PY_INT, bool: PY_INT,
};
const PY_KNOWN = { os: PY_OS, sys: PY_SYS, json: PY_JSON, math: PY_MATH, re: PY_RE };
const PY_MODULES = { os: PY_OS, sys: PY_SYS, json: PY_JSON, math: PY_MATH, re: PY_RE };

// languages with automatic popup (prose/markup excluded — manual only)
const AUTO_LANGS = new Set(['js', 'ts', 'py', 'go', 'rust', 'c', 'java', 'sh', 'sql', 'json', 'yaml', 'ini', 'css']);
const MAX_ITEMS = 200;
const SYM_CACHE_LINES = 4000;

let popup = null; // { mode, receiver, prefix, startCol, row, file, tabIdx, all, items, sel }
let symCache = null; // { file, tabIdx, lineCount, syms, imports }

function kindColor(T, k) {
  if (k === 'f' || k === 'm') return T.fn;
  if (k === 'k') return T.kw;
  if (k === 'c') return T.type;
  if (k === 'v') return T.var || T.prop;
  if (k === 'p') return T.prop;
  if (k === 'd') return T.dir;
  return '';
}

// cursor inside code (not a comment/string)? member dots and words in
// prose shouldn't pop anything up.
function inCode(line, col, lang) {
  const segs = scanLine(line, lang, {});
  let pos = 0;
  for (const [kind, text] of segs) {
    const end = pos + text.length;
    if (col > pos && col <= end) return kind === 'code' || kind === 'jsx';
    pos = end;
  }
  return true;
}

// --- buffer sources --------------------------------------------------------
function scanBuffer(lines, lang) {
  const syms = [];
  const seen = new Set();
  const imports = {};
  const fileImports = {}; // localName -> { spec, kind } for cross-file members
  const add = (w, k) => { if (w && !seen.has(w)) { seen.add(w); syms.push({ w, k }); } };
  const cap = Math.min(lines.length, SYM_CACHE_LINES);
  const isJs = lang === 'js' || lang === 'ts';
  const isPy = lang === 'py';
  for (let i = 0; i < cap; i++) {
    const line = lines[i];
    if (!line || line.length > 500) continue;
    let m;
    if (isJs) {
      if ((m = /(?:^|[{\s;])function\s+([A-Za-z_$][\w$]*)/.exec(line))) add(m[1], 'f');
      if ((m = /class\s+([A-Za-z_$][\w$]*)/.exec(line))) add(m[1], 'c');
      const decl = /(?:^|[{\s;])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
      let d;
      while ((d = decl.exec(line))) add(d[1], 'v');
      if ((m = /(?:^|[{\s;])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>/.exec(line))) add(m[1], 'f');
      if ((m = /(?:^|[{\s;])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]/.exec(line))) {
        add(m[1], 'm');
        fileImports[m[1]] = { spec: m[2], kind: 'namespace' }; // whole exports object
        const mod = m[2].split('/').pop().replace(/^node:/, '');
        if (JS_MODULES[mod]) imports[m[1]] = mod;
      }
      if ((m = /import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]/.exec(line))) {
        const mod = m[2].split('/').pop().replace(/^node:/, '');
        for (const part of m[1].split(',')) {
          const nm = part.replace(/[{}*\s]/g, '').split(/\s+as\s+/).pop();
          if (/^[A-Za-z_$][\w$]*$/.test(nm)) {
            add(nm, 'm');
            if (JS_MODULES[mod]) imports[nm] = mod;
          }
        }
        // default + namespace bindings carry the module for `name.` members
        // (`import type …` has no runtime members — skipped)
        if (!/^\s*type\b/.test(m[1])) {
          const cl = m[1].trim();
          const ns = /^\*\s*as\s+([A-Za-z_$][\w$]*)$/.exec(cl);
          if (ns) fileImports[ns[1]] = { spec: m[2], kind: 'namespace' };
          else if (/^[A-Za-z_$]/.test(cl)) {
            fileImports[/^[A-Za-z_$][\w$]*/.exec(cl)[0]] = { spec: m[2], kind: 'default' };
          }
        }
      }
      // shorthand methods (`render() {`), minus control keywords
      if ((m = /^\s*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/.exec(line))) {
        if (!/^(if|for|while|switch|catch|with)$/.test(m[1])) add(m[1], 'f');
      }
    } else if (isPy) {
      if ((m = /^\s*def\s+(\w+)/.exec(line))) add(m[1], 'f');
      else if ((m = /^\s*class\s+(\w+)/.exec(line))) add(m[1], 'c');
      else if ((m = /^\s*(\w+)\s*=[^=]/.exec(line))) add(m[1], 'v');
      if ((m = /^\s*import\s+([\w\s,]+)/.exec(line))) {
        for (const part of m[1].split(',')) {
          const bits = part.trim().split(/\s+as\s+/);
          const mod = bits[0];
          const nm = bits.pop();
          if (/^\w+$/.test(nm)) {
            add(nm, 'm');
            if (PY_MODULES[nm]) imports[nm] = nm;
            if (!mod.includes('.')) fileImports[nm] = { spec: mod, kind: 'namespace' };
          }
        }
      }
      if ((m = /^\s*from\s+(\w+)\s+import\s+(.+)/.exec(line))) {
        for (const part of m[2].split(',')) {
          const nm = part.trim().split(/\s+as\s+/).pop().replace(/^[*()]+|[()]+$/g, '');
          if (/^\w+$/.test(nm)) add(nm, 'v');
        }
      }
    }
  }
  return { syms, imports, fileImports };
}

function bufferWords(lines, row, col, prefix) {
  const found = [];
  const seen = new Set();
  const cap = Math.min(lines.length, SYM_CACHE_LINES);
  const low = prefix.toLowerCase();
  for (let i = 0; i < cap && found.length < 500; i++) {
    const line = lines[i];
    if (!line || line.length > 500) continue;
    const re = /[A-Za-z_][\w$]{2,}/g;
    let m;
    while ((m = re.exec(line)) && found.length < 500) {
      const w = m[0];
      if (seen.has(w) || w.toLowerCase() === low) continue;
      if (i === row && m.index < col && col <= m.index + w.length) continue; // word being typed
      if (!w.toLowerCase().startsWith(low)) continue;
      seen.add(w);
      found.push({ w, k: 'w' });
    }
  }
  return found;
}

function symsFor() {
  const key = `${edit.file}\n${edit.tabIdx}\n${edit.lines.length}`;
  if (!symCache || symCache.key !== key) {
    const lang = langOf(edit.file);
    const { syms, imports, fileImports } = scanBuffer(edit.lines, lang);
    symCache = { key, syms, imports, fileImports };
  }
  return symCache;
}

// last same-line `recv = <literal>` wins (reassignment); ts `x: Type` too
function inferType(lines, recv, lang) {
  const isJs = lang === 'js' || lang === 'ts';
  const isPy = lang === 'py';
  if (!isJs && !isPy) return null;
  let type = null;
  const esc = recv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cap = Math.min(lines.length, SYM_CACHE_LINES);
  for (let i = 0; i < cap; i++) {
    const line = lines[i];
    if (line.length > 500 || line.indexOf(recv) < 0) continue;
    let m;
    if (isJs) {
      if (new RegExp(`\\b${esc}\\s*[:=]\\s*["'\`]`).test(line)) type = 'String';
      else if (new RegExp(`\\b${esc}\\s*=\\s*\\[`).test(line)) type = 'Array';
      else if (new RegExp(`\\b${esc}\\s*=\\s*\\{`).test(line)) type = 'Object';
      else if (new RegExp(`\\b${esc}\\s*=\\s*-?\\d`).test(line)) type = 'Number';
      else if (new RegExp(`\\b${esc}\\s*=\\s*(true|false)\\b`).test(line)) type = 'Boolean';
      else if (new RegExp(`\\b${esc}\\s*=\\s*new\\s+[A-Za-z_$][\\w$]*`).test(line)) type = null;
      else if (new RegExp(`\\b${esc}\\s*:\\s*(string)\\b`).test(line)) type = 'String';
      else if (new RegExp(`\\b${esc}\\s*:\\s*(number)\\b`).test(line)) type = 'Number';
      else if (new RegExp(`\\b${esc}\\s*:\\s*(boolean)\\b`).test(line)) type = 'Boolean';
      else if (new RegExp(`\\b${esc}\\s*:\\s*[A-Za-z_$][\\w$]*\\[\\]`).test(line)) type = 'Array';
    } else {
      if (new RegExp(`\\b${esc}\\s*=\\s*["']`).test(line)) type = 'str';
      else if (new RegExp(`\\b${esc}\\s*=\\s*\\[`).test(line)) type = 'list';
      else if (new RegExp(`\\b${esc}\\s*=\\s*\\{`).test(line)) type = 'dict';
      else if (new RegExp(`\\b${esc}\\s*=\\s*-?\\d`).test(line)) type = 'int';
      else if (new RegExp(`\\b${esc}\\s*=\\s*(True|False)\\b`).test(line)) type = 'bool';
    }
  }
  return type;
}

// `recv.prop` used anywhere in the buffer — the cheapest "type" there is
function recvUsages(lines, recv, row) {
  const found = [];
  const seen = new Set();
  const re = new RegExp(`\\b${recv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.([\\w$]+)`, 'g');
  const cap = Math.min(lines.length, SYM_CACHE_LINES);
  for (let i = 0; i < cap && found.length < 100; i++) {
    const line = lines[i];
    if (!line || line.length > 500) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) && found.length < 100) {
      if (!seen.has(m[1])) { seen.add(m[1]); found.push({ w: m[1], k: 'p' }); }
    }
  }
  return found;
}

// `recv.prop` used anywhere in the buffer — the cheapest "type" there is
function recvUsages(lines, recv, row) {
  const found = [];
  const seen = new Set();
  const re = new RegExp(`\\b${recv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.([\\w$]+)`, 'g');
  const cap = Math.min(lines.length, SYM_CACHE_LINES);
  for (let i = 0; i < cap && found.length < 100; i++) {
    const line = lines[i];
    if (!line || line.length > 500) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) && found.length < 100) {
      if (!seen.has(m[1])) { seen.add(m[1]); found.push({ w: m[1], k: 'p' }); }
    }
  }
  return found;
}

// words seen in property position (`foo.bar`) anywhere in the buffer —
// the only buffer words that may plausibly be members of *something*
function bufferProps(lines, row, col, prefix) {
  const found = [];
  const seen = new Set();
  const re = /\.([\w$]+)/g;
  const cap = Math.min(lines.length, SYM_CACHE_LINES);
  const low = prefix.toLowerCase();
  for (let i = 0; i < cap && found.length < 100; i++) {
    const line = lines[i];
    if (!line || line.length > 500) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) && found.length < 100) {
      if (i === row && m.index + m[0].length === col) continue; // the partial being typed
      const w = m[1];
      if (seen.has(w) || !w.toLowerCase().startsWith(low)) continue;
      seen.add(w);
      found.push({ w, k: 'p' });
    }
  }
  return found;
}

// --- path completions (inside import strings) ------------------------------
// `import x from "./u|"`, `require("../|")`, or any string that looks like
// a path (`./`, `../`, `/`, `~`, or containing `/`) — all languages.
function findNodeModules(file) {
  let dir = path.dirname(file);
  for (let i = 0; i < 6; i++) {
    const nm = path.join(dir, 'node_modules');
    try { if (fs.statSync(nm).isDirectory()) return nm; } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// cursor inside a module-specifier/path string? → { base, segment, start,
// anchor } or null. base is the absolute dir to list, segment the partial
// name after the last slash, start its column, anchor the opening quote.
function pathContext(line, col, lang) {
  if (!edit.file) return null;
  const before = line.slice(0, col);
  const qm = before.match(/(["'])([^"'`]*)$/);
  if (!qm) return null;
  const quote = qm[1];
  const tail = qm[2];
  const qpos = col - tail.length - 1;
  const pre = before.slice(0, qpos);
  const isImportPos = /\b(?:from|import|require)\b[^'"`\n]*$/.test(pre);
  const pathy = tail[0] === '~' || tail[0] === '/' || tail.startsWith('./') ||
    tail.startsWith('../') || tail.includes('/') || /^[A-Za-z]:\//.test(tail);
  if (!isImportPos && !pathy) return null;
  const si = tail.lastIndexOf('/');
  const dirPart = si >= 0 ? tail.slice(0, si + 1) : '';
  const segment = si >= 0 ? tail.slice(si + 1) : tail;
  const start = col - segment.length;
  const isJs = lang === 'js' || lang === 'ts';
  let base = null;
  let bareRoot = false;
  if (/^[A-Za-z]:\//.test(tail)) base = dirPart || tail;
  else if (tail[0] === '/') base = dirPart || '/';
  else if (tail[0] === '~') base = path.join(os.homedir(), dirPart.slice(1));
  else if (tail[0] === '.' || tail.includes('/')) base = path.join(path.dirname(edit.file), dirPart);
  else if (isImportPos && isJs) { base = findNodeModules(edit.file); bareRoot = !!base; }
  if (!base) return null;
  // anchor = char before the segment (slash past the first, else the quote)
  return { base, segment, start, anchor: si >= 0 ? '/' : quote, bareRoot };
}

function pathItems(base, segment, bareRoot) {
  let names = null;
  try { names = fs.readdirSync(base, { withFileTypes: true }); } catch { return []; }
  const pool = [];
  if ('../'.startsWith(segment)) pool.push({ w: '../', k: 'd' });
  const showHidden = segment.startsWith('.');
  for (const e of names) {
    if (pool.length > 150) break;
    if (!showHidden && e.name.startsWith('.')) continue;
    try {
      // bare package roots list importable names, not paths (`mypkg`,
      // not `mypkg/`) — except scopes, which must drill in
      if (e.isDirectory()) pool.push({ w: (bareRoot && !e.name.startsWith('@')) ? e.name : e.name + '/', k: 'd' });
      else if (e.isFile()) pool.push({ w: e.name, k: 'w' });
    } catch {}
  }
  return rankItems(pool, segment);
}

// --- imported-module members (`app.` shows app's exports) ------------------
const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

function tryFile(base, lang) {
  const exts = lang === 'py' ? ['.py'] : JS_EXTS;
  if (/\.\w+$/.test(base)) {
    try { if (fs.statSync(base).isFile()) return base; } catch {}
  }
  for (const e of exts) {
    try { if (fs.statSync(base + e).isFile()) return base + e; } catch {}
  }
  for (const e of exts) {
    try { if (fs.statSync(path.join(base, 'index' + e)).isFile()) return path.join(base, 'index' + e); } catch {}
  }
  if (lang === 'py') {
    try { if (fs.statSync(path.join(base, '__init__.py')).isFile()) return path.join(base, '__init__.py'); } catch {}
  }
  return null;
}

// module specifier → absolute file (single hop): relative + extensions +
// index, bare js → node_modules package main, dotted py → same-dir module
function resolveImport(spec, fromFile, lang) {
  if (!spec || !fromFile || /[*?<>|]/.test(spec)) return null;
  const isJs = lang === 'js' || lang === 'ts';
  const isPy = lang === 'py';
  if (/^\.{1,2}\//.test(spec) || spec[0] === '/' || /^[A-Za-z]:\//.test(spec)) {
    const base = spec[0] === '/' || /^[A-Za-z]:\//.test(spec) ? spec : path.join(path.dirname(fromFile), spec);
    return tryFile(base, lang);
  }
  if (isJs) {
    let dir = path.dirname(fromFile);
    for (let i = 0; i < 6; i++) {
      const nm = path.join(dir, 'node_modules', spec);
      const pkg = path.join(nm, 'package.json');
      if (fs.existsSync(pkg)) {
        try {
          const pj = JSON.parse(fs.readFileSync(pkg, 'utf8'));
          const main = typeof pj.main === 'string' ? pj.main : 'index.js';
          const f = path.join(nm, main);
          if (fs.statSync(f).isFile()) return f;
        } catch {}
        return null;
      }
      const direct = tryFile(nm, lang);
      if (direct) return direct;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }
  if (isPy) {
    const m = /^\.+([A-Za-z_][\w.]*)$/.exec(spec) || (!spec.startsWith('.') && /^[A-Za-z_][\w.]*$/.test(spec) ? [spec, spec] : null);
    if (!m) return null;
    return tryFile(path.join(path.dirname(fromFile), ...m[1].split('.')), lang);
  }
  return null;
}

// export records from lines: [{ w, k }] + defaultKeys (export default {…})
// + hasDefault + isCjs + star re-export specs (followed once by the caller)
function parseExports(lines, lang) {
  const items = [];
  const seen = new Set();
  const defaultKeys = [];
  const stars = [];
  let hasDefault = false;
  let defaultKind = null; // 'named' | 'object' | 'expr'
  let isCjs = false;
  let allList = null; // python __all__: restrict at the end (it may lead the file)
  const add = (w, k) => { if (w && !seen.has(w)) { seen.add(w); items.push({ w, k }); } };
  const isJs = lang === 'js' || lang === 'ts';
  const cap = Math.min(lines.length, SYM_CACHE_LINES);
  // join brace/bracket continuations for export lists, module.exports and __all__
  const joined = [];
  for (let i = 0; i < cap; i++) {
    let line = lines[i];
    if (!line || line.length > 500) { joined.push(line || ''); continue; }
    const t = line.trim();
    if (/^(export\s*\{|module\.exports\s*=\s*\{|__all__\s*=\s*\[)/.test(t) && !/([}\]])(\s*;?\s*)$/.test(t)) {
      let j = i + 1;
      while (j < cap && j - i < 25) {
        line += ' ' + (lines[j] || '');
        if (/([}\]])(\s*;?\s*)$/.test(lines[j].trim())) break;
        j++;
      }
      i = j;
    }
    joined.push(line);
  }
  let inBlock = false;
  let inTriple = null;
  for (const rawLine of joined) {
    const line = rawLine;
    if (!line) continue;
    const t = line.trim();
    if (!t) continue;
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (/^\/\*/.test(t)) {
      if (!t.includes('*/', 2)) inBlock = true;
      continue;
    }
    if (isJs) {
      if (/^\/\//.test(t)) continue;
    } else if (lang === 'py') {
      if (t[0] === '#') continue;
      const tm = /("""|''')/.exec(t);
      if (tm) {
        const count = (t.match(/"""/g) || []).length + (t.match(/'''/g) || []).length;
        if (inTriple) {
          if (t.includes(inTriple)) inTriple = count % 2 === 1 ? inTriple : null;
          continue;
        }
        if (count % 2 === 1) { inTriple = tm[1]; continue; }
      } else if (inTriple) {
        if (t.includes(inTriple)) inTriple = null;
        continue;
      }
      if (inTriple) continue;
    } else if (/^\/\//.test(t) || t[0] === '#') continue;
    let m;
    if (isJs) {
      if ((m = /^export\s+default\s+(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|(\w+))/.exec(t))) {
        hasDefault = true;
        defaultKind = 'named'; // the default IS that thing — members opaque
        if (m[1]) add(m[1], 'f');
        else if (m[2]) add(m[2], 'c');
      } else if ((m = /^export\s+default\s*\{([^}]*)\}/.exec(t))) {
        hasDefault = true;
        defaultKind = 'object';
        for (const part of m[1].split(',')) {
          const km = /^\s*([A-Za-z_$][\w$]*)/.exec(part);
          if (km) { add(km[1], 'p'); defaultKeys.push({ w: km[1], k: 'p' }); }
        }
      } else if (/^export\s+default\b/.test(t)) { hasDefault = true; defaultKind = 'expr'; }
      if ((m = /^export\s+(?:async\s+)?function\s+(\w+)/.exec(t))) add(m[1], 'f');
      if ((m = /^export\s+(?:abstract\s+)?class\s+(\w+)/.exec(t))) add(m[1], 'c');
      if ((m = /^export\s+(const|let|var|enum|interface|type)\s+(\w+)/.exec(t))) {
        add(m[2], /^(interface|type|enum)$/.test(m[1]) ? 'c' : 'v');
      }
      if ((m = /^export\s*\{([^}]*)\}/.exec(t))) {
        for (const part of m[1].split(',')) {
          const p2 = part.trim();
          if (!p2 || p2.startsWith('type ')) continue;
          const al = p2.split(/\s+as\s+/);
          const nm = (al[1] || al[0]).trim();
          if (/^[A-Za-z_$][\w$]*$/.test(nm)) add(nm, 'v');
        }
      }
      if ((m = /^export\s*\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/.exec(t))) {
        add(m[1], 'm');
      } else if ((m = /^export\s*\*\s+from\s+['"]([^'"]+)['"]/.exec(t))) {
        if (stars.length < 3) stars.push(m[1]);
      }
      if ((m = /^module\.exports\s*=\s*\{([^}]*)\}/.exec(t))) {
        isCjs = true;
        for (const part of m[1].split(',')) {
          const km = /^\s*([A-Za-z_$][\w$]*)/.exec(part);
          if (km) add(km[1], 'v');
        }
      } else if (/^module\.exports\s*=/.test(t)) isCjs = true;
      if ((m = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/.exec(t))) { isCjs = true; add(m[1], 'v'); }
    } else if (lang === 'py') {
      const am = /__all__\s*=\s*\[([^\]]*)\]/.exec(t);
      if (am) {
        allList = ((am[1].match(/['"]([^'"]+)['"]/g) || []).map((s) => s.slice(1, -1)));
        continue;
      }
      if ((m = /^def\s+(\w+)/.exec(t))) add(m[1], 'f');
      else if ((m = /^class\s+(\w+)/.exec(t))) add(m[1], 'c');
      else       if ((m = /^(\w+)\s*=[^=]/.exec(t))) add(m[1], 'v');
    }
  }
  const finalItems = allList ? items.filter((it) => allList.includes(it.w)) : items;
  return { items: finalItems, defaultKeys, hasDefault, defaultKind, isCjs, stars };
}

const expCache = new Map(); // absPath -> { key, items, defaultKeys, hasDefault, isCjs }
function targetLines(abs) {
  const norm = abs.toLowerCase();
  for (let i = 0; i < (edit.tabs || []).length; i++) {
    const tb = edit.tabs[i];
    if (tb && tb.file && (tb.file === abs || tb.file.toLowerCase() === norm)) {
      return i === edit.tabIdx ? edit.lines : tb.lines;
    }
  }
  return null;
}

function getExports(abs, lang, depth) {
  const keyOf = (lines) => {
    let chars = 0;
    for (const l of lines) chars += (l || '').length;
    return `${lines.length}\n${chars}`;
  };
  let lines = targetLines(abs);
  let key;
  if (lines) {
    key = `buf\n${keyOf(lines)}`;
  } else {
    let st = null;
    try { st = fs.statSync(abs); } catch { return null; }
    key = `disk\n${st.mtimeMs}\n${st.size}`;
    try { lines = fs.readFileSync(abs, 'utf8').split('\n'); } catch { return null; }
  }
  const ck = `${abs}\n${key}`;
  if (expCache.has(ck)) return expCache.get(ck);
  const ex = parseExports(lines, lang);
  if (depth < 1) {
    for (const spec of ex.stars) {
      const sub = resolveImport(spec, abs, lang);
      if (!sub || sub === abs) continue;
      const subEx = getExports(sub, lang, depth + 1);
      if (!subEx) continue;
      const seen = new Set(ex.items.map((it) => it.w));
      for (const it of subEx.items) {
        if (!seen.has(it.w)) { seen.add(it.w); ex.items.push(it); }
      }
    }
  }
  expCache.set(ck, ex);
  if (expCache.size > 50) expCache.delete(expCache.keys().next().value);
  return ex;
}

// members of an imported name (`import app from './app'` → app's exports)
function fileModuleMembers(recv, lang) {
  const { fileImports } = symsFor();
  const rec = fileImports[recv];
  if (!rec) return [];
  const abs = resolveImport(rec.spec, edit.file, lang);
  if (!abs) return [];
  const ex = getExports(abs, lang, 0);
  if (!ex) return [];
  if (rec.kind === 'namespace') {
    const out = ex.items.slice();
    if (ex.hasDefault && !out.some((it) => it.w === 'default')) out.push({ w: 'default', k: 'v' });
    return out;
  }
  // default import: CJS exports object or `export default {…}` keys are the
  // object's own props; a named `export default` is opaque (members unknown);
  // a default-less module leans on interop and offers its named exports
  if (ex.isCjs) return ex.items.slice();
  if (ex.defaultKind === 'object') return ex.defaultKeys.slice();
  if (ex.defaultKind === 'named' || ex.defaultKind === 'expr') return [];
  return ex.items.slice();
}

// --- item assembly ---------------------------------------------------------
const KIND_RANK = { d: -1, f: 0, m: 0, p: 1, v: 2, c: 3, k: 4, w: 5 };

function rankItems(items, prefix) {
  const low = prefix.toLowerCase();
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (seen.has(it.w)) continue;
    seen.add(it.w);
    if (!it.w.toLowerCase().startsWith(low)) continue;
    out.push(it);
  }
  out.sort((a, b) => {
    const ac = a.w[0] === prefix[0] ? 0 : 1;
    const bc = b.w[0] === prefix[0] ? 0 : 1;
    if (ac !== bc) return ac - bc;
    const ka = KIND_RANK[a.k] ?? 6;
    const kb = KIND_RANK[b.k] ?? 6;
    if (ka !== kb) return ka - kb;
    if (a.w.length !== b.w.length) return a.w.length - b.w.length;
    return a.w.localeCompare(b.w);
  });
  return out.slice(0, MAX_ITEMS);
}

function memberItems(recv, prefix) {
  const lang = langOf(edit.file);
  const isJs = lang === 'js' || lang === 'ts';
  const isPy = lang === 'py';
  const pool = [];
  if (isJs && JS_KNOWN[recv]) pool.push(...JS_KNOWN[recv]);
  else if (isPy && PY_KNOWN[recv]) pool.push(...PY_KNOWN[recv]);
  const { imports } = symsFor();
  if (imports[recv]) {
    const mod = imports[recv];
    if (isJs && JS_MODULES[mod]) pool.push(...JS_MODULES[mod]);
    else if (isPy && PY_MODULES[mod]) pool.push(...PY_MODULES[mod]);
  }
  // imported file's own exports beat every heuristic below
  const fim = fileModuleMembers(recv, lang);
  if (fim.length) {
    pool.push(...fim);
  } else {
    const t = inferType(edit.lines, recv, lang);
    if (t) {
      if (isJs && JS_TYPE_MEMBERS[t]) pool.push(...JS_TYPE_MEMBERS[t]);
      else if (isPy && PY_TYPE_MEMBERS[t]) pool.push(...PY_TYPE_MEMBERS[t]);
    }
  }
  pool.push(...recvUsages(edit.lines, recv, edit.row));
  // member fallback is strict: with an empty prefix only provable members
  // show (never the whole buffer dictionary); otherwise only names actually
  // seen after a dot — `from`/`import`/bare words are not members of recv
  if (prefix) pool.push(...bufferProps(edit.lines, edit.row, edit.col, prefix));
  return rankItems(pool, prefix);
}

function wordItems(prefix) {
  const lang = langOf(edit.file);
  const isJs = lang === 'js' || lang === 'ts';
  const isPy = lang === 'py';
  const pool = [];
  for (const k of KW[lang] || []) pool.push({ w: k, k: 'k' });
  for (const t of TYPES[lang] || []) pool.push({ w: t, k: 'c' });
  for (const b of BOOLS) pool.push({ w: b, k: 'k' });
  if (isJs) for (const g of JS_GLOBALS) pool.push(g);
  if (isPy) {
    for (const g of PY_BUILTINS) pool.push(g);
    for (const g of PY_EXC) pool.push(g);
  }
  const { syms } = symsFor();
  pool.push(...syms);
  pool.push(...bufferWords(edit.lines, edit.row, edit.col, prefix));
  return rankItems(pool, prefix);
}

// --- popup lifecycle -------------------------------------------------------
function ctxKey() {
  return `${edit.file}\n${edit.tabIdx}\n${edit.row}`;
}

function validate() {
  if (!popup) return false;
  if (edit.file !== popup.file || edit.tabIdx !== popup.tabIdx || edit.row !== popup.row) {
    popup = null;
    return false;
  }
  const line = edit.lines[edit.row] || '';
  if (edit.col < popup.startCol) { popup = null; return false; }
  if (popup.mode === 'path') {
    if (line[popup.startCol - 1] !== popup.anchor) { popup = null; return false; }
    const cur = line.slice(popup.startCol, edit.col);
    if (!/^[^"'\s`]*$/.test(cur)) { popup = null; return false; }
    popup.prefix = cur;
    return true;
  }
  if (popup.mode === 'member') {
    const head = line.slice(0, popup.startCol);
    if (!head.endsWith(`${popup.receiver}.`)) { popup = null; return false; }
  }
  const cur = line.slice(popup.startCol, edit.col);
  if (!/^[\w$]*$/.test(cur)) { popup = null; return false; }
  popup.prefix = cur;
  return true;
}

function trigger(mode, receiver, prefix, startCol, anchor, extra) {
  const sig = `${mode}\n${receiver}\n${ctxKey()}\n${startCol}`;
  if (popup && popup.sig === sig) {
    if (!validate()) return false;
    refilter();
    return !!popup;
  }
  popup = {
    mode, receiver, prefix, startCol, anchor: anchor || '', extra: extra || null,
    row: edit.row, file: edit.file, tabIdx: edit.tabIdx, sig,
    all: mode === 'member' ? memberItems(receiver, prefix)
      : mode === 'path' ? pathItems(receiver, prefix, extra && extra.bareRoot)
      : wordItems(prefix),
    fLow: prefix.toLowerCase(),
    items: [], sel: 0,
  };
  refilter();
  return !!popup;
}

// rebuild the pool when the prefix shrank (e.g. backspace) so narrowing
// never hides candidates that were filtered out before
function buildAll() {
  if (popup.mode === 'member') return memberItems(popup.receiver, '');
  if (popup.mode === 'path') return pathItems(popup.receiver, '', popup.extra && popup.extra.bareRoot);
  return wordItems('');
}

function refilter() {
  if (!validate()) return;
  const low = popup.prefix.toLowerCase();
  if (!popup.fLow || !low.startsWith(popup.fLow)) {
    popup.all = buildAll();
    popup.fLow = low;
  }
  popup.items = popup.all.filter((it) => it.w.toLowerCase().startsWith(low));
  if (!popup.items.length) { popup = null; return; }
  if (popup.sel >= popup.items.length) popup.sel = 0;
}

function dismiss() {
  popup = null;
}

function isOpen() {
  return validate() && !!popup && popup.items.length > 0;
}

function view() {
  if (!isOpen()) return null;
  return { items: popup.items, sel: popup.sel };
}

// context at the cursor; auto=false only fires on explicit demand
function contextAt(auto) {
  if (state.mode !== 'edit' || edit.find) return null;
  const lang = langOf(edit.file);
  const line = edit.lines[edit.row] || '';
  const before = line.slice(0, edit.col);
  const pc = pathContext(line, edit.col, lang);
  if (pc) return { mode: 'path', receiver: pc.base, prefix: pc.segment, startCol: pc.start, anchor: pc.anchor, extra: { bareRoot: pc.bareRoot } };
  if (auto && !AUTO_LANGS.has(lang)) return null;
  if (auto && !inCode(line, edit.col, lang)) return null;
  const m = before.match(/([A-Za-z_$][\w$]*)\.([\w$]*)$/);
  if (m) return { mode: 'member', receiver: m[1], prefix: m[2], startCol: edit.col - m[2].length };
  const w = before.match(/([A-Za-z_$][\w$]*)$/);
  if (!w) return null;
  if (auto && w[1].length < 2) return null;
  if (!auto && w[1].length < 1) return null;
  return { mode: 'word', receiver: '', prefix: w[1], startCol: edit.col - w[1].length };
}

function afterType() {
  const ctx = contextAt(true);
  if (!ctx) return dismiss();
  trigger(ctx.mode, ctx.receiver, ctx.prefix, ctx.startCol, ctx.anchor, ctx.extra);
}

function manual() {
  const ctx = contextAt(false);
  if (!ctx) { dismiss(); return ui.render(); }
  trigger(ctx.mode, ctx.receiver, ctx.prefix, ctx.startCol, ctx.anchor, ctx.extra);
  ui.render();
}

// editKey integration: nav keys first. Returns true when the key is fully
// handled (snap arrives from editKey for the single-undo-step accept).
function popupKey(key, snap) {
  if (!popup) return false;
  if (!validate()) return false;
  if (key === '\u001b') { dismiss(); ui.render(); return true; } // esc closes popup first
  if (key === '\r' || key === '\t') return accept(snap, key === '\t'); // enter accepts, tab too (dirs keep completing)
  if (key === '\x1b[A' || key === '\x1bOA') { moveSel(-1); return true; }
  if (key === '\x1b[B' || key === '\x1bOB') { moveSel(1); return true; }
  return false; // typing keys fall through; afterType() refilters
}

function moveSel(d) {
  if (!validate() || !popup.items.length) return;
  popup.sel = (popup.sel + d + popup.items.length) % popup.items.length;
  ui.render();
}

function accept(snap, keep) {
  if (!validate()) return false;
  const item = popup.items[popup.sel];
  if (!item) { dismiss(); return false; }
  const line = edit.lines[edit.row] || '';
  const wasPathDir = popup.mode === 'path' && item.k === 'd';
  snap();
  edit.lines[edit.row] = line.slice(0, popup.startCol) + item.w + line.slice(edit.col);
  edit.col = popup.startCol + item.w.length;
  edit.dirty = true;
  edit.confirmDiscard = false;
  if (keep && wasPathDir && item.w.endsWith('/')) {
    // completing a directory drills in: rebuild for the next segment
    const ctx = contextAt(true);
    if (ctx && ctx.mode === 'path') {
      trigger(ctx.mode, ctx.receiver, ctx.prefix, ctx.startCol, ctx.anchor, ctx.extra);
      ui.render();
      return true;
    }
  }
  dismiss();
  ui.render();
  return true;
}

Object.assign(module.exports, {
  popupKey, afterType, manual, dismiss, isOpen, view, kindColor,
  trigger, memberItems, wordItems, inferType, scanBuffer,
  pathItems, pathContext, resolveImport, parseExports, fileModuleMembers,
});
