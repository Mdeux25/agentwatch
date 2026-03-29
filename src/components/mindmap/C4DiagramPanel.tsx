import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import type { MindMapData } from '../../types/mindMap'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  c4: { diagramMarginY: 20 },
})

interface Props {
  data: MindMapData
  projectRoot: string | null
}

// ── Safe mermaid ID (no slashes, dots, hyphens, @) ────────────────────────────
function safeId(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, '_')
}

// ── Map directory segments to architectural layer names ───────────────────────
const LAYER_PATTERNS: [string[], string][] = [
  [['component', 'view', 'page', 'screen', 'widget', 'panel', 'ui'], 'UI Layer'],
  [['store', 'state', 'redux', 'context', 'atom', 'slice'],          'State'],
  [['service', 'api', 'client', 'network', 'fetch', 'request'],      'Services'],
  [['lib', 'util', 'helper', 'common', 'shared', 'core'],            'Logic'],
  [['hook'],                                                           'Hooks'],
  [['type', 'interface', 'model', 'schema', 'dto'],                  'Types'],
  [['route', 'router', 'navigation', 'nav'],                         'Routing'],
  [['controller', 'handler', 'resolver'],                            'Controllers'],
  [['middleware', 'guard', 'interceptor'],                           'Middleware'],
  [['test', '__test__', 'spec', '__mock__'],                         'Tests'],
  [['db', 'database', 'repository', 'dao', 'prisma', 'mongo'],      'Data Layer'],
]

function detectLayer(dir: string, projectRoot: string | null): string {
  const rel = (projectRoot && dir.startsWith(projectRoot)
    ? dir.slice(projectRoot.length + 1)
    : dir).toLowerCase()
  const parts = rel.split('/')
  for (const part of parts) {
    for (const [patterns, label] of LAYER_PATTERNS) {
      if (patterns.some(p => part.includes(p))) return label
    }
  }
  // Fall back to the last meaningful path segment
  return parts.filter(p => p && p !== 'src').pop() ?? 'Core'
}

// ── Strip extension from label, format nicely ────────────────────────────────
function componentLabel(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}

// ── Generate C4Component mermaid syntax ──────────────────────────────────────
function generateC4(data: MindMapData, projectRoot: string | null): string {
  const exploredNodes = Object.values(data.nodes)
    .filter(n => !n.isBlackBox && !n.isExternal)
    .slice(0, 30)

  if (exploredNodes.length === 0) return ''

  const exploredIds = new Set(exploredNodes.map(n => n.id))

  // Group by detected architectural layer
  const byLayer = new Map<string, typeof exploredNodes>()
  for (const n of exploredNodes) {
    const layer = detectLayer(n.dir, projectRoot)
    const group = byLayer.get(layer) ?? []
    group.push(n)
    byLayer.set(layer, group)
  }

  const projectName = projectRoot ? projectRoot.split('/').pop() : 'Project'

  const lines: string[] = [
    'C4Component',
    `  title ${projectName} — Architecture`,
    '',
  ]

  // Boundaries + components
  for (const [layer, nodes] of byLayer.entries()) {
    const boundaryId = safeId(layer)
    lines.push(`  Container_Boundary(${boundaryId}, "${layer}") {`)
    for (const n of nodes) {
      const ext = n.filePath.split('.').pop() ?? ''
      const label = componentLabel(n.label)
      // Use up to 3 exported function names as the description
      const fnNames = n.symbols.filter(s => s.kind === 'function').slice(0, 3).map(s => s.name)
      const desc = fnNames.length > 0 ? fnNames.join(', ') : ''
      lines.push(`    Component(${safeId(n.id)}, "${label}", "${ext}", "${desc}")`)
    }
    lines.push('  }')
    lines.push('')
  }

  // Relationships — only between explored nodes, label with source fn if known
  const addedEdges = new Set<string>()
  for (const e of data.edges) {
    if (!exploredIds.has(e.source) || !exploredIds.has(e.target)) continue
    const key = `${e.source}→${e.target}`
    if (addedEdges.has(key)) continue
    addedEdges.add(key)
    lines.push(`  Rel(${safeId(e.source)}, ${safeId(e.target)}, "imports")`)
  }

  return lines.join('\n')
}

// ── Component ─────────────────────────────────────────────────────────────────
let idCounter = 0

export function C4DiagramPanel({ data, projectRoot }: Props) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const idRef     = useRef(`c4-${++idCounter}`)
  const canvasRef = useRef<HTMLDivElement>(null)
  const panRef    = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)

  const zoomIn    = () => setScale(s => Math.min(s + 0.25, 4))
  const zoomOut   = () => setScale(s => Math.max(s - 0.25, 0.25))
  const zoomReset = () => setScale(1)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = canvasRef.current
    if (!el) return
    panRef.current = { startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop }
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
    e.preventDefault()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return
    const el = canvasRef.current
    if (!el) return
    el.scrollLeft = panRef.current.scrollX - (e.clientX - panRef.current.startX)
    el.scrollTop  = panRef.current.scrollY - (e.clientY - panRef.current.startY)
  }

  const onPointerUp = () => {
    panRef.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
  }

  const exploredCount = Object.values(data.nodes).filter(n => !n.isBlackBox && !n.isExternal).length

  useEffect(() => {
    if (exploredCount === 0) { setSvg(''); return }
    const diagram = generateC4(data, projectRoot)
    if (!diagram) { setSvg(''); return }

    // Mermaid requires a fresh ID on each call to avoid cache collisions
    idRef.current = `c4-${++idCounter}`
    setError(null)

    mermaid.render(idRef.current, diagram)
      .then(({ svg: rendered }) => setSvg(rendered))
      .catch(err => {
        setError(String(err))
        setSvg('')
      })
  }, [data, projectRoot, exploredCount])

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (exploredCount === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 10,
        background: 'radial-gradient(ellipse at 50% 50%,#1e2130 0%,#1a1a1e 60%,#171719 100%)',
        fontFamily: "'JetBrains Mono',ui-monospace,monospace",
      }}>
        <div style={{ fontSize: 24, color: '#2d3050' }}>⬡</div>
        <div style={{ color: '#3d4468', fontSize: 12, letterSpacing: '.04em' }}>C4 Architecture</div>
        <div style={{ fontSize: 10, color: '#252525', letterSpacing: '.03em' }}>
          open files in the explorer to populate the diagram
        </div>
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#171719', fontFamily: "'JetBrains Mono',ui-monospace,monospace",
        flexDirection: 'column', gap: 8,
      }}>
        <div style={{ color: '#ef4444', fontSize: 11 }}>diagram render error</div>
        <div style={{ color: '#374151', fontSize: 10, maxWidth: 300, textAlign: 'center' }}>{error}</div>
      </div>
    )
  }

  // ── Diagram ──────────────────────────────────────────────────────────────────
  const btnStyle = (disabled = false): React.CSSProperties => ({
    background: 'rgba(255,255,255,.05)', border: '1px solid #3e3e42',
    borderRadius: 4, color: disabled ? '#333' : '#9ca3af',
    fontSize: 14, width: 28, height: 28, cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit', lineHeight: 1,
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#13131a', overflow: 'hidden' }}>
      {/* Zoom controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        borderBottom: '1px solid #1f1f28',
        fontFamily: "'JetBrains Mono',ui-monospace,monospace",
      }}>
        <button style={btnStyle(scale <= 0.25)} onClick={zoomOut}>−</button>
        <button style={btnStyle(scale === 1)} onClick={zoomReset}
          title="Reset zoom"
        >{Math.round(scale * 100)}%</button>
        <button style={btnStyle(scale >= 4)} onClick={zoomIn}>+</button>
      </div>

      {/* Scrollable canvas */}
      <div
        ref={canvasRef}
        style={{ flex: 1, overflow: 'auto', padding: 24, cursor: 'grab', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {svg ? (
          <div
            dangerouslySetInnerHTML={{ __html: svg }}
            style={{
              transformOrigin: 'top center',
              transform: `scale(${scale})`,
              transition: 'transform 0.15s ease',
              display: 'inline-block',
              minWidth: '100%',
            }}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#3d4468', fontSize: 11,
            fontFamily: "'JetBrains Mono',ui-monospace,monospace", gap: 8,
          }}>
            <span>◌</span> rendering…
          </div>
        )}
      </div>
    </div>
  )
}
