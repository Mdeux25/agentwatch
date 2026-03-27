import type { ClaudeEvent } from '../types/events'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DiffLine { type: 'context' | 'remove' | 'add' | 'separator'; line: string }

export interface EditDiff {
  filePath: string
  sections: DiffLine[][]
  addCount: number
  removeCount: number
  timestamp: number
}

// ── Core diff algorithm ────────────────────────────────────────────────────────

export function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.split('\n')
  const b = newStr.split('\n')
  const m = a.length, n = b.length

  if (m * n > 250_000) {
    return [
      ...a.map((line) => ({ type: 'remove' as const, line })),
      ...b.map((line) => ({ type: 'add' as const, line })),
    ]
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])

  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'context', line: a[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', line: b[j - 1] })
      j--
    } else {
      result.unshift({ type: 'remove', line: a[i - 1] })
      i--
    }
  }
  return result
}

export function trimContext(lines: DiffLine[], ctx = 2): DiffLine[] {
  const changes = lines.reduce<number[]>((acc, l, i) => {
    if (l.type !== 'context') acc.push(i)
    return acc
  }, [])
  if (changes.length === 0) return []

  const keep = new Set<number>()
  for (const idx of changes) {
    for (let k = Math.max(0, idx - ctx); k <= Math.min(lines.length - 1, idx + ctx); k++) keep.add(k)
  }

  const result: DiffLine[] = []
  let prev = -1
  for (const idx of Array.from(keep).sort((a, b) => a - b)) {
    if (prev !== -1 && idx - prev > 1) result.push({ type: 'separator', line: '' })
    result.push(lines[idx])
    prev = idx
  }
  return result
}

// ── Styling maps ───────────────────────────────────────────────────────────────

export const LINE_BG: Record<DiffLine['type'], string> = {
  remove:    'rgba(239, 68, 68, 0.10)',
  add:       'rgba(34, 197, 94, 0.09)',
  context:   'transparent',
  separator: 'transparent',
}
export const LINE_BORDER: Record<DiffLine['type'], string> = {
  remove:    '2px solid rgba(239, 68, 68, 0.45)',
  add:       '2px solid rgba(34, 197, 94, 0.45)',
  context:   '2px solid transparent',
  separator: '2px solid transparent',
}
export const GUTTER_COLOR: Record<DiffLine['type'], string> = {
  remove: '#ef4444', add: '#22c55e', context: '#374151', separator: '#1f2937',
}
export const TEXT_COLOR: Record<DiffLine['type'], string> = {
  remove: '#fca5a5', add: '#86efac', context: '#6b7280', separator: '#374151',
}

// ── buildEditDiff — turn a single tool_use ClaudeEvent into an EditDiff ────────

export function buildEditDiff(ev: ClaudeEvent): EditDiff | null {
  if (ev.type !== 'tool_use' || !ev.data) return null
  const name = ev.message ?? ''
  const d = ev.data as Record<string, unknown>

  const filePath = typeof d.file_path === 'string' ? d.file_path : ''

  if (name === 'Edit' && typeof d.old_string === 'string' && typeof d.new_string === 'string') {
    const raw = lineDiff(d.old_string, d.new_string)
    const lines = trimContext(raw)
    return {
      filePath,
      sections: [lines],
      addCount: lines.filter((l) => l.type === 'add').length,
      removeCount: lines.filter((l) => l.type === 'remove').length,
      timestamp: ev.timestamp,
    }
  }

  if (name === 'MultiEdit' && Array.isArray(d.edits)) {
    const sections: DiffLine[][] = []
    let addCount = 0, removeCount = 0
    for (const edit of d.edits as Array<Record<string, unknown>>) {
      if (typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') continue
      const lines = trimContext(lineDiff(edit.old_string, edit.new_string))
      sections.push(lines)
      addCount += lines.filter((l) => l.type === 'add').length
      removeCount += lines.filter((l) => l.type === 'remove').length
    }
    if (sections.length === 0) return null
    return { filePath, sections, addCount, removeCount, timestamp: ev.timestamp }
  }

  if (name === 'Write' && typeof d.content === 'string') {
    const lines: DiffLine[] = d.content.split('\n').map((line) => ({ type: 'add', line }))
    return { filePath, sections: [lines], addCount: lines.length, removeCount: 0, timestamp: ev.timestamp }
  }

  return null
}

// ── DiffLines render component ─────────────────────────────────────────────────

interface DiffLinesProps {
  sections: DiffLine[][]
}

export function DiffLines({ sections }: DiffLinesProps) {
  return (
    <div style={{ padding: '3px 0' }}>
      {sections.map((section, si) => (
        <div key={si}>
          {si > 0 && <div style={{ height: 1, background: 'rgba(99,102,241,0.12)', margin: '3px 0' }} />}
          {section.map((dl, li) => (
            <div
              key={li}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                minHeight: 15,
                paddingRight: 8,
                background: LINE_BG[dl.type],
                borderLeft: LINE_BORDER[dl.type],
              }}
            >
              {dl.type === 'separator' ? (
                <span style={{ color: '#374151', fontSize: 9, paddingLeft: 10, lineHeight: '15px', userSelect: 'none' }}>⋯</span>
              ) : (
                <>
                  <span style={{
                    width: 14, flexShrink: 0, paddingLeft: 4,
                    color: GUTTER_COLOR[dl.type],
                    fontSize: 10, lineHeight: '15px', userSelect: 'none',
                    fontWeight: dl.type === 'context' ? 400 : 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {dl.type === 'remove' ? '−' : dl.type === 'add' ? '+' : ' '}
                  </span>
                  <span style={{
                    color: TEXT_COLOR[dl.type],
                    fontSize: 9.5, lineHeight: '15px',
                    whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {dl.line || ' '}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
