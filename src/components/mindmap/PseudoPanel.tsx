import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { MapNode } from '../../types/mindMap'
import type { PseudoLine } from '../../types/mindMap'
import { KIND_META } from './nodeLayout'

interface Props {
  node: MapNode
  symIdx: number
  screenX: number   // fixed position in window
  screenY: number
  onClose: () => void
}

const LINE_COLORS: Record<PseudoLine['t'], string> = {
  comment: '#3d5a45',
  keyword: '#818cf8',
  arrow:   '#f97316',
  call:    '#38bdf8',
  assign:  '#9ca3af',
  param:   '#d4a96a',
}

export function PseudoPanel({ node, symIdx, screenX, screenY, onClose }: Props) {
  const sym  = node.symbols[symIdx]
  const meta = KIND_META[sym?.kind ?? ''] ?? { icon: '·', color: '#64748b', bg: 'rgba(100,116,139,.1)' }
  const ref  = useRef<HTMLDivElement>(null)

  // Clamp inside viewport
  const PW = 292
  const PH = 60 + (sym?.pseudo?.length ?? 0) * 18
  const clampedX = Math.min(Math.max(screenX, 8), window.innerWidth - PW - 8)
  const clampedY = Math.min(Math.max(screenY, 44), window.innerHeight - PH - 8)

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  if (!sym) return null

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -6, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -6, scale: 0.98 }}
      transition={{ duration: 0.14 }}
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        width: PW,
        zIndex: 1000,
        background: '#13131a',
        border: '1px solid #3e3e42',
        borderRadius: 8,
        boxShadow: '0 8px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04)',
        fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace",
        fontSize: 10,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px 7px',
        borderBottom: '1px solid #1f1f28',
      }}>
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: '.08em',
          padding: '2px 7px', borderRadius: 3, flexShrink: 0,
          background: meta.bg, color: meta.color,
        }}>
          {meta.icon} {sym.kind}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: '#e2e8f0',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sym.name}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: '#444',
            fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#9ca3af')}
          onMouseLeave={e => (e.currentTarget.style.color = '#444')}
        >
          ×
        </button>
      </div>

      {/* Pseudo-code body */}
      <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sym.pseudo && sym.pseudo.length > 0 ? (
          sym.pseudo.map((pl, i) => (
            <div key={i} style={{
              fontSize: 10,
              lineHeight: 1.75,
              whiteSpace: 'pre',
              color: LINE_COLORS[pl.t] ?? '#9ca3af',
              fontStyle: pl.t === 'comment' ? 'italic' : 'normal',
            }}>
              {pl.l}
            </div>
          ))
        ) : (
          <div style={{ color: '#334155', fontSize: 10 }}>no pseudo-code extracted</div>
        )}
      </div>
    </motion.div>
  )
}
