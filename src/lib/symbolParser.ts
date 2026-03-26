import type { FileSymbol } from '../types/events'

// ─── Color map (shared with FileSchemaCard) ───────────────────────────────────

export const SYMBOL_COLORS: Record<FileSymbol['kind'], string> = {
  function: '#3b82f6',
  class:    '#8b5cf6',
  type:     '#06b6d4',
  variable: '#f59e0b',
}

export const SYMBOL_LETTER: Record<FileSymbol['kind'], string> = {
  function: 'f',
  class:    'c',
  type:     't',
  variable: 'v',
}

// ─── Per-extension patterns ───────────────────────────────────────────────────

type Rule = [FileSymbol['kind'], RegExp]

const TS_RULES: Rule[] = [
  ['function', /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/],
  ['function', /^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/],
  ['function', /^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\w*\s*=>/],
  ['class',    /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/],
  ['type',     /^\s*(?:export\s+)?(?:type|interface|enum)\s+(\w+)/],
  ['variable', /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)/],
]

const RUST_RULES: Rule[] = [
  ['function', /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/],
  ['class',    /^\s*(?:pub\s+)?struct\s+(\w+)/],
  ['class',    /^\s*impl(?:<[^>]+>)?\s+(?:\w+\s+for\s+)?(\w+)/],
  ['type',     /^\s*(?:pub\s+)?(?:enum|trait|type)\s+(\w+)/],
  ['variable', /^\s*(?:pub\s+)?(?:static|const)\s+(\w+)/],
]

const PYTHON_RULES: Rule[] = [
  ['function', /^\s*(?:async\s+)?def\s+(\w+)/],
  ['class',    /^\s*class\s+(\w+)/],
]

const GO_RULES: Rule[] = [
  ['function', /^\s*func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/],
  ['type',     /^\s*type\s+(\w+)/],
  ['variable', /^\s*(?:var|const)\s+(\w+)/],
]

const SWIFT_RULES: Rule[] = [
  ['function', /^\s*(?:(?:public|private|internal|open|fileprivate|override|static|class|mutating|async)\s+)*func\s+(\w+)/],
  ['class',    /^\s*(?:(?:public|private|open|final)\s+)*(?:class|struct|actor)\s+(\w+)/],
  ['type',     /^\s*(?:(?:public|private|internal)\s+)*(?:protocol|enum|typealias|extension)\s+(\w+)/],
  ['variable', /^\s*(?:(?:public|private|internal|lazy|static|weak)\s+)*(?:var|let)\s+(\w+)/],
]

const C_RULES: Rule[] = [
  ['function', /^\s*(?:\w+\s+)+\**(\w+)\s*\([^)]*\)\s*\{?$/],
  ['class',    /^\s*(?:typedef\s+)?struct\s+(\w+)/],
  ['type',     /^\s*typedef\s+(?:struct\s+\w+\s+)?(\w+)\s*;/],
  ['variable', /^\s*(?:static|extern|const)\s+(?:\w+\s+)+\**(\w+)\s*[=;]/],
]

const CPP_RULES: Rule[] = [
  ['function', /^\s*(?:(?:inline|static|virtual|explicit|constexpr|override|friend)\s+)*(?:\w[\w:*&<>, ]*\s+)+\**(\w+)\s*\(/],
  ['class',    /^\s*(?:template\s*<[^>]*>\s*)?(?:class|struct)\s+(\w+)/],
  ['type',     /^\s*(?:enum(?:\s+class)?|union|namespace|typedef)\s+(\w+)/],
  ['variable', /^\s*(?:constexpr|static\s+constexpr|const)\s+(?:\w+\s+)+(\w+)\s*=/],
]

const OBJC_RULES: Rule[] = [
  ['class',    /^@(?:interface|implementation|protocol)\s+(\w+)/],
  ['function', /^[-+]\s*\([^)]*\)\s*(\w+)/],
  ['variable', /^@property\s*(?:\([^)]*\)\s*)?(?:\w+\s*\**\s*)(\w+)/],
  ['type',     /^\s*typedef\s+(?:struct\s+\w+\s+)?(\w+)\s*;/],
]

const KOTLIN_RULES: Rule[] = [
  ['function', /^\s*(?:(?:public|private|internal|protected|override|suspend|inline|operator|infix|tailrec)\s+)*fun\s+(?:<[^>]*>\s*)?(\w+)/],
  ['class',    /^\s*(?:(?:data|sealed|abstract|open|inner|inline)\s+)*(?:class|object|interface)\s+(\w+)/],
  ['type',     /^\s*(?:enum\s+class|typealias)\s+(\w+)/],
  ['variable', /^\s*(?:(?:private|internal|protected|lateinit|const|override)\s+)*(?:val|var)\s+(\w+)/],
]

function rulesForExt(ext: string): Rule[] {
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs': case 'cjs':
      return TS_RULES
    case 'rs':
      return RUST_RULES
    case 'py':
      return PYTHON_RULES
    case 'go':
      return GO_RULES
    case 'swift':
      return SWIFT_RULES
    case 'c': case 'h':
      return C_RULES
    case 'cpp': case 'cc': case 'cxx': case 'hpp':
      return CPP_RULES
    case 'm': case 'mm':
      return OBJC_RULES
    case 'kt': case 'kts':
      return KOTLIN_RULES
    default:
      return TS_RULES  // best-effort fallback
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseSymbols(content: string, ext: string): FileSymbol[] {
  const rules = rulesForExt(ext)
  const lines = content.split('\n')
  const symbols: FileSymbol[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const [kind, re] of rules) {
      const m = line.match(re)
      if (m && m[1]) {
        const name = m[1]
        const key = `${kind}:${name}`
        if (!seen.has(key)) {
          seen.add(key)
          symbols.push({ kind, name, line: i + 1 })
        }
        break  // one rule per line
      }
    }
    if (symbols.length >= 30) break
  }

  return symbols
}
