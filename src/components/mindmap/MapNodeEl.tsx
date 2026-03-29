import { useState, useRef } from 'react'
import type { MapNode } from '../../types/mindMap'
import { EXT_COLOR } from '../../lib/mindMapBuilder'
import { NW, NH_HDR, NH_SYM, NH_BB, NH_EXT, NH_PAD, nodeH, KIND_META } from './nodeLayout'

interface Props {
  node: MapNode
  selected: boolean
  loading: boolean
  onSelect: (id: string) => void
  onExpand: (id: string) => void
  onCollapse: (id: string) => void
  onDragStart: (id: string, e: React.PointerEvent) => void
  onSymbolClick: (nodeId: string, symIdx: number) => void
}

const DRAG_THRESHOLD = 5

export function MapNodeEl({
  node, selected, loading,
  onSelect, onExpand, onCollapse, onDragStart, onSymbolClick,
}: Props) {
  const [hoveredSym, setHoveredSym] = useState<number | null>(null)
  const downPos = useRef({ x: 0, y: 0 })

  const ext      = node.filePath.split('.').pop()?.toLowerCase() ?? ''
  const extColor = node.isExternal ? '#6366f1' : (EXT_COLOR[ext] ?? '#64748b')
  const accent   = selected ? '#4fc3f7' : extColor
  const h        = nodeH(node)
  const hw       = NW / 2
  const hh       = h / 2
  const bw       = Math.max(ext.length, 2) * 6 + 10

  const handlePointerDown = (e: React.PointerEvent) => {
    downPos.current = { x: e.clientX, y: e.clientY }
    e.stopPropagation()
    onDragStart(node.id, e)
  }

  const handleClick = (e: React.MouseEvent) => {
    const dx = e.clientX - downPos.current.x
    const dy = e.clientY - downPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) return
    e.stopPropagation()
    if (node.isBlackBox && !node.isExternal) onExpand(node.id)
    else onSelect(node.id)
  }

  // ── External (npm) node ────────────────────────────────────────────────────
  if (node.isExternal) {
    return (
      <g transform={`translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`}
        style={{ cursor: 'default' }} onPointerDown={handlePointerDown}>
        <rect x={-hw + 2} y={-hh + 3} width={NW} height={NH_EXT} rx={7} fill="rgba(0,0,0,.5)" />
        <rect x={-hw} y={-hh} width={NW} height={NH_EXT} rx={6}
          fill="rgba(99,102,241,.08)" stroke="#4f46e5" strokeWidth={1} />
        <text x={-hw + 10} y={-hh + 14} fill="#6366f1" fontSize={8}
          dominantBaseline="middle" fontFamily="monospace">npm</text>
        <text x={0} y={4} fill="#818cf8" fontSize={12} textAnchor="middle"
          dominantBaseline="middle" fontFamily="monospace" fontWeight={700}>
          {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
        </text>
      </g>
    )
  }

  // ── Black-box (unexplored) node ────────────────────────────────────────────
  if (node.isBlackBox) {
    const borderColor = loading ? '#4fc3f7' : '#3e3e42'
    const dashArray   = loading ? '3 2' : '5 3'
    return (
      <g transform={`translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`}
        style={{ cursor: loading ? 'wait' : 'pointer' }}
        onPointerDown={handlePointerDown} onClick={handleClick}>
        <rect x={-hw + 2} y={-hh + 3} width={NW} height={NH_BB} rx={7} fill="rgba(0,0,0,.4)" />
        <rect x={-hw} y={-hh} width={NW} height={NH_BB} rx={6}
          fill={loading ? 'rgba(79,195,247,.04)' : '#0f0f0f'}
          stroke={borderColor} strokeWidth={1} strokeDasharray={dashArray} />
        {/* Skeleton lines */}
        {[0.65, 0.85, 0.45].map((w, i) => (
          <rect key={i} x={-hw + 10} y={-hh + 9 + i * 10} width={(NW - 20) * w} height={5}
            rx={2} fill={loading ? 'rgba(79,195,247,.08)' : 'rgba(255,255,255,.06)'} />
        ))}
        {/* Ext badge */}
        <rect x={hw - bw - 6} y={hh - 16} width={bw} height={12} rx={3}
          fill={extColor + '18'} stroke={extColor + '44'} strokeWidth={0.5} />
        <text x={hw - bw - 3} y={hh - 9} fill={extColor} fontSize={8}
          dominantBaseline="middle" fontFamily="monospace">.{ext}</text>
        {/* Label */}
        <text x={0} y={1} fill={loading ? '#4fc3f7' : '#555'} fontSize={11}
          textAnchor="middle" dominantBaseline="middle" fontFamily="monospace" fontStyle="italic">
          {loading ? 'loading…' : (node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label)}
        </text>
        {/* Expand hint */}
        {!loading && (
          <text x={0} y={hh - 7} fill="#2a2a2a" fontSize={8}
            textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">
            click to open
          </text>
        )}
      </g>
    )
  }

  // ── Explored (full) node ───────────────────────────────────────────────────
  return (
    <g transform={`translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`}
      style={{ cursor: 'grab' }}
      onPointerDown={handlePointerDown} onClick={handleClick}>
      {/* Shadow */}
      <rect x={-hw + 3} y={-hh + 4} width={NW} height={h} rx={7} fill="rgba(0,0,0,.55)" />
      {/* Glow ring when selected */}
      {selected && (
        <rect x={-hw - 3} y={-hh - 3} width={NW + 6} height={h + 6} rx={9}
          fill="none" stroke="#4fc3f7" strokeWidth={2} opacity={0.2} />
      )}
      {/* Main card */}
      <rect x={-hw} y={-hh} width={NW} height={h} rx={6}
        fill="rgba(255,255,255,.04)" stroke={accent} strokeWidth={selected ? 1.5 : 1} />
      {/* Left accent bar */}
      <rect x={-hw} y={-hh} width={4} height={h} rx={3} fill={extColor} opacity={0.85} />
      {/* Ext badge */}
      <rect x={-hw + 10} y={-hh + 10} width={bw} height={15} rx={3}
        fill={extColor + '28'} stroke={extColor + '66'} strokeWidth={0.5} />
      <text x={-hw + 14} y={-hh + 17} fill={extColor} fontSize={9}
        dominantBaseline="middle" fontFamily="monospace" fontWeight={600}>.{ext}</text>
      {/* Filename */}
      <text x={-hw + 10 + bw + 6} y={-hh + 17} fill="#e2e8f0" fontSize={12}
        dominantBaseline="middle" fontFamily="monospace" fontWeight={700}>
        {node.label.length > 12 ? node.label.slice(0, 11) + '…' : node.label}
      </text>
      {/* Collapse button (top-right) */}
      <g
        onClick={e => { e.stopPropagation(); onCollapse(node.id) }}
        style={{ cursor: 'pointer' }}
      >
        <rect x={hw - 18} y={-hh + 6} width={14} height={14} rx={3}
          fill="rgba(255,255,255,0)" stroke="transparent" />
        <text x={hw - 11} y={-hh + 13} fill="#333" fontSize={11}
          textAnchor="middle" dominantBaseline="middle" fontFamily="monospace"
          onMouseEnter={e => (e.currentTarget.style.fill = '#888')}
          onMouseLeave={e => (e.currentTarget.style.fill = '#333')}
        >⊟</text>
      </g>
      {/* Header separator */}
      <line x1={-hw + 4} y1={-hh + NH_HDR} x2={hw} y2={-hh + NH_HDR}
        stroke="rgba(255,255,255,.07)" strokeWidth={1} />
      {/* Symbol rows */}
      {node.symbols.map((sym, i) => {
        const sy = -hh + NH_HDR + 4 + i * NH_SYM + NH_SYM / 2
        const meta = KIND_META[sym.kind] ?? { icon: '·', color: '#64748b', bg: 'transparent' }
        const hasPseudo = sym.pseudo && sym.pseudo.length > 0
        const hovered = hoveredSym === i
        return (
          <g key={i}>
            <rect
              x={-hw + 4} y={sy - NH_SYM / 2 + 1} width={NW - 8} height={NH_SYM - 2} rx={3}
              fill={hovered ? 'rgba(255,255,255,.06)' : 'transparent'}
              style={{ cursor: hasPseudo ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoveredSym(i)}
              onMouseLeave={() => setHoveredSym(null)}
              onClick={e => {
                if (!hasPseudo) return
                e.stopPropagation()
                onSymbolClick(node.id, i)
              }}
            />
            <circle cx={-hw + 14} cy={sy} r={3.5} fill={meta.color} opacity={0.85} />
            <text x={-hw + 14} y={sy} fontSize={6.5} textAnchor="middle"
              dominantBaseline="central" fill="#fff" style={{ pointerEvents: 'none' }}>
              {meta.icon}
            </text>
            <text x={-hw + 24} y={sy} fontSize={10.5} dominantBaseline="middle"
              fill={hovered ? '#e2e8f0' : '#9ca3af'} fontFamily="monospace"
              style={{ pointerEvents: 'none' }}>
              {sym.name.length > 18 ? sym.name.slice(0, 17) + '…' : sym.name}
            </text>
            {hasPseudo && (
              <text x={hw - 8} y={sy} fontSize={9} textAnchor="end"
                dominantBaseline="middle" fill={hovered ? '#666' : '#333'}
                fontFamily="monospace" style={{ pointerEvents: 'none' }}>▸</text>
            )}
          </g>
        )
      })}
      {node.symbols.length === 0 && (
        <text x={0} y={-hh + NH_HDR + NH_PAD / 2 + 4} fill="#2d3748" fontSize={9}
          textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">no symbols</text>
      )}
    </g>
  )
}
