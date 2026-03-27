// ─── HTML escape ──────────────────────────────────────────────────────────────

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Token colours (Tokyo Night palette) ─────────────────────────────────────

const C = {
  kwDecl:      '#bb9af7', // purple  — const, let, function, class, struct …
  kwFlow:      '#f7768e', // pink    — if, else, for, while, return, break …
  kwMod:       '#73daca', // teal    — public, private, static, override …
  kwLiteral:   '#ff9e64', // orange  — true, false, null, nil, None …
  string:      '#9ece6a', // green
  comment:     '#565f89', // muted blue-grey
  number:      '#ff9e64', // orange
  fn:          '#7aa2f7', // blue    — function calls & names
  type:        '#2ac3de', // cyan    — PascalCase identifiers, type names
  decorator:   '#e0af68', // amber   — @annotations, Swift attributes
  preproc:     '#e0af68', // amber   — #include, #define, #pragma
  operator:    '#89ddff', // light cyan
  punct:       '#c0caf5', // near-white
  escape:      '#ff9e64', // escape sequences \n, \t, \uXXXX
}

function s(color: string, text: string, bold = false) {
  const b = bold ? ';font-weight:600' : ''
  return `<span style="color:${color}${b}">${esc(text)}</span>`
}

// ─── Language configs ─────────────────────────────────────────────────────────

interface LangCfg {
  decl:    Set<string>   // declaration keywords
  flow:    Set<string>   // control-flow keywords
  mod:     Set<string>   // modifier / access keywords
  lit:     Set<string>   // literal keywords (true/false/null/nil)
  hash:    boolean       // # line comments
  preproc: boolean       // C-style preprocessor directives
  at:      boolean       // @ decorator / attribute prefix
  jsx:     boolean       // JSX/TSX angle-bracket tags
  swift:   boolean
  objc:    boolean
  kotlin:  boolean
}

const LANG: Record<string, LangCfg> = {

  // ── JavaScript / TypeScript ─────────────────────────────────────────────
  js: {
    decl: new Set(['function','const','let','var','class','type','interface',
                   'enum','import','export','from','extends','implements',
                   'declare','abstract','namespace','module','require',
                   'async','constructor','get','set','yield','typeof',
                   'instanceof','in','of','keyof','infer','new','delete',
                   'void','as','satisfies']),
    flow: new Set(['if','else','for','while','do','switch','case','default',
                   'break','continue','return','throw','try','catch','finally',
                   'debugger']),
    mod:  new Set(['public','private','protected','static','readonly',
                   'override','abstract','declare','export','default',
                   'never','unknown','any']),
    lit:  new Set(['true','false','null','undefined','this','super','NaN',
                   'Infinity']),
    hash: false, preproc: false, at: true, jsx: false,
    swift: false, objc: false, kotlin: false,
  },

  // ── Swift ────────────────────────────────────────────────────────────────
  swift: {
    decl: new Set(['func','var','let','class','struct','enum','protocol',
                   'extension','typealias','associatedtype','init','deinit',
                   'subscript','import','operator','precedencegroup']),
    flow: new Set(['if','else','guard','for','while','repeat','switch','case',
                   'default','break','continue','return','throw','do','try',
                   'catch','defer','fallthrough','where']),
    mod:  new Set(['public','private','fileprivate','internal','open','static',
                   'class','mutating','nonmutating','override','final','lazy',
                   'required','convenience','weak','unowned','indirect','some',
                   'any','inout','throws','rethrows','async','await','actor']),
    lit:  new Set(['true','false','nil','self','Self','super','Any','AnyObject']),
    hash: false, preproc: false, at: true, jsx: false,
    swift: true, objc: false, kotlin: false,
  },

  // ── C ───────────────────────────────────────────────────────────────────
  c: {
    decl: new Set(['void','int','char','float','double','long','short','unsigned',
                   'signed','struct','union','enum','typedef','sizeof','typeof',
                   'inline','_Bool','_Complex','_Imaginary','_Noreturn',
                   '_Static_assert','_Alignas','_Alignof','_Generic']),
    flow: new Set(['if','else','for','while','do','switch','case','default',
                   'break','continue','return','goto']),
    mod:  new Set(['const','volatile','extern','static','register','auto',
                   'restrict']),
    lit:  new Set(['NULL','true','false','EXIT_SUCCESS','EXIT_FAILURE']),
    hash: false, preproc: true, at: false, jsx: false,
    swift: false, objc: false, kotlin: false,
  },

  // ── C++ ──────────────────────────────────────────────────────────────────
  cpp: {
    decl: new Set(['void','int','char','float','double','long','short','unsigned',
                   'signed','bool','auto','struct','union','class','enum',
                   'typedef','template','typename','namespace','using',
                   'operator','friend','inline','explicit','virtual','sizeof',
                   'alignas','alignof','decltype','noexcept','consteval',
                   'constinit','co_await','co_return','co_yield','concept',
                   'requires','export','module']),
    flow: new Set(['if','else','for','while','do','switch','case','default',
                   'break','continue','return','goto','throw','try','catch']),
    mod:  new Set(['const','constexpr','volatile','extern','static','register',
                   'mutable','public','private','protected','override','final',
                   'delete','default','new','delete']),
    lit:  new Set(['true','false','nullptr','NULL','this','and','or','not',
                   'bitand','bitor','xor','compl','and_eq','or_eq','xor_eq',
                   'not_eq']),
    hash: false, preproc: true, at: false, jsx: false,
    swift: false, objc: false, kotlin: false,
  },

  // ── Objective-C ──────────────────────────────────────────────────────────
  m: {
    decl: new Set(['void','int','char','float','double','long','short','unsigned',
                   'signed','BOOL','id','SEL','IMP','Class','struct','union',
                   'enum','typedef','sizeof','instancetype','__strong','__weak',
                   '__block','__unsafe_unretained']),
    flow: new Set(['if','else','for','while','do','switch','case','default',
                   'break','continue','return','goto','@try','@catch','@finally',
                   '@throw']),
    mod:  new Set(['const','volatile','extern','static','register','auto',
                   'nullable','nonnull','null_resettable','IBOutlet','IBAction',
                   'NS_DESIGNATED_INITIALIZER','NS_UNAVAILABLE']),
    lit:  new Set(['YES','NO','nil','Nil','NULL','self','super','true','false']),
    hash: false, preproc: true, at: true, jsx: false,
    swift: false, objc: true, kotlin: false,
  },

  // ── Kotlin ────────────────────────────────────────────────────────────────
  kt: {
    decl: new Set(['fun','val','var','class','object','interface','data','sealed',
                   'abstract','open','companion','typealias','init','constructor',
                   'import','package','annotation','enum','inline','crossinline',
                   'noinline','reified','operator','infix','external','tailrec',
                   'suspend','actual','expect','by']),
    flow: new Set(['if','else','when','for','while','do','return','break',
                   'continue','throw','try','catch','finally','in','is','as',
                   'out','where']),
    mod:  new Set(['public','private','protected','internal','override','final',
                   'open','abstract','sealed','data','inner','lateinit','const',
                   'get','set']),
    lit:  new Set(['true','false','null','this','super','it']),
    hash: false, preproc: false, at: true, jsx: false,
    swift: false, objc: false, kotlin: true,
  },
}

// aliases
LANG['ts']     = LANG['js']
LANG['tsx']    = { ...LANG['js'], jsx: true }
LANG['jsx']    = { ...LANG['js'], jsx: true }
LANG['mjs']    = LANG['js']
LANG['cjs']    = LANG['js']
LANG['h']      = LANG['cpp']
LANG['hpp']    = LANG['cpp']
LANG['cc']     = LANG['cpp']
LANG['cxx']    = LANG['cpp']
LANG['mm']     = LANG['m']      // Objective-C++
LANG['kts']    = LANG['kt']

function langFor(ext: string): LangCfg {
  return LANG[ext] ?? LANG['js']
}

// ─── JSX tag scanner (greedy, aborts on complex expressions) ─────────────────

function tryJsxTag(code: string, i: number): string | null {
  // Must start with < followed by [A-Za-z/!]
  if (code[i] !== '<') return null
  const ch1 = code[i + 1]
  if (!ch1 || !/[A-Za-z/!]/.test(ch1)) return null

  let j = i + 1
  let depth = 1

  while (j < code.length && depth > 0) {
    const c = code[j]
    if (c === '<') depth++
    else if (c === '>') { depth--; if (depth === 0) { j++; break } }
    else if (c === '\n') break   // bail on multiline
    j++
  }

  if (depth !== 0) return null
  const tag = code.slice(i, j)
  // Sanity: must look like a tag, not a comparison
  if (!/^<[A-Za-z/!?]/.test(tag)) return null
  return tag
}

// ─── Main highlighter ─────────────────────────────────────────────────────────

export function highlightCode(code: string, ext: string): string {
  const lang = langFor(ext)
  let result = ''
  let i = 0

  while (i < code.length) {
    const ch  = code[i]
    const ch2 = code[i + 1] ?? ''

    // ── C/C++/ObjC preprocessor line  (#include, #define, …) ──────────────
    if (lang.preproc && ch === '#' && (i === 0 || code[i - 1] === '\n')) {
      const end = code.indexOf('\n', i)
      const line = end === -1 ? code.slice(i) : code.slice(i, end)
      // Split into directive + rest
      const m = line.match(/^(#\s*\w+)(.*)$/)
      if (m) {
        result += s(C.preproc, m[1], true) + s(C.string, m[2])
      } else {
        result += s(C.preproc, line)
      }
      i += line.length
      continue
    }

    // ── ObjC special keywords  @interface, @implementation, @end, @property …
    if (lang.objc && ch === '@' && /[a-z]/.test(ch2)) {
      let j = i + 1
      while (j < code.length && /\w/.test(code[j])) j++
      const kw = code.slice(i, j)
      result += s(C.kwDecl, kw, true)
      i = j
      continue
    }

    // ── Decorators / annotations  (@Component, @State, @JvmStatic …) ──────
    if (lang.at && ch === '@' && /[A-Za-z_]/.test(ch2)) {
      let j = i + 1
      while (j < code.length && /[\w.]/.test(code[j])) j++
      result += s(C.decorator, code.slice(i, j))
      i = j
      continue
    }

    // ── Line comment  //  ─────────────────────────────────────────────────
    if (ch === '/' && ch2 === '/') {
      const end = code.indexOf('\n', i)
      const txt = end === -1 ? code.slice(i) : code.slice(i, end)
      result += s(C.comment, txt)
      i += txt.length
      continue
    }

    // ── Block comment  /* */  ─────────────────────────────────────────────
    if (ch === '/' && ch2 === '*') {
      const end = code.indexOf('*/', i + 2)
      const txt = end === -1 ? code.slice(i) : code.slice(i, end + 2)
      result += s(C.comment, txt)
      i += txt.length
      continue
    }

    // ── Swift/Kotlin/C++ doc comment  ///  (already caught above)

    // ── Double-quoted string  "…" ─────────────────────────────────────────
    if (ch === '"') {
      // C++ raw string  R"delimiter(…)delimiter"
      if ((ext === 'cpp' || ext === 'cc' || ext === 'cxx' || ext === 'h' || ext === 'hpp') &&
           ch2 === '"' && code[i - 1] === 'R') {
        // already consumed R as identifier; skip  (handled below in ident block)
      }
      let j = i + 1
      let out = '"'
      while (j < code.length) {
        const c = code[j]
        if (c === '\\') {
          // escape sequence — colour differently inside string span
          out += esc(c) + esc(code[j + 1] ?? '')
          j += 2
          continue
        }
        if (c === '"') { out += '"'; j++; break }
        // Swift string interpolation  \(…)
        if (lang.swift && c === '\\' && code[j + 1] === '(') {
          // close current string, emit interpolation, reopen
          out += '"'; j++  // skipped below via continue
          // fall through to outer loop
          break
        }
        // Kotlin string template  ${…} or $ident
        if (lang.kotlin && c === '$') {
          out += esc(c); j++; continue
        }
        out += esc(c); j++
      }
      result += s(C.string, '', false).replace('</span>', '') + out + '</span>'
      i = j
      continue
    }

    // ── Single-quoted string / char  '…' ─────────────────────────────────
    if (ch === "'") {
      // JS template: skip (handled as ` below)
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === "'") { j++; break }
        if (code[j] === '\n') break   // unterminated
        j++
      }
      result += s(C.string, code.slice(i, j))
      i = j
      continue
    }

    // ── Template literal / backtick  `…` ─────────────────────────────────
    if (ch === '`') {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === '`') { j++; break }
        // ${…} interpolation — just colour everything as string (good enough)
        j++
      }
      result += s(C.string, code.slice(i, j))
      i = j
      continue
    }

    // ── Swift multi-line string  """…""" ─────────────────────────────────
    if (lang.swift && ch === '"' && ch2 === '"' && code[i + 2] === '"') {
      const end = code.indexOf('"""', i + 3)
      const txt = end === -1 ? code.slice(i) : code.slice(i, end + 3)
      result += s(C.string, txt)
      i += txt.length
      continue
    }

    // ── Kotlin raw string  """…""" ────────────────────────────────────────
    if (lang.kotlin && ch === '"' && ch2 === '"' && code[i + 2] === '"') {
      const end = code.indexOf('"""', i + 3)
      const txt = end === -1 ? code.slice(i) : code.slice(i, end + 3)
      result += s(C.string, txt)
      i += txt.length
      continue
    }

    // ── JSX / TSX tag  <Comp …>  </Comp>  ────────────────────────────────
    if (lang.jsx && ch === '<') {
      const tag = tryJsxTag(code, i)
      if (tag) {
        // Tag name in type colour, attributes stay default
        const tagged = tag
          .replace(/^(<\/?)([A-Za-z][A-Za-z0-9._-]*)/, (_m, slash, name) =>
            esc(slash) + s(C.type, name)
          )
          .replace(/([\w-]+)=/g, (_, attr) => s(C.fn, attr) + '=')
          // string attr values
          .replace(/("[^"]*"|'[^']*')/g, (str) => s(C.string, str))
        result += `<span style="color:${C.punct}">${tagged}</span>`
        i += tag.length
        continue
      }
    }

    // ── Number ────────────────────────────────────────────────────────────
    if (/[0-9]/.test(ch) ||
        (ch === '.' && /[0-9]/.test(ch2)) ||
        (ch === '0' && (ch2 === 'x' || ch2 === 'b' || ch2 === 'o'))) {
      let j = i
      // hex
      if (ch === '0' && (ch2 === 'x' || ch2 === 'X')) {
        j += 2; while (j < code.length && /[0-9a-fA-F_]/.test(code[j])) j++
      } else if (ch === '0' && (ch2 === 'b' || ch2 === 'B')) {
        j += 2; while (j < code.length && /[01_]/.test(code[j])) j++
      } else if (ch === '0' && (ch2 === 'o' || ch2 === 'O')) {
        j += 2; while (j < code.length && /[0-7_]/.test(code[j])) j++
      } else {
        while (j < code.length && /[0-9_]/.test(code[j])) j++
        if (code[j] === '.' && /[0-9]/.test(code[j + 1] ?? '')) {
          j++; while (j < code.length && /[0-9_]/.test(code[j])) j++
        }
        if (code[j] === 'e' || code[j] === 'E') {
          j++
          if (code[j] === '+' || code[j] === '-') j++
          while (j < code.length && /[0-9]/.test(code[j])) j++
        }
      }
      // numeric suffixes: u32, i64, f32, usize, L, UL, f, etc.
      while (j < code.length && /[a-zA-Z_]/.test(code[j])) j++
      result += s(C.number, code.slice(i, j))
      i = j
      continue
    }

    // ── Identifier / keyword ──────────────────────────────────────────────
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i
      while (j < code.length && /[\w$]/.test(code[j])) j++
      const word = code.slice(i, j)

      // Peek past whitespace
      let k = j
      while (k < code.length && (code[k] === ' ' || code[k] === '\t')) k++
      const nextCh = code[k] ?? ''

      // C++ raw string  R"…"
      if ((ext === 'cpp' || ext === 'cc' || ext === 'cxx' || ext === 'h' || ext === 'hpp')
          && word === 'R' && code[j] === '"') {
        // find closing  )"
        let close = code.indexOf(')"', j + 1)
        if (close === -1) close = code.length - 2
        const raw = code.slice(i, close + 2)
        result += s(C.string, raw)
        i = close + 2
        continue
      }

      if (lang.decl.has(word)) {
        result += s(C.kwDecl, word, true)
      } else if (lang.flow.has(word)) {
        result += s(C.kwFlow, word, true)
      } else if (lang.mod.has(word)) {
        result += s(C.kwMod, word)
      } else if (lang.lit.has(word)) {
        result += s(C.kwLiteral, word)
      } else if (nextCh === '(' || nextCh === '!') {
        result += s(C.fn, word)
      } else if (/^[A-Z]/.test(word) && word.length > 1) {
        result += s(C.type, word)
      } else {
        result += esc(word)
      }
      i = j
      continue
    }

    // ── Operators ─────────────────────────────────────────────────────────
    if (/[=<>!+\-*/%&|^~?:.]/.test(ch)) {
      // Multi-char operators: =>, ->, :=, ::, ??, ?., ..<, ...
      const two   = ch + ch2
      const three = two + (code[i + 2] ?? '')
      let op: string
      if (['=>', '->', '::', '??', '?.', '..', '...', '..<', '**', '||', '&&',
           '==', '!=', '<=', '>=', '++', '--', '<<', '>>', '+=', '-=', '*=',
           '/=', '&=', '|=', '^=', '!==', '==='].includes(three)) {
        op = three
      } else if (['=>', '->', '::', '??', '?.', '..', '**', '||', '&&',
                  '==', '!=', '<=', '>=', '++', '--', '<<', '>>'].includes(two)) {
        op = two
      } else {
        op = ch
      }
      result += s(C.operator, op)
      i += op.length
      continue
    }

    // ── Punctuation ───────────────────────────────────────────────────────
    if (/[{}()[\];,]/.test(ch)) {
      result += s(C.punct, ch)
      i++
      continue
    }

    // ── Fallthrough ───────────────────────────────────────────────────────
    result += esc(ch)
    i++
  }

  return result
}
