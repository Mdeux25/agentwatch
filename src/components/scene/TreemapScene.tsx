import { useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useStore } from '../../store/useStore'
import { ROOT_ID } from '../../lib/quadTree'
import type { QuadNode } from '../../types/events'

// ─── File type metadata ────────────────────────────────────────────────────────

const FILE_META: Record<string, { color: string; accent: string; icon: string }> = {
  ts:      { color: '#001a3a', accent: '#3b82f6', icon: 'TS' },
  tsx:     { color: '#001030', accent: '#818cf8', icon: 'TSX' },
  js:      { color: '#1a2a00', accent: '#eab308', icon: 'JS' },
  jsx:     { color: '#002030', accent: '#f97316', icon: 'JSX' },
  css:     { color: '#001a2e', accent: '#06b6d4', icon: 'CSS' },
  scss:    { color: '#001a2e', accent: '#e879f9', icon: 'SCSS' },
  html:    { color: '#1a0800', accent: '#f97316', icon: 'HTML' },
  md:      { color: '#0a1a2a', accent: '#94a3b8', icon: 'MD' },
  json:    { color: '#1a1a00', accent: '#eab308', icon: '{}' },
  svg:     { color: '#1a001a', accent: '#d946ef', icon: 'SVG' },
  png:     { color: '#1a0000', accent: '#f87171', icon: 'PNG' },
  jpg:     { color: '#1a0a00', accent: '#fb923c', icon: 'JPG' },
  rs:      { color: '#1a0800', accent: '#fb923c', icon: 'RS' },
  toml:    { color: '#001a00', accent: '#84cc16', icon: 'TOML' },
  yaml:    { color: '#001a00', accent: '#6ee7b7', icon: 'YML' },
  yml:     { color: '#001a00', accent: '#6ee7b7', icon: 'YML' },
  lock:    { color: '#0a0a0a', accent: '#475569', icon: 'LOCK' },
  env:     { color: '#001a00', accent: '#4ade80', icon: 'ENV' },
  dart:    { color: '#001a2a', accent: '#22d3ee', icon: 'DART' },
  py:      { color: '#1a1a00', accent: '#fbbf24', icon: 'PY' },
  go:      { color: '#001a2a', accent: '#00acd7', icon: 'GO' },
  rb:      { color: '#1a0000', accent: '#cc342d', icon: 'RB' },
  vue:     { color: '#001a10', accent: '#4ade80', icon: 'VUE' },
  default: { color: '#0a0a0f', accent: '#64748b', icon: 'FILE' },
}

function getFileMeta(ext: string) {
  const known = FILE_META[ext.toLowerCase()]
  if (known) return known
  // Use actual extension as icon (e.g. "CPP", "HPP", "JAVA") — never show "FILE"
  return { ...FILE_META.default, icon: ext ? ext.toUpperCase().slice(0, 5) : '?' }
}

// ─── Layout types ─────────────────────────────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

interface LayoutCell {
  node: QuadNode
  rect: Rect
  depth: number
}

// ─── Size computation ─────────────────────────────────────────────────────────

function getNodeSize(node: QuadNode, allNodes: Record<string, QuadNode>): number {
  if (node.kind === 'file') return Math.max(node.accessCount, 1)
  const childSum = node.childIds.reduce((sum, id) => {
    const child = allNodes[id]
    return sum + (child ? getNodeSize(child, allNodes) : 0)
  }, 0)
  return Math.max(childSum, 1)
}

// ─── Squarified treemap algorithm ─────────────────────────────────────────────

function worstAspect(
  row: Array<{ size: number }>,
  rowSize: number,
  total: number,
  longSide: number,
  shortSide: number,
): number {
  if (row.length === 0 || rowSize <= 0 || total <= 0 || longSide <= 0 || shortSide <= 0) return Infinity
  const rowRatio = (rowSize / total) * longSide
  if (rowRatio <= 0) return Infinity
  let worst = 0
  for (const r of row) {
    const cellLen = (r.size / rowSize) * shortSide
    if (cellLen <= 0) continue
    const a = Math.max(rowRatio / cellLen, cellLen / rowRatio)
    if (a > worst) worst = a
  }
  return worst
}

function placeRow(
  row: Array<{ node: QuadNode; size: number }>,
  rowSize: number,
  rect: Rect,
  total: number,
  isHoriz: boolean,
): Array<{ node: QuadNode; size: number; rect: Rect }> {
  const { x, y, w, h } = rect
  const rowLen = isHoriz ? (rowSize / total) * w : (rowSize / total) * h
  let offset = 0
  return row.map((item) => {
    const cellLen = (item.size / rowSize) * (isHoriz ? h : w)
    const cellRect: Rect = isHoriz
      ? { x, y: y + offset, w: rowLen, h: cellLen }
      : { x: x + offset, y, w: cellLen, h: rowLen }
    offset += cellLen
    return { ...item, rect: cellRect }
  })
}

function squarify(
  items: Array<{ node: QuadNode; size: number }>,
  rect: Rect,
  total: number,
): Array<{ node: QuadNode; size: number; rect: Rect }> {
  if (items.length === 0) return []

  const { x, y, w, h } = rect
  const isHoriz = w >= h
  const shortSide = isHoriz ? h : w
  const longSide = isHoriz ? w : h
  const results: Array<{ node: QuadNode; size: number; rect: Rect }> = []

  let row: typeof items = []
  let rowSize = 0
  let i = 0

  while (i < items.length) {
    const item = items[i]
    const testRow = [...row, item]
    const testRowSize = rowSize + item.size

    if (
      row.length === 0 ||
      worstAspect(testRow, testRowSize, total, longSide, shortSide) <=
        worstAspect(row, rowSize, total, longSide, shortSide)
    ) {
      row = testRow
      rowSize += item.size
      i++
    } else {
      results.push(...placeRow(row, rowSize, rect, total, isHoriz))
      const newRect = isHoriz
        ? { x: x + (rowSize / total) * w, y, w: w - (rowSize / total) * w, h }
        : { x, y: y + (rowSize / total) * h, w, h: h - (rowSize / total) * h }
      return [...results, ...squarify(items.slice(i), newRect, total - rowSize)]
    }
  }

  results.push(...placeRow(row, rowSize, rect, total, isHoriz))
  return results
}

// ─── Flat layout builder ──────────────────────────────────────────────────────

const PAD = 0.06   // gap between tiles (world units)
const HDR = 0.38   // folder header height (world units)

function buildFlatLayout(
  nodeId: string,
  allNodes: Record<string, QuadNode>,
  rect: Rect,
  depth: number,
  cells: LayoutCell[],
) {
  const node = allNodes[nodeId]
  if (!node) return

  cells.push({ node, rect, depth })
  if (node.kind === 'file') return

  const children = node.childIds
    .map((id) => allNodes[id])
    .filter((c): c is QuadNode => Boolean(c))
    .map((child) => ({ node: child, size: getNodeSize(child, allNodes) }))
    .filter((c) => c.size > 0)
    .sort((a, b) => b.size - a.size)

  if (children.length === 0) return

  const hdr = Math.min(HDR, rect.h * 0.22)
  const innerRect: Rect = {
    x: rect.x + PAD,
    y: rect.y + hdr + PAD,
    w: Math.max(rect.w - PAD * 2, 0.01),
    h: Math.max(rect.h - hdr - PAD * 2, 0.01),
  }

  const total = children.reduce((s, c) => s + c.size, 0)
  const placed = squarify(children, innerRect, total)

  for (const p of placed) {
    buildFlatLayout(p.node.id, allNodes, p.rect, depth + 1, cells)
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

// A top-level directory is treated as a submodule if it has a child named '.git'
function isSubmoduleDir(node: QuadNode, allNodes: Record<string, QuadNode>): boolean {
  return node.kind === 'directory' && node.depth === 0 &&
    node.childIds.some((id) => allNodes[id]?.name === '.git')
}

export function TreemapScene() {
  const { quadNodes, agentSpheres, activeFileId, setActiveFileId, vizOptions, searchQuery, labelScale } = useStore()

  // ── Zoom-aware LOD: track camera Y so label density adapts as user zooms ──
  // Initial camera Y = 26 (full scene view). Smaller Y = zoomed in → more labels.
  const [zoomScale, setZoomScale] = useState(1.0)
  useFrame(({ camera }) => {
    const next = Math.min(26 / Math.max(camera.position.y, 1), 6)
    // Only trigger re-render when zoom changes noticeably (>10%)
    if (Math.abs(next - zoomScale) > 0.12) setZoomScale(next)
  })

  const rootNode = quadNodes[ROOT_ID]

  const cells = useMemo(() => {
    if (!rootNode) return []
    const result: LayoutCell[] = []
    buildFlatLayout(ROOT_ID, quadNodes, { x: -12, y: -12, w: 24, h: 24 }, 0, result)
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadNodes])

  const activeIds = new Set<string>(
    Object.values(agentSpheres)
      .map((s) => s.activeFileId)
      .filter(Boolean) as string[],
  )

  if (!rootNode || cells.length === 0) return null

  // Apply visibility filters
  const visibleCells = cells.filter(({ node }) => {
    if (!vizOptions.showFolders && node.kind === 'directory') return false
    if (!vizOptions.showSubmodules && isSubmoduleDir(node, quadNodes)) return false
    if (!vizOptions.showMisc && node.kind === 'file' && !FILE_META[node.ext]) return false
    return true
  })

  return (
    <>
      {visibleCells.map(({ node, rect, depth }) => {
        const isFile = node.kind === 'file'
        const isSelected = node.id === activeFileId
        const isAgentActive = activeIds.has(node.id)

        const cx = rect.x + rect.w / 2
        const cz = rect.y + rect.h / 2
        const yBase = depth * 0.03

        // Trim edges so adjacent tiles have visible gaps
        const bw = Math.max(rect.w - PAD, 0.02)
        const bh = Math.max(rect.h - PAD, 0.02)

        // Zoom-aware LOD: effectiveArea grows as user zooms in, so labels
        // appear progressively as tiles become larger on screen.
        // Threshold 4.0 → ~top 15 tiles at full zoom for 600-file project,
        // ~all tiles at 3× zoom (zoomed into a section).
        const effectiveArea = bw * bh * zoomScale * zoomScale
        const showLabel = isAgentActive || isSelected || effectiveArea > 4.0
        const showIcon  = isAgentActive || isSelected || effectiveArea > 1.8

        if (!isFile) {
          // ── Directory slab ───────────────────────────────────────────────
          const hdrH = Math.min(HDR, rect.h * 0.22)
          const labelSize = Math.min(14, Math.max(8, Math.min(bw, bh) * 3)) * labelScale

          return (
            <group key={node.id} position={[cx, yBase, cz]}>
              {/* Base slab */}
              <mesh>
                <boxGeometry args={[bw, 0.025, bh]} />
                <meshStandardMaterial
                  color="#4a2e00"
                  roughness={0.85}
                  metalness={0.05}
                  transparent
                  opacity={0.88}
                />
              </mesh>
              {/* Header glow strip — top-z edge */}
              {bh > 0.28 && (
                <mesh position={[0, 0.013, -bh / 2 + Math.min(hdrH, bh * 0.22) / 2]}>
                  <boxGeometry args={[bw, 0.014, Math.min(hdrH, bh * 0.22)]} />
                  <meshStandardMaterial
                    color="#ff9900"
                    emissive="#ff9900"
                    emissiveIntensity={depth === 0 ? 0.7 : 0.4}
                    transparent
                    opacity={0.5}
                  />
                </mesh>
              )}
              {/* Folder name label */}
              {showLabel && (
                <Html position={[0, 0.09, -bh / 2 + 0.07]} center zIndexRange={[5, 0]}>
                  <span
                    style={{
                      color: '#ffe0a0',
                      fontSize: `${labelSize}px`,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '700',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      letterSpacing: '0.04em',
                      textShadow: '0 1px 6px rgba(0,0,0,0.95)',
                      opacity: 0.92,
                    }}
                  >
                    📁 {node.name}
                  </span>
                </Html>
              )}
            </group>
          )
        }

        // ── File tile ─────────────────────────────────────────────────────────
        const meta = getFileMeta(node.ext)
        const labelSize = Math.min(12, Math.max(7, Math.min(bw, bh) * 3.5)) * labelScale
        const q = searchQuery.trim().toLowerCase()
        const matchesSearch = !q || node.name.toLowerCase().includes(q) || node.ext.toLowerCase().includes(q)
        const dimmed = !!q && !matchesSearch

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          setActiveFileId(node.id)
        }

        return (
          <group key={node.id} position={[cx, yBase + 0.04, cz]}>
            {/* Main tile body */}
            <mesh onClick={handleClick}>
              <boxGeometry args={[bw, 0.06, bh]} />
              <meshStandardMaterial
                color={isAgentActive || isSelected ? meta.color : '#080c14'}
                emissive={meta.accent}
                emissiveIntensity={dimmed ? 0.01 : isAgentActive ? 2.8 : isSelected ? 1.4 : matchesSearch && q ? 1.8 : 0.12}
                roughness={0.2}
                metalness={0.6}
                transparent={dimmed}
                opacity={dimmed ? 0.18 : 1}
              />
            </mesh>

            {/* Left accent edge bar */}
            <mesh position={[-bw / 2 + 0.015, 0, 0]}>
              <boxGeometry args={[0.03, 0.07, bh]} />
              <meshStandardMaterial
                color={meta.accent}
                emissive={meta.accent}
                emissiveIntensity={isAgentActive ? 3 : isSelected ? 1.8 : 0.7}
                roughness={0.1}
                metalness={0.8}
              />
            </mesh>

            {/* Glow halo for active / selected */}
            {(isAgentActive || isSelected) && (
              <mesh position={[0, -0.01, 0]}>
                <boxGeometry args={[bw + 0.08, 0.02, bh + 0.08]} />
                <meshStandardMaterial
                  color={meta.accent}
                  emissive={meta.accent}
                  emissiveIntensity={isAgentActive ? 5 : 2.5}
                  transparent
                  opacity={isAgentActive ? 0.45 : 0.25}
                />
              </mesh>
            )}

            {/* Search match ring — show for any match regardless of tile size */}
            {matchesSearch && q && !dimmed && (
              <Html position={[0, 0.09, 0]} center zIndexRange={[4, 0]}>
                <div
                  className="search-match-ring"
                  style={{ width: `${bw * 38}px`, height: `${bh * 38}px`, color: meta.accent }}
                />
              </Html>
            )}

            {/* Agent active ping — CSS-animated expand+fade rings */}
            {isAgentActive && (
              <Html position={[0, 0.09, 0]} center zIndexRange={[6, 0]}>
                <div style={{ position: 'relative', width: `${bw * 38}px`, height: `${bh * 38}px`, color: meta.accent }}>
                  <div className="agent-ping-outer" />
                  <div className="agent-ping-inner" />
                </div>
              </Html>
            )}

            {/* File label card */}
            {showLabel && (
              <Html position={[0, 0.13, 0]} center zIndexRange={[5, 0]}>
                <div
                  style={{
                    background: isAgentActive || isSelected ? 'rgba(4, 7, 18, 0.92)' : 'rgba(4, 7, 18, 0.72)',
                    border: `1px solid ${meta.accent}${isAgentActive || isSelected ? '55' : '30'}`,
                    borderRadius: '6px',
                    padding: '4px 7px 5px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    pointerEvents: 'none',
                    userSelect: 'none',
                    boxShadow: isAgentActive || isSelected ? `0 2px 12px rgba(0,0,0,0.8), 0 0 0 1px ${meta.accent}18` : 'none',
                    minWidth: 40,
                  }}
                >
                  {showIcon && (
                    <div style={{
                      background: `${meta.accent}1a`,
                      border: `1.5px solid ${meta.accent}55`,
                      borderRadius: '4px',
                      padding: '1px 5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{
                        fontSize: `${Math.round(8 * labelScale)}px`,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: '800',
                        color: meta.accent,
                        letterSpacing: '0.04em',
                      }}>
                        {meta.icon}
                      </span>
                    </div>
                  )}
                  <span
                    style={{
                      color: isAgentActive || isSelected ? '#ffffff' : meta.accent,
                      fontSize: `${Math.max(labelSize, 9 * labelScale)}px`,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '700',
                      whiteSpace: 'nowrap',
                      textShadow: isAgentActive || isSelected
                        ? `0 0 10px ${meta.accent}90, 0 1px 3px rgba(0,0,0,0.9)`
                        : '0 1px 3px rgba(0,0,0,0.8)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {node.name}
                  </span>
                </div>
              </Html>
            )}
          </group>
        )
      })}

    </>
  )
}
