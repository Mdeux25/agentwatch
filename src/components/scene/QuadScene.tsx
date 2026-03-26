import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useStore } from '../../store/useStore'
import { ROOT_ID } from '../../lib/quadTree'
import { FileSchemaCard } from './FileSchemaCard'

// ─── Colour maps ──────────────────────────────────────────────────────────────

const EXT_COLORS: Record<string, string> = {
  ts:     '#3b82f6',
  tsx:    '#06b6d4',
  js:     '#eab308',
  jsx:    '#f97316',
  rs:     '#fb923c',
  toml:   '#84cc16',
  json:   '#a3e635',
  css:    '#e879f9',
  scss:   '#e879f9',
  html:   '#f97316',
  md:     '#94a3b8',
  dart:   '#22d3ee',
  vue:    '#4ade80',
  svelte: '#ff3e00',
  py:     '#fbbf24',
  go:     '#00acd7',
  rb:     '#cc342d',
  lock:   '#475569',
  yaml:   '#6ee7b7',
  yml:    '#6ee7b7',
}

const DIR_DEPTH_COLORS = ['#1a1640', '#17143a', '#141135', '#110e2e', '#0e0b28']

function fileColor(ext: string) { return EXT_COLORS[ext] ?? '#4338ca' }
function dirColor(depth: number) {
  return DIR_DEPTH_COLORS[Math.min(depth, DIR_DEPTH_COLORS.length - 1)]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuadScene() {
  const { quadNodes, agentSpheres, activeFileId, setActiveFileId, activeFileContent } = useStore()

  const activeIds = new Set<string>(
    Object.values(agentSpheres)
      .map((s) => s.activeFileId)
      .filter(Boolean) as string[],
  )

  const nodes = Object.values(quadNodes).filter((n) => n.id !== ROOT_ID)
  if (nodes.length === 0) return null

  return (
    <>
      {nodes.map((node) => {
        const { bounds, kind, depth, name, ext } = node
        const isAgentActive = activeIds.has(node.id)
        const isSelected = node.id === activeFileId
        const isHighlit = isAgentActive || isSelected
        const cx = bounds.x + bounds.w / 2
        const cz = bounds.z + bounds.h / 2
        const yBase = depth * 0.025
        const showLabel = bounds.w > 0.5 && bounds.h > 0.35

        if (kind === 'directory') {
          const fontSize = Math.min(16, Math.max(11, bounds.w * 5))
          return (
            <group key={node.id} position={[cx, yBase, cz]}>
              <mesh>
                <boxGeometry args={[bounds.w, 0.03, bounds.h]} />
                <meshStandardMaterial
                  color={dirColor(depth)}
                  roughness={0.85}
                  metalness={0.05}
                  transparent
                  opacity={0.92}
                />
              </mesh>
              <mesh position={[0, -0.02, 0]}>
                <boxGeometry args={[bounds.w + 0.06, 0.015, bounds.h + 0.06]} />
                <meshStandardMaterial color="#2d2b55" transparent opacity={0.5} />
              </mesh>
              {showLabel && (
                <Html
                  position={[0, 0.08, -bounds.h / 2 + 0.12]}
                  center
                  zIndexRange={[5, 0]}
                >
                  <span
                    style={{
                      color: '#9896d4',
                      fontSize: `${fontSize}px`,
                      fontFamily: 'monospace',
                      fontWeight: '700',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      letterSpacing: '0.04em',
                      textShadow: '0 1px 6px rgba(0,0,0,0.8)',
                    }}
                  >
                    {name}/
                  </span>
                </Html>
              )}
            </group>
          )
        }

        // ── File tile ────────────────────────────────────────────────────────
        const color = fileColor(ext)
        const fontSize = Math.min(18, Math.max(12, bounds.w * 6))

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          setActiveFileId(node.id)
        }

        return (
          <group key={node.id} position={[cx, yBase + 0.04, cz]}>
            <mesh onClick={handleClick}>
              <boxGeometry args={[bounds.w, 0.06, bounds.h]} />
              <meshStandardMaterial
                color={isHighlit ? color : isSelected ? '#2a2860' : '#1c1a40'}
                emissive={color}
                emissiveIntensity={isAgentActive ? 2.8 : isSelected ? 1.4 : 0.1}
                roughness={0.2}
                metalness={0.6}
              />
            </mesh>
            {/* Glow halo — agent active or manually selected */}
            {isHighlit && (
              <mesh position={[0, -0.01, 0]}>
                <boxGeometry args={[bounds.w + 0.1, 0.02, bounds.h + 0.1]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={isAgentActive ? 5 : 2.5}
                  transparent
                  opacity={isAgentActive ? 0.45 : 0.25}
                />
              </mesh>
            )}
            {showLabel && (
              <Html position={[0, 0.16, 0]} center zIndexRange={[5, 0]}>
                <span
                  style={{
                    color: isHighlit ? '#ffffff' : color,
                    fontSize: `${fontSize}px`,
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    textShadow: isHighlit
                      ? `0 0 12px ${color}, 0 1px 6px rgba(0,0,0,0.9)`
                      : '0 1px 6px rgba(0,0,0,0.8)',
                    opacity: isHighlit ? 1 : 0.85,
                  }}
                >
                  {name}
                </span>
              </Html>
            )}
            {/* Schema card — floats above selected tile */}
            {isSelected && activeFileContent !== null && (
              <FileSchemaCard node={node} yBase={yBase + 0.04} />
            )}
          </group>
        )
      })}
    </>
  )
}
