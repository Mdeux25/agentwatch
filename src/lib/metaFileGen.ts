import { parseSymbols, extractPseudo } from './symbolParser'
import type { FileSymbol } from '../types/events'

// ── Import parsing (subset of mindMapBuilder, inline to avoid coupling) ────────

function parseImports(content: string, ext: string): { relative: string[]; external: string[] } {
  const relative: string[] = []
  const external: string[] = []

  if (['ts','tsx','js','jsx','mjs','cjs','vue'].includes(ext)) {
    const re1 = /(?:import|from)\s+['"]([^'"]+)['"]/g
    const re2 = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    let m: RegExpExecArray | null
    while ((m = re1.exec(content)) !== null) {
      const imp = m[1]
      if (imp.startsWith('.')) relative.push(imp)
      else external.push(imp.startsWith('@') ? imp.split('/').slice(0,2).join('/') : imp.split('/')[0])
    }
    while ((m = re2.exec(content)) !== null) {
      const imp = m[1]
      if (imp.startsWith('.')) relative.push(imp)
    }
  } else if (ext === 'py') {
    const re = /^(?:import|from)\s+(\S+)/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      external.push(m[1].split('.')[0])
    }
  }

  return {
    relative: [...new Set(relative)],
    external: [...new Set(external)],
  }
}

// ── Colors ────────────────────────────────────────────────────────────────────

const EXT_COLOR: Record<string, string> = {
  ts:'#3b82f6', tsx:'#818cf8', js:'#eab308', jsx:'#f97316',
  css:'#06b6d4', scss:'#e879f9', html:'#f97316', md:'#94a3b8',
  json:'#eab308', swift:'#fb923c', py:'#fbbf24', go:'#00acd7',
  rs:'#fb923c', rb:'#cc342d', vue:'#4ade80', dart:'#22d3ee',
}

const KIND_COLOR: Record<string, string> = {
  function:'#60a5fa', class:'#a78bfa', type:'#22d3ee', variable:'#fbbf24',
}

const KIND_ICON: Record<string, string> = {
  function:'ƒ', class:'c', type:'T', variable:'◉',
}


// ── HTML summary ──────────────────────────────────────────────────────────────

export function generateContextHtml(
  filePath: string,
  content: string,
  ext: string,
): string {
  const label   = filePath.split('/').pop() ?? filePath
  const accent  = EXT_COLOR[ext] ?? '#64748b'
  const date    = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const { relative, external } = parseImports(content, ext)
  const rawSymbols = parseSymbols(content, ext)
  const lines   = content.split('\n')
  const symbols = rawSymbols.map((sym, i) => {
    const nextLine = rawSymbols[i + 1]?.line ?? sym.line + 40
    return { ...sym, pseudo: extractPseudo(lines, sym.line, nextLine) }
  })

  const importsHtml = [...relative.map(r => `
    <li class="imp-rel"><span class="imp-dot">·</span>${escHtml(r)}</li>`),
    ...external.map(e => `
    <li class="imp-ext"><span class="imp-dot npm">npm</span>${escHtml(e)}</li>`)
  ].join('') || '<li class="no-items">none</li>'

  const symbolsHtml = symbols.map(sym => {
    const col  = KIND_COLOR[sym.kind] ?? '#64748b'
    const icon = KIND_ICON[sym.kind] ?? '·'
    const pseudoHtml = sym.pseudo?.map(pl => `
      <div class="pl pl-${pl.t}">${escHtml(pl.l)}</div>`).join('') ?? ''
    return `
    <div class="symbol">
      <div class="sym-hdr">
        <span class="sym-badge" style="background:${col}18;color:${col}">${icon} ${sym.kind}</span>
        <span class="sym-name">${escHtml(sym.name)}</span>
        <span class="sym-line">:${sym.line}</span>
      </div>
      ${pseudoHtml ? `<div class="pseudo">${pseudoHtml}</div>` : ''}
    </div>`
  }).join('') || '<div class="no-items">No symbols found</div>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(label)} — AgentWatch Context</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#13131a;color:#9ca3af;font-family:'JetBrains Mono','Fira Code',ui-monospace,monospace;font-size:12px;line-height:1.6;padding:24px}
header{display:flex;align-items:center;gap:10px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #1f1f28}
.ext-badge{padding:3px 9px;border-radius:4px;font-size:9px;font-weight:700;letter-spacing:.08em;background:${accent}20;color:${accent};border:1px solid ${accent}44}
h1{font-size:16px;color:#e2e8f0;font-weight:700}
.file-path{font-size:10px;color:#374151;margin-left:auto}
.generated{font-size:9px;color:#1f2937;margin-top:2px}
section{margin-bottom:20px}
h2{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#374151;margin-bottom:10px}
ul.imports{list-style:none;display:flex;flex-direction:column;gap:4px}
.imp-rel,.imp-ext{display:flex;align-items:center;gap:8px;color:#6b7280;font-size:11px}
.imp-dot{font-size:8px;padding:1px 6px;border-radius:3px;background:#1f1f28;color:#4b5563;flex-shrink:0}
.imp-dot.npm{background:rgba(99,102,241,.12);color:#6366f1}
.no-items{color:#1f2937;font-size:11px}
.symbol{margin-bottom:14px;border-left:2px solid #1e1e2e;padding-left:12px}
.sym-hdr{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.sym-badge{padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.06em}
.sym-name{font-size:12px;color:#e2e8f0;font-weight:600}
.sym-line{font-size:10px;color:#374151;margin-left:auto}
.pseudo{padding-left:4px;display:flex;flex-direction:column;gap:1px}
.pl{font-size:10px;white-space:pre}
.pl-comment{color:#3d5a45;font-style:italic}
.pl-keyword{color:#818cf8}
.pl-arrow{color:#f97316}
.pl-call{color:#38bdf8}
.pl-assign{color:#9ca3af}
.pl-param{color:#d4a96a}
</style>
</head>
<body>
<header>
  <span class="ext-badge">.${ext}</span>
  <h1>${escHtml(label)}</h1>
  <div>
    <div class="file-path">${escHtml(filePath)}</div>
    <div class="generated">AgentWatch · ${date}</div>
  </div>
</header>

<section>
  <h2>Imports (${relative.length + external.length})</h2>
  <ul class="imports">${importsHtml}</ul>
</section>

<section>
  <h2>Symbols (${symbols.length})</h2>
  ${symbolsHtml}
</section>
</body>
</html>`
}

// ── Compact context (.ctx.md) for Claude ──────────────────────────────────────

export function generateContextMd(
  filePath: string,
  content: string,
  ext: string,
): string {
  const label = filePath.split('/').pop() ?? filePath
  const { relative, external } = parseImports(content, ext)
  const rawSymbols = parseSymbols(content, ext)
  const lines  = content.split('\n')
  const symbols = rawSymbols.map((sym, i) => {
    const nextLine = rawSymbols[i + 1]?.line ?? sym.line + 40
    return { ...sym, pseudo: extractPseudo(lines, sym.line, nextLine) }
  })

  const allImports = [...relative, ...external].join(', ')

  const symBlocks = symbols.map(sym => {
    const pseudoLines = sym.pseudo?.map(pl => `  ${pl.l}`).join('\n') ?? ''
    return `### ${sym.kind} ${sym.name} :${sym.line}\n${pseudoLines}`
  }).join('\n\n')

  return `# ${label}
path: ${filePath}
ext: .${ext}
imports: ${allImports || 'none'}
symbols: ${symbols.length}

${symBlocks || '(no symbols extracted)'}
`
}

// ── Claude-generated summary HTML wrapper ─────────────────────────────────────

export function wrapSummaryHtml(filePath: string, ext: string, summaryText: string): string {
  const label  = filePath.split('/').pop() ?? filePath
  const accent = EXT_COLOR[ext] ?? '#64748b'
  const date   = new Date().toISOString().slice(0, 16).replace('T', ' ')

  const escaped = summaryText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const body = escaped
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n+/g, '</p><p class="para">')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(label)} — Summary</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#13131a;color:#c9d1d9;font-family:'JetBrains Mono','Fira Code',ui-monospace,monospace;font-size:13px;line-height:1.75;padding:24px 28px}
header{display:flex;align-items:center;gap:10px;margin-bottom:22px;padding-bottom:14px;border-bottom:1px solid #1f1f28}
.ext-badge{padding:3px 9px;border-radius:4px;font-size:9px;font-weight:700;letter-spacing:.08em;background:${accent}20;color:${accent};border:1px solid ${accent}44}
h1.title{font-size:15px;color:#e2e8f0;font-weight:700}
.meta{font-size:9px;color:#2a3040;margin-left:auto;text-align:right}
.body{max-width:720px}
h1,h2,h3{color:#e2e8f0;margin:18px 0 6px;font-size:13px;font-weight:700;letter-spacing:.03em}
h1{font-size:14px}h2{font-size:13px;color:#c9d1d9}h3{font-size:12px;color:#9ca3af}
p.para{margin-top:10px}
ul{margin:8px 0 8px 18px;display:flex;flex-direction:column;gap:4px}
li{color:#9ca3af}
code{background:#1e2030;color:#7dd3fc;padding:1px 6px;border-radius:3px;font-size:12px}
pre{background:#1a1a24;border:1px solid #2a2a38;border-radius:6px;padding:12px 14px;overflow-x:auto;margin:10px 0}
pre code{background:none;padding:0;color:#c9d1d9}
strong{color:#e2e8f0;font-weight:600}
</style>
</head>
<body>
<header>
  <span class="ext-badge">.${escHtml(ext)}</span>
  <h1 class="title">${escHtml(label)}</h1>
  <div class="meta"><div>${escHtml(filePath)}</div><div>AgentWatch · ${date}</div></div>
</header>
<div class="body"><p class="para">${body}</p></div>
</body>
</html>`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// Re-export for use in App.tsx
export type { FileSymbol }
