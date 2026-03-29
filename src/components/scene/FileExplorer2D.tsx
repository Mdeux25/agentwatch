import { useState, useRef, useMemo, useEffect } from 'react'
import { useStore } from '../../store/useStore'

const EXT_COLOR: Record<string, string> = {
  ts: '#3b82f6', tsx: '#818cf8', js: '#eab308', jsx: '#f97316',
  css: '#06b6d4', scss: '#e879f9', html: '#f97316', md: '#94a3b8',
  json: '#eab308', swift: '#fb923c', py: '#fbbf24', go: '#00acd7',
  rs: '#fb923c', rb: '#cc342d', vue: '#4ade80', dart: '#22d3ee',
}

// ─── Squarified treemap algorithm ──────────────────────────────────────────

type R = { x: number; y: number; w: number; h: number }

/** Worst aspect ratio for a row given the shorter dimension of the current rect */
function worstAspect(areas: number[], shorter: number): number {
  const s = areas.reduce((a, b) => a + b, 0)
  const thick = s / shorter           // strip thickness
  return areas.reduce((worst, a) => {
    const len = a / thick             // item length along the strip
    return Math.max(worst, Math.max(thick / len, len / thick))
  }, 0)
}

/**
 * Squarified treemap: returns a map of key → rect for each item,
 * filling `rect` proportionally by weight.
 */
function squarify(items: Array<{ key: string; weight: number }>, rect: R): Map<string, R> {
  const result = new Map<string, R>()
  if (items.length === 0 || rect.w < 1 || rect.h < 1) return result

  const totalW = items.reduce((s, i) => s + i.weight, 0)
  const totalArea = rect.w * rect.h

  // Sort by weight descending, compute areas
  const sorted = [...items]
    .sort((a, b) => b.weight - a.weight)
    .map(i => ({ key: i.key, area: (i.weight / totalW) * totalArea }))

  let cur = { ...rect }
  let idx = 0

  while (idx < sorted.length) {
    if (cur.w < 0.5 || cur.h < 0.5) break

    const isWide = cur.w >= cur.h
    const shorter = Math.min(cur.w, cur.h)

    // Build a row: keep adding items while aspect ratio improves
    const rowAreas: number[] = [sorted[idx].area]
    let end = idx + 1

    while (end < sorted.length) {
      const next = sorted[end].area
      if (worstAspect([...rowAreas, next], shorter) > worstAspect(rowAreas, shorter)) break
      rowAreas.push(next)
      end++
    }

    // Place row items
    const rowSum = rowAreas.reduce((a, b) => a + b, 0)
    // thick = strip dimension along the LONGER axis (perpendicular to the shorter side)
    const thick = rowSum / shorter
    let offset = isWide ? cur.y : cur.x

    for (let k = 0; k < rowAreas.length; k++) {
      const len = rowAreas[k] / thick
      result.set(sorted[idx + k].key,
        isWide
          ? { x: cur.x,      y: offset, w: thick, h: len }
          : { x: offset, y: cur.y,      w: len,   h: thick }
      )
      offset += len
    }

    // Shrink current rect by the consumed strip
    cur = isWide
      ? { x: cur.x + thick, y: cur.y, w: cur.w - thick, h: cur.h }
      : { x: cur.x, y: cur.y + thick, w: cur.w,         h: cur.h - thick }

    idx = end
  }

  return result
}

// ─── Tile tree ──────────────────────────────────────────────────────────────

interface Tile {
  id: string; name: string; kind: 'file' | 'directory'
  ext: string; accessCount: number; rect: R; depth: number
  children: Tile[]
}

/** File-count weight: files = 1, dirs = Σ children */
function fileCount(id: string, nodes: Record<string, any>): number {
  const n = nodes[id]
  if (!n) return 0
  if (n.kind === 'file') return 1
  const sum = (n.childIds as string[]).reduce((s, cid) => s + fileCount(cid, nodes), 0)
  return Math.max(1, sum)
}

const PAD = 2   // px gap between parent border and children
const HDR = 14  // px header reserved for folder label

function buildTile(id: string, rect: R, nodes: Record<string, any>, depth: number): Tile {
  const n = nodes[id]
  const tile: Tile = {
    id, name: n.name, kind: n.kind, ext: n.ext ?? '',
    accessCount: n.accessCount ?? 0, rect, depth, children: [],
  }

  if (n.kind === 'directory' && (n.childIds as string[]).length > 0) {
    const hdr  = rect.h > HDR + 6 ? HDR : 0
    const inner: R = {
      x: rect.x + PAD,
      y: rect.y + PAD + hdr,
      w: Math.max(0, rect.w - PAD * 2),
      h: Math.max(0, rect.h - PAD * 2 - hdr),
    }
    if (inner.w > 4 && inner.h > 4) {
      const children = (n.childIds as string[])
        .filter(cid => nodes[cid])
        .map(cid => ({ key: cid, weight: fileCount(cid, nodes) }))
      const layout = squarify(children, inner)
      tile.children = [...layout.entries()].map(([cid, r]) =>
        buildTile(cid, r, nodes, depth + 1)
      )
    }
  }

  return tile
}

// ─── Component ──────────────────────────────────────────────────────────────

interface NavEntry { id: string; name: string }

interface Props {
  zoom: number
  navStack: NavEntry[]
  onDrillDown: (id: string, name: string) => void
}

export function FileExplorer2D({ zoom, navStack, onDrillDown }: Props) {
  const quadNodes       = useStore(s => s.quadNodes)
  const searchQuery     = useStore(s => s.searchQuery)
  const activeFileId    = useStore(s => s.activeFileId)
  const setActiveFileId = useStore(s => s.setActiveFileId)
  const agentSpheres    = useStore(s => s.agentSpheres)
  const vizOptions      = useStore(s => s.vizOptions)

  // Files Claude is actively reading/writing right now
  const agentActiveIds = useMemo(
    () => new Set(Object.values(agentSpheres).map(s => s.activeFileId).filter(Boolean) as string[]),
    [agentSpheres],
  )

  // Current scope: drill into a folder or show root
  const currentRootId = navStack.length > 0 ? navStack[navStack.length - 1].id : '__root__'

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize]       = useState({ w: 400, h: 400 })
  const [pan, setPan]         = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef  = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const hasMoved = useRef(false)

  // Reset pan whenever the user drills in or back
  useEffect(() => { setPan({ x: 0, y: 0 }) }, [currentRootId])

  // Track container size via ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Treemap dimensions (zoom scales the layout, not just the view)
  const tmW = size.w * zoom / 100
  const tmH = size.h * zoom / 100

  // Submodule dir IDs: directories that contain a child named '.git'
  const submoduleIds = useMemo(() => {
    const ids = new Set<string>()
    function markDescendants(id: string) {
      ids.add(id)
      const n = quadNodes[id]
      if (n) (n.childIds as string[]).forEach(markDescendants)
    }
    Object.values(quadNodes).forEach(n => {
      if (n.kind === 'directory') {
        const hasGit = (n.childIds as string[]).some(cid => quadNodes[cid]?.name === '.git')
        if (hasGit) markDescendants(n.id)
      }
    })
    return ids
  }, [quadNodes])

  // Build tile tree from current scope root
  const flatTiles = useMemo<Tile[]>(() => {
    const nodes = quadNodes
    const scopeNode = nodes[currentRootId]
    if (!scopeNode || (scopeNode.childIds as string[]).length === 0) return []

    const topItems = (scopeNode.childIds as string[])
      .filter(id => nodes[id])
      .map(id => ({ key: id, weight: fileCount(id, nodes) }))

    const outerRect: R = { x: 4, y: 4, w: Math.max(10, tmW - 8), h: Math.max(10, tmH - 8) }
    const layout = squarify(topItems, outerRect)

    const topTiles = [...layout.entries()].map(([id, r]) =>
      buildTile(id, r, nodes, 0)
    )

    // Flatten: directories shallowest-first, then files on top
    const dirs: Tile[] = [], files: Tile[] = []
    function flatten(t: Tile) {
      if (t.kind === 'directory') dirs.push(t); else files.push(t)
      t.children.forEach(flatten)
    }
    topTiles.forEach(flatten)
    dirs.sort((a, b) => a.depth - b.depth)
    return [...dirs, ...files]
  }, [quadNodes, tmW, tmH, currentRootId])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
    hasMoved.current = false
    setIsDragging(true)
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.sx
    const dy = e.clientY - dragRef.current.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy })
  }
  const onMouseUp = () => { dragRef.current = null; setIsDragging(false) }

  if (!quadNodes['__root__'] && navStack.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: 12 }}>
        <span style={{ fontSize: 24 }}>◻</span>
        <span style={{ fontWeight: 600 }}>No project open</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>Open a folder to explore files</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Treemap canvas — sized by zoom, offset by pan */}
      <div style={{ position: 'absolute', left: pan.x, top: pan.y, width: tmW, height: tmH }}>
        {flatTiles.map(tile => {
          const { x, y, w, h } = tile.rect
          if (w < 2 || h < 2) return null

          // ── vizOptions filters ──
          if (tile.kind === 'directory' && !vizOptions.showFolders) return null
          if (!vizOptions.showSubmodules && submoduleIds.has(tile.id)) return null
          if (tile.kind === 'file' && !vizOptions.showMisc && !EXT_COLOR[tile.ext]) return null

          if (tile.kind === 'directory') {
            const showLabel = w > 22 && h > 12
            const fs = Math.min(11, Math.max(8, Math.min(w * 0.1, 11)))
            const labelH = showLabel ? Math.min(HDR, h) : 0
            return (
              <div key={tile.id} style={{
                position: 'absolute', left: x, top: y, width: w, height: h,
                border: '1px solid rgba(255,153,0,0.3)',
                borderRadius: 3,
                background: 'rgba(255,153,0,0.05)',
                boxSizing: 'border-box',
                overflow: 'hidden',
                pointerEvents: 'none',   // outer box: passthrough for drag
              }}>
                {showLabel && (
                  // Label strip is the clickable drill-down target
                  <div
                    onClick={(e) => { e.stopPropagation(); if (!hasMoved.current) onDrillDown(tile.id, tile.name) }}
                    style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: labelH,
                      display: 'flex', alignItems: 'center', paddingLeft: 4,
                      cursor: 'pointer',
                      pointerEvents: 'all',
                      borderRadius: '3px 3px 0 0',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,153,0,0.15)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <span style={{
                      fontSize: fs, color: 'rgba(255,224,160,0.9)',
                      fontFamily: 'JetBrains Mono, monospace',
                      whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: w - 8,
                      lineHeight: 1.3,
                    }}>
                      {tile.name}
                    </span>
                  </div>
                )}
              </div>
            )
          }

          // ── File tile ──
          const isAgentActive = agentActiveIds.has(tile.id)
          const isSelected    = tile.id === activeFileId
          const isMatch       = !searchQuery || tile.name.toLowerCase().includes(searchQuery.toLowerCase())
          const accent        = EXT_COLOR[tile.ext] ?? '#64748b'
          const showName      = w > 26 && h > 11
          const fs            = Math.min(11, Math.max(7, Math.min(h * 0.55, w * 0.1)))

          const bg = isAgentActive
            ? `${accent}22`
            : isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'
          const borderColor = isAgentActive
            ? accent
            : isSelected ? `${accent}80` : 'rgba(255,255,255,0.07)'

          return (
            <div
              key={tile.id}
              onClick={() => { if (!hasMoved.current) setActiveFileId(tile.id) }}
              style={{
                position: 'absolute', left: x, top: y, width: w, height: h,
                background: bg,
                border: `1px solid ${borderColor}`,
                borderRadius: 3,
                boxSizing: 'border-box',
                cursor: 'pointer',
                opacity: searchQuery && !isMatch ? 0.1 : 1,
                overflow: 'visible',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '0 5px',
                // CSS color drives the ping rings' currentColor
                color: accent,
              }}
            >
              {/* Agent ping rings (reuse existing CSS classes from index.css) */}
              {isAgentActive && (
                <div style={{ position: 'absolute', inset: -3, borderRadius: 5, pointerEvents: 'none' }}>
                  <div className="agent-ping-outer" />
                  <div className="agent-ping-inner" />
                </div>
              )}

              {/* Left accent bar — bright when Claude touched it */}
              <div style={{
                width: 2, height: '60%', borderRadius: 1, flexShrink: 0,
                background: isAgentActive || tile.accessCount > 0 ? accent : 'rgba(255,255,255,0.12)',
              }} />

              {showName && (
                <span style={{
                  fontSize: fs, fontFamily: 'JetBrains Mono, monospace',
                  color: isAgentActive ? '#fff' : '#ccc',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', flex: 1,
                }}>
                  {tile.name}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
