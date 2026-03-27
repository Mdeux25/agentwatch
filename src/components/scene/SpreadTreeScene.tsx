import { useMemo, useCallback } from 'react'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useStore } from '../../store/useStore'
import { ROOT_ID } from '../../lib/quadTree'
import { AgentSphereObject } from './AgentSphere'
import type { QuadNode } from '../../types/events'

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE    = 0.17     // file tile side
const GAP     = 0.04     // gap between tiles
const STEP    = TILE + GAP
const SLAB_T  = 0.018   // slab thickness (Y)
const TILE_H  = 0.038   // file tile height
const HDR_Z   = 0.22    // header strip Z-depth
const LEVEL_Z = 1.6     // Z-gap between parent slab-bottom and child slab-top
const H_GAP   = 0.7     // horizontal gap between sibling subtrees
const MIN_W   = 0.65    // minimum slab width
const EDGE_Y  = 0.14    // Y height of edge lines

// ── File type metadata ────────────────────────────────────────────────────────

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
  return FILE_META[ext.toLowerCase()] ?? FILE_META.default
}

// ── Layout types ──────────────────────────────────────────────────────────────

interface DirLayout {
  node: QuadNode
  x: number       // center X
  zTop: number    // top Z edge (where slab starts)
  depth: number
  files: QuadNode[]
  cols: number
  rows: number
  slabW: number
  slabD: number   // full Z extent of slab
  children: DirLayout[]
}

interface FilePos { x: number; z: number; depth: number; node: QuadNode }

// ── Layout computation ─────────────────────────────────────────────────────────

function subtreeWidth(node: QuadNode, allNodes: Record<string, QuadNode>): number {
  const fileCount = node.childIds.filter(id => allNodes[id]?.kind === 'file').length
  const dirKids   = node.childIds.filter(id => { const n = allNodes[id]; return n && n.kind !== 'file' })

  const cols  = Math.max(1, Math.ceil(Math.sqrt(Math.max(fileCount, 1))))
  const fileW = Math.max(cols * STEP + GAP * 2, MIN_W)

  if (dirKids.length === 0) return fileW
  let dW = dirKids.reduce((s, id) => {
    const n = allNodes[id]; return s + (n ? subtreeWidth(n, allNodes) : MIN_W)
  }, 0) + (dirKids.length - 1) * H_GAP
  return Math.max(fileW, dW)
}

function buildLayout(
  nodeId: string,
  allNodes: Record<string, QuadNode>,
  cx: number,
  zTop: number,
  depth: number,
): DirLayout | null {
  const node = allNodes[nodeId]
  if (!node || node.kind === 'file') return null

  const files = node.childIds
    .map(id => allNodes[id])
    .filter((n): n is QuadNode => n?.kind === 'file')

  const dirKidIds = node.childIds.filter(id => { const n = allNodes[id]; return n && n.kind !== 'file' })

  const cols  = Math.max(1, Math.ceil(Math.sqrt(Math.max(files.length, 1))))
  const rows  = files.length > 0 ? Math.ceil(files.length / cols) : 0
  const slabW = Math.max(cols * STEP + GAP * 2, MIN_W)
  const slabD = HDR_Z + (rows > 0 ? rows * STEP + GAP : 0)

  const children: DirLayout[] = []
  if (dirKidIds.length > 0) {
    const widths   = dirKidIds.map(id => { const n = allNodes[id]; return n ? subtreeWidth(n, allNodes) : MIN_W })
    const totalW   = widths.reduce((s, w) => s + w, 0) + (dirKidIds.length - 1) * H_GAP
    let   startX   = cx - totalW / 2
    for (let i = 0; i < dirKidIds.length; i++) {
      const childCx = startX + widths[i] / 2
      const child   = buildLayout(dirKidIds[i], allNodes, childCx, zTop + slabD + LEVEL_Z, depth + 1)
      if (child) children.push(child)
      startX += widths[i] + H_GAP
    }
  }

  return { node, x: cx, zTop, depth, files, cols, rows, slabW, slabD, children }
}

function flattenLayout(root: DirLayout): { dirs: DirLayout[]; filePosMap: Map<string, FilePos> } {
  const dirs: DirLayout[] = []
  const filePosMap = new Map<string, FilePos>()

  function visit(dl: DirLayout) {
    dirs.push(dl)
    dl.files.forEach((file, i) => {
      const col = i % dl.cols
      const row = Math.floor(i / dl.cols)
      filePosMap.set(file.id, {
        x:     dl.x + (col - (dl.cols - 1) / 2) * STEP,
        z:     dl.zTop + HDR_Z + row * STEP + TILE / 2,
        depth: dl.depth,
        node:  file,
      })
    })
    dl.children.forEach(visit)
  }
  visit(root)
  return { dirs, filePosMap }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SpreadTreeScene() {
  const { quadNodes, agentSpheres, activeFileId, setActiveFileId, vizOptions, searchQuery } = useStore()

  const rootNode = quadNodes[ROOT_ID]

  const { dirs, filePosMap } = useMemo(() => {
    if (!rootNode) return { dirs: [], filePosMap: new Map<string, FilePos>() }
    const layout = buildLayout(ROOT_ID, quadNodes, 0, 0, 0)
    if (!layout) return { dirs: [], filePosMap: new Map<string, FilePos>() }
    return flattenLayout(layout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadNodes, vizOptions])

  const getWorldPos = useCallback((fileId: string) => {
    const p = filePosMap.get(fileId)
    return p ? { x: p.x, z: p.z } : null
  }, [filePosMap])

  const activeAgentFileIds = new Set<string>(
    Object.values(agentSpheres).map(s => s.activeFileId).filter(Boolean) as string[]
  )

  if (!rootNode || dirs.length === 0) return null

  // A top-level directory counts as a submodule if it has a .git child
  const isSubmodule = (node: QuadNode) =>
    node.kind === 'directory' && node.depth === 0 &&
    node.childIds.some((id) => quadNodes[id]?.name === '.git')

  // Filter dirs for visibility
  const visibleDirs = dirs.filter(dl => {
    if (!vizOptions.showFolders) return false
    if (!vizOptions.showSubmodules && isSubmodule(dl.node)) return false
    return true
  })

  return (
    <>
      {/* ── Edge lines ────────────────────────────────────────────────────── */}
      {visibleDirs.map(dl =>
        dl.children
          .filter(child => vizOptions.showFolders || child.node.kind === 'file')
          .map(child => {
            const midZ = dl.zTop + dl.slabD + LEVEL_Z / 2
            return (
              <Line
                key={`e-${dl.node.id}::${child.node.id}`}
                points={[
                  [dl.x, EDGE_Y, dl.zTop + dl.slabD] as [number, number, number],
                  [dl.x, EDGE_Y, midZ]               as [number, number, number],
                  [child.x, EDGE_Y, midZ]             as [number, number, number],
                  [child.x, EDGE_Y, child.zTop]       as [number, number, number],
                ]}
                color="#2a3a60"
                lineWidth={1.2}
                opacity={0.55}
                transparent
              />
            )
          })
      )}

      {/* ── Directory slabs + file tile grids ─────────────────────────────── */}
      {visibleDirs.map(dl => {
        const slabY  = dl.depth * 0.04
        const slabCz = dl.zTop + dl.slabD / 2
        const labelSz = Math.min(10, Math.max(7, dl.slabW * 2.5))

        // Check if this dir only has misc files and misc is hidden
        const visibleFiles = dl.files.filter(f => {
          const isMisc = !FILE_META[f.ext]
          if (isMisc && !vizOptions.showMisc) return false
          return true
        })

        return (
          <group key={dl.node.id}>
            {/* Base slab */}
            <mesh position={[dl.x, slabY, slabCz]}>
              <boxGeometry args={[dl.slabW, SLAB_T, dl.slabD]} />
              <meshStandardMaterial
                color="#3a2200"
                roughness={0.88}
                metalness={0.04}
                transparent
                opacity={0.72}
              />
            </mesh>

            {/* Header glow strip (top-Z edge) */}
            <mesh position={[dl.x, slabY + 0.013, dl.zTop + HDR_Z / 2]}>
              <boxGeometry args={[dl.slabW, SLAB_T + 0.01, HDR_Z]} />
              <meshStandardMaterial
                color="#ff9900"
                emissive="#ff9900"
                emissiveIntensity={dl.depth === 0 ? 0.6 : 0.35}
                transparent
                opacity={0.42}
              />
            </mesh>

            {/* Folder name */}
            <Html
              position={[dl.x, slabY + 0.1, dl.zTop + HDR_Z * 0.48]}
              center
              zIndexRange={[5, 0]}
            >
              <span style={{
                color: '#ffe0a0',
                fontSize: `${labelSz}px`,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: '700',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                userSelect: 'none',
                letterSpacing: '0.04em',
                textShadow: '0 1px 6px rgba(0,0,0,0.95)',
                opacity: 0.92,
              }}>
                📁 {dl.node.name}
              </span>
            </Html>

            {/* File tiles */}
            {visibleFiles.map((file) => {
              const idx = dl.files.indexOf(file)
              const col = idx % dl.cols
              const row = Math.floor(idx / dl.cols)
              const fx  = dl.x + (col - (dl.cols - 1) / 2) * STEP
              const fz  = dl.zTop + HDR_Z + row * STEP + TILE / 2
              const fy  = slabY + SLAB_T / 2 + TILE_H / 2

              const meta        = getFileMeta(file.ext)
              const isSelected  = file.id === activeFileId
              const isActive    = activeAgentFileIds.has(file.id)
              const q           = searchQuery.trim().toLowerCase()
              const matchesSearch = !q || file.name.toLowerCase().includes(q) || file.ext.toLowerCase().includes(q)
              const dimmed      = !!q && !matchesSearch

              const handleClick = (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation()
                setActiveFileId(file.id)
              }

              return (
                <group key={file.id} position={[fx, fy, fz]}>
                  {/* Tile body */}
                  <mesh onClick={handleClick}>
                    <boxGeometry args={[TILE, TILE_H, TILE]} />
                    <meshStandardMaterial
                      color={isActive || isSelected ? meta.color : '#080c14'}
                      emissive={meta.accent}
                      emissiveIntensity={dimmed ? 0.02 : isActive ? 2.8 : isSelected ? 1.4 : matchesSearch && q ? 1.6 : 0.14}
                      roughness={0.2}
                      metalness={0.6}
                      transparent={dimmed}
                      opacity={dimmed ? 0.2 : 1}
                    />
                  </mesh>

                  {/* Left accent bar */}
                  <mesh position={[-TILE / 2 + 0.011, 0, 0]}>
                    <boxGeometry args={[0.022, TILE_H + 0.006, TILE]} />
                    <meshStandardMaterial
                      color={meta.accent}
                      emissive={meta.accent}
                      emissiveIntensity={isActive ? 3 : isSelected ? 1.8 : 0.65}
                      roughness={0.1}
                      metalness={0.8}
                    />
                  </mesh>

                  {/* Glow halo */}
                  {(isActive || isSelected) && (
                    <mesh position={[0, -TILE_H / 2 + 0.004, 0]}>
                      <boxGeometry args={[TILE + 0.06, 0.014, TILE + 0.06]} />
                      <meshStandardMaterial
                        color={meta.accent}
                        emissive={meta.accent}
                        emissiveIntensity={isActive ? 5 : 2.5}
                        transparent
                        opacity={isActive ? 0.44 : 0.24}
                      />
                    </mesh>
                  )}

                  {/* Search match ring — CSS-animated, very cheap */}
                  {matchesSearch && q && !dimmed && (
                    <Html position={[0, TILE_H / 2 + 0.01, 0]} center zIndexRange={[4, 0]}>
                      <div
                        className="search-match-ring"
                        style={{
                          width: `${TILE * 38}px`,
                          height: `${TILE * 38}px`,
                          color: meta.accent,
                        }}
                      />
                    </Html>
                  )}

                  {/* Agent active ping — CSS-animated expand+fade rings */}
                  {isActive && (
                    <Html position={[0, TILE_H / 2 + 0.01, 0]} center zIndexRange={[6, 0]}>
                      <div style={{ position: 'relative', width: `${TILE * 38}px`, height: `${TILE * 38}px`, color: meta.accent }}>
                        <div className="agent-ping-outer" />
                        <div className="agent-ping-inner" />
                      </div>
                    </Html>
                  )}

                  {/* Label card — show for selected/active or matched search */}
                  {(isSelected || isActive || (matchesSearch && q)) && (
                    <Html position={[0, TILE_H / 2 + 0.07, 0]} center zIndexRange={[5, 0]}>
                      <div style={{
                        background: 'rgba(4, 7, 18, 0.92)',
                        border: `1px solid ${meta.accent}50`,
                        borderRadius: '7px',
                        padding: '5px 9px 6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        pointerEvents: 'none',
                        userSelect: 'none',
                        boxShadow: `0 3px 14px rgba(0,0,0,0.85), 0 0 0 1px ${meta.accent}18`,
                        minWidth: 60,
                      }}>
                        {/* File type badge */}
                        <div style={{
                          background: `${meta.accent}1a`,
                          border: `1.5px solid ${meta.accent}60`,
                          borderRadius: '5px',
                          padding: '2px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <span style={{
                            fontSize: '9px',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: '800',
                            color: meta.accent,
                            letterSpacing: '0.05em',
                          }}>
                            {meta.icon}
                          </span>
                        </div>
                        {/* Filename */}
                        <span style={{
                          color: '#ffffff',
                          fontSize: '11px',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          textShadow: `0 0 10px ${meta.accent}90, 0 1px 3px rgba(0,0,0,0.9)`,
                          letterSpacing: '-0.01em',
                        }}>
                          {file.name}
                        </span>
                      </div>
                    </Html>
                  )}
                </group>
              )
            })}
          </group>
        )
      })}

      {/* ── Agent spheres with tree-space positions ───────────────────────── */}
      {Object.values(agentSpheres).map(sphere => (
        <AgentSphereObject
          key={sphere.sessionId}
          sphere={sphere}
          getWorldPos={getWorldPos}
        />
      ))}

    </>
  )
}
