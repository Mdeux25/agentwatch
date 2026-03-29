import { useRef, useEffect, useState, useCallback } from 'react'
import type { MapNode, MapEdge, MindMapData } from '../../types/mindMap'
import { MapNodeEl } from './MapNodeEl'
import { NW, NH_HDR, NH_SYM, nodeH } from './nodeLayout'

const REPULSION   = 9000
const SPRING_K    = 0.022
const SPRING_LEN  = 210
const CLUSTER_STR = 0.012
const DAMPING     = 0.82
const SPEED_CAP   = 7
const MAX_ITERS   = 400
const GRID_STEP   = 40

interface Props {
  data: MindMapData
  width: number
  height: number
  selectedId: string | null
  expandingIds: Set<string>
  onNodeSelect: (id: string | null) => void
  onNodeExpand: (id: string) => void
  onNodeCollapse: (id: string) => void
  onPositionsCommit: (positions: Record<string, { x: number; y: number }>) => void
  onSymbolClick: (node: MapNode, symIdx: number, screenX: number, screenY: number) => void
}

export function ForceCanvas({
  data, width, height, selectedId, expandingIds,
  onNodeSelect, onNodeExpand, onNodeCollapse,
  onPositionsCommit, onSymbolClick,
}: Props) {
  const posRef  = useRef<Record<string, { x: number; y: number }>>({})
  const velRef  = useRef<Record<string, { vx: number; vy: number }>>({})
  const iterRef = useRef(0)
  const rafRef  = useRef<number | null>(null)
  const svgRef  = useRef<SVGSVGElement>(null)

  const [vx, setVx]     = useState(0)
  const [vy, setVy]     = useState(0)
  const [zoom, setZoom] = useState(0.9)
  const [, setTick]     = useState(0)

  const panStart = useRef<{ mx: number; my: number; vx: number; vy: number } | null>(null)
  const dragId   = useRef<string | null>(null)
  const dragOff  = useRef({ dx: 0, dy: 0 })

  // ── Sync positions ────────────────────────────────────────────────────────────
  useEffect(() => {
    for (const n of Object.values(data.nodes)) {
      if (!posRef.current[n.id]) {
        posRef.current[n.id] = { x: n.x, y: n.y }
        velRef.current[n.id] = { vx: 0, vy: 0 }
      }
    }
    iterRef.current = 0
  }, [data.nodes])

  // ── Force sim ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const visIds = Object.keys(data.nodes).filter(id => {
      const n = data.nodes[id]
      return !n.isExternal || data.showExternals
    })
    const dirSet = [...new Set(visIds.map(id => data.nodes[id]?.dir ?? ''))]
    const clusterOf = (dir: string) => {
      const idx = dirSet.indexOf(dir)
      const angle = (idx / (dirSet.length || 1)) * 2 * Math.PI
      return { cx: 350 * Math.cos(angle), cy: 350 * Math.sin(angle) }
    }

    function step() {
      if (iterRef.current >= MAX_ITERS) return
      const pos = posRef.current, vel = velRef.current

      for (let i = 0; i < visIds.length; i++) {
        for (let j = i + 1; j < visIds.length; j++) {
          const a = visIds[i], b = visIds[j]
          const pa = pos[a], pb = pos[b]
          if (!pa || !pb) continue
          const dx = pa.x - pb.x || 0.01, dy = pa.y - pb.y || 0.01
          const d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1, f = REPULSION / d2
          vel[a].vx += dx / d * f; vel[a].vy += dy / d * f
          vel[b].vx -= dx / d * f; vel[b].vy -= dy / d * f
        }
      }
      for (const e of data.edges) {
        const pa = pos[e.source], pb = pos[e.target]
        if (!pa || !pb) continue
        const dx = pb.x - pa.x, dy = pb.y - pa.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const str = (d - SPRING_LEN) * SPRING_K
        vel[e.source].vx += dx / d * str; vel[e.source].vy += dy / d * str
        vel[e.target].vx -= dx / d * str; vel[e.target].vy -= dy / d * str
      }
      for (const id of visIds) {
        const n = data.nodes[id]
        if (!n || !pos[id]) continue
        const { cx, cy } = clusterOf(n.dir)
        vel[id].vx += (cx - pos[id].x) * CLUSTER_STR
        vel[id].vy += (cy - pos[id].y) * CLUSTER_STR
      }
      for (const id of visIds) {
        if (id === dragId.current || !pos[id]) continue
        vel[id].vx *= DAMPING; vel[id].vy *= DAMPING
        const spd = Math.sqrt(vel[id].vx ** 2 + vel[id].vy ** 2)
        if (spd > SPEED_CAP) { vel[id].vx = vel[id].vx / spd * SPEED_CAP; vel[id].vy = vel[id].vy / spd * SPEED_CAP }
        pos[id].x += vel[id].vx; pos[id].y += vel[id].vy
      }
      iterRef.current++
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // ── Visible sets ──────────────────────────────────────────────────────────────
  const visNodes  = Object.values(data.nodes).filter(n => !n.isExternal || data.showExternals)
  const visIds    = new Set(visNodes.map(n => n.id))
  const visEdges  = data.edges.filter(e => visIds.has(e.source) && visIds.has(e.target))

  // ── Coordinate helpers ────────────────────────────────────────────────────────
  const toSVGPt = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current
    if (!svg) return { x: cx, y: cy }
    const pt = svg.createSVGPoint()
    pt.x = cx; pt.y = cy
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }, [])

  const worldToScreen = useCallback((wx: number, wy: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: wx * zoom + (vx + width / 2) + rect.left,
      y: wy * zoom + (vy + height / 2) + rect.top,
    }
  }, [zoom, vx, vy, width, height])

  // ── Symbol click ──────────────────────────────────────────────────────────────
  const handleSymbolClick = useCallback((nodeId: string, symIdx: number) => {
    const node = data.nodes[nodeId], pos = posRef.current[nodeId]
    if (!node || !pos) return
    const h = nodeH(node)
    const wx = pos.x + NW / 2 + 14
    const wy = pos.y - h / 2 + NH_HDR + 4 + symIdx * NH_SYM + NH_SYM / 2 - 24
    const sc = worldToScreen(wx, wy)
    onSymbolClick(node, symIdx, sc.x, sc.y)
  }, [data.nodes, worldToScreen, onSymbolClick])

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((id: string, e: React.PointerEvent) => {
    dragId.current = id
    const { x, y } = toSVGPt(e.clientX, e.clientY)
    const cx = (x - (vx + width / 2)) / zoom
    const cy = (y - (vy + height / 2)) / zoom
    const pos = posRef.current[id]
    if (pos) dragOff.current = { dx: cx - pos.x, dy: cy - pos.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [toSVGPt, vx, vy, zoom, width, height])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragId.current) {
      const { x, y } = toSVGPt(e.clientX, e.clientY)
      const wx = (x - (vx + width / 2)) / zoom - dragOff.current.dx
      const wy = (y - (vy + height / 2)) / zoom - dragOff.current.dy
      const pos = posRef.current[dragId.current]
      if (pos) {
        pos.x = wx; pos.y = wy
        const vel = velRef.current[dragId.current]
        if (vel) { vel.vx = 0; vel.vy = 0 }
        setTick(t => t + 1)
      }
    } else if (panStart.current) {
      setVx(panStart.current.vx + e.clientX - panStart.current.mx)
      setVy(panStart.current.vy + e.clientY - panStart.current.my)
    }
  }, [toSVGPt, vx, vy, zoom, width, height])

  const handlePointerUp = useCallback(() => {
    if (dragId.current) {
      const id = dragId.current
      const pos = posRef.current[id]
      if (pos) onPositionsCommit({ [id]: { x: pos.x, y: pos.y } })
      dragId.current = null
    }
    panStart.current = null
  }, [onPositionsCommit])

  const handleBgDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const tag = (e.target as Element).tagName
    if (tag === 'svg' || tag === 'path' || tag === 'line') {
      panStart.current = { mx: e.clientX, my: e.clientY, vx, vy }
      onNodeSelect(null)
    }
  }, [vx, vy, onNodeSelect])

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const f = e.deltaY < 0 ? 1.12 : 0.9
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    setVx(v => mx + (v + width / 2 - mx) * f - width / 2)
    setVy(v => my + (v + height / 2 - my) * f - height / 2)
    setZoom(z => Math.max(0.2, Math.min(4, z * f)))
  }, [width, height])

  // ── Grid ─────────────────────────────────────────────────────────────────────
  const gridLines: React.ReactNode[] = []
  for (let x = 0; x < width; x += GRID_STEP)
    gridLines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={height} stroke="rgba(255,255,255,.025)" strokeWidth={1} />)
  for (let y = 0; y < height; y += GRID_STEP)
    gridLines.push(<line key={`gy${y}`} x1={0} y1={y} x2={width} y2={y} stroke="rgba(255,255,255,.025)" strokeWidth={1} />)

  const transform = `translate(${(vx + width / 2).toFixed(1)},${(vy + height / 2).toFixed(1)}) scale(${zoom})`

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ display: 'block', background: 'radial-gradient(ellipse at 50% 50%,#1e2130 0%,#1a1a1e 60%,#171719 100%)' }}
      onPointerDown={handleBgDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <defs>
        <marker id="arr"     markerWidth={7} markerHeight={7} refX={6} refY={3} orient="auto">
          <path d="M0,.5L0,5.5L6.5,3z" fill="rgba(255,255,255,.18)" />
        </marker>
        <marker id="arr-npm" markerWidth={7} markerHeight={7} refX={6} refY={3} orient="auto">
          <path d="M0,.5L0,5.5L6.5,3z" fill="rgba(99,102,241,.5)" />
        </marker>
      </defs>

      <g>{gridLines}</g>

      <g transform={transform}>
        {/* Edges */}
        {visEdges.map((e: MapEdge) => {
          const pa = posRef.current[e.source], pb = posRef.current[e.target]
          if (!pa || !pb) return null
          const isNpm = data.nodes[e.target]?.isExternal
          const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2
          const dx = pb.x - pa.x, dy = pb.y - pa.y
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          return (
            <path
              key={e.id}
              d={`M${pa.x},${pa.y} Q${mx - dy / len * 40},${my + dx / len * 40} ${pb.x},${pb.y}`}
              fill="none"
              stroke={isNpm ? 'rgba(99,102,241,.3)' : 'rgba(255,255,255,.12)'}
              strokeWidth={1.2}
              strokeDasharray={isNpm ? '4 3' : undefined}
              markerEnd={isNpm ? 'url(#arr-npm)' : 'url(#arr)'}
            />
          )
        })}

        {/* Nodes */}
        {visNodes.map((n: MapNode) => {
          const pos = posRef.current[n.id]
          if (!pos) return null
          return (
            <MapNodeEl
              key={n.id}
              node={{ ...n, x: pos.x, y: pos.y }}
              selected={selectedId === n.id}
              loading={expandingIds.has(n.id)}
              onSelect={onNodeSelect}
              onExpand={onNodeExpand}
              onCollapse={onNodeCollapse}
              onDragStart={handleDragStart}
              onSymbolClick={handleSymbolClick}
            />
          )
        })}
      </g>

      {/* Zoom badge */}
      <text x={width - 12} y={height - 10} textAnchor="end" fontSize={10}
        fill="#333" fontFamily="monospace">
        {Math.round(zoom * 100)}%
      </text>
    </svg>
  )
}
