import { Html } from '@react-three/drei'
import { useStore } from '../../store/useStore'
import { parseSymbols, SYMBOL_COLORS, SYMBOL_LETTER } from '../../lib/symbolParser'
import type { QuadNode } from '../../types/events'

interface Props {
  node: QuadNode
  yBase: number
  cx?: number
  cz?: number
}

export function FileSchemaCard({ node, yBase, cx: cxProp, cz: czProp }: Props) {
  const activeFileContent = useStore((s) => s.activeFileContent)

  const cx = cxProp ?? node.bounds.x + node.bounds.w / 2
  const cz = czProp ?? node.bounds.z + node.bounds.h / 2

  const symbols = activeFileContent
    ? parseSymbols(activeFileContent, node.ext)
    : []

  const cardWidth = Math.max(130, Math.min(220, node.bounds.w * 35))

  return (
    <Html
      position={[cx, yBase + 0.55, cz]}
      center
      distanceFactor={10}
      zIndexRange={[20, 10]}
    >
      <div
        style={{
          width: cardWidth,
          background: 'rgba(8, 6, 26, 0.92)',
          border: '1px solid rgba(99,102,241,0.35)',
          borderRadius: 8,
          padding: '7px 9px',
          fontFamily: 'monospace',
          fontSize: 11,
          pointerEvents: 'none',
          userSelect: 'none',
          boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
        }}
      >
        {/* Filename header */}
        <div style={{
          color: '#a5b4fc',
          fontWeight: 700,
          fontSize: 10,
          marginBottom: 5,
          paddingBottom: 4,
          borderBottom: '1px solid rgba(99,102,241,0.2)',
          letterSpacing: '0.04em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {node.name}
        </div>

        {/* Symbol list */}
        {symbols.length === 0 ? (
          <div style={{ color: 'rgba(148,163,184,0.4)', fontSize: 10, fontStyle: 'italic' }}>
            no symbols
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {symbols.slice(0, 18).map((sym) => (
              <div key={`${sym.line}-${sym.name}`} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {/* Kind badge */}
                <span style={{
                  color: SYMBOL_COLORS[sym.kind],
                  fontWeight: 700,
                  fontSize: 9,
                  minWidth: 10,
                  textAlign: 'center',
                  opacity: 0.9,
                }}>
                  {SYMBOL_LETTER[sym.kind]}
                </span>
                {/* Name */}
                <span style={{
                  color: '#e2e8f0',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 11,
                }}>
                  {sym.name}
                </span>
                {/* Line number */}
                <span style={{ color: 'rgba(148,163,184,0.35)', fontSize: 9, flexShrink: 0 }}>
                  :{sym.line}
                </span>
              </div>
            ))}
            {symbols.length > 18 && (
              <div style={{ color: 'rgba(148,163,184,0.4)', fontSize: 9, marginTop: 2 }}>
                +{symbols.length - 18} more
              </div>
            )}
          </div>
        )}
      </div>
    </Html>
  )
}
