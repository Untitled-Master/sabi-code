// Token vocabularies. Booleans and builtin types get their own colors
// (VSCode treats them as constants / type-support, not plain keywords).
const BOOLS = 'true false null None TRUE FALSE NULL NONE nil NIL'.split(' ');

const KW = {
  js: 'const let var function return if else for while do switch case break continue new delete typeof instanceof in of try catch finally throw class extends super import export from default async await yield static get set this undefined void with debugger'.split(' '),
  py: 'def return if elif else for while in not and or is import from as class try except finally raise with lambda pass yield global nonlocal assert del async await'.split(' '),
  go: 'package import func var const type struct interface map chan go select case default if else for range return break continue fallthrough defer iota'.split(' '),
  rust: 'fn let mut const struct enum impl trait pub use mod crate if else match for while loop return break continue move ref static self Self super where async await dyn'.split(' '),
  c: 'int char float double void short long signed unsigned struct union enum typedef static const extern volatile register auto if else for while do switch case break continue return goto sizeof include define ifdef ifndef endif pragma'.split(' '),
  java: 'class interface enum extends implements package import public private protected static final void int long double float boolean char byte short if else for while do switch case break continue return new try catch finally throw throws this super'.split(' '),
  sh: 'if then else elif fi for while do done in case esac function select return exit export local readonly echo cd ls'.split(' '),
  sql: 'SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE DROP ALTER JOIN ON AS ORDER BY GROUP HAVING LIMIT OFFSET DISTINCT'.split(' '),
  json: [], yaml: [], ini: [],
  css: 'color background margin padding border font display flex grid position absolute relative import media'.split(' '),
  html: [],
};
// builtin types get the `type` color (VSCode treats these as type/support)
const TYPES = {
  ts: 'string number boolean void any unknown never object symbol bigint'.split(' '),
  py: 'int str float bool bytes list dict tuple set frozenset object type'.split(' '),
  go: 'string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 bool byte rune error any'.split(' '),
  rust: 'i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 isize usize char str bool String Vec Option Result'.split(' '),
};
KW.ts = [...KW.js, 'interface', 'type', 'enum', 'namespace', 'declare', 'abstract', 'implements', 'readonly', 'private', 'public', 'protected', 'keyof', 'infer', 'satisfies', 'override'];
KW.tsx = KW.ts; KW.jsx = KW.js; KW.mjs = KW.js; KW.cjs = KW.js;
KW.cpp = KW.c; KW.h = KW.c; KW.hpp = KW.c; KW.cs = KW.java; KW.kt = KW.java; KW.swift = KW.java; KW.php = KW.java;
KW.rb = KW.py;

module.exports = { BOOLS, KW, TYPES };
