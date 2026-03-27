import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, MeshStandardMaterial } from 'three'
import { useStore } from '../../store/useStore'
import type { AgentSphere } from '../../types/events'

interface Props {
  sphere: AgentSphere
  getWorldPos?: (fileId: string) => { x: number; z: number } | null
}

export function AgentSphereObject({ sphere, getWorldPos }: Props) {
  const meshRef = useRef<Mesh>(null)
  const { quadNodes } = useStore()

  // Smoothed XZ position (no bounce on XZ)
  const targetX = useRef(0)
  const targetZ = useRef(0)
  const targetY = useRef(1.5)

  // Jump timer: counts from 1 → 0, drives both bounce and flash
  const jumpTimer = useRef(0)

  // Trigger a bounce whenever this agent's jumpTrigger increments
  useEffect(() => {
    jumpTimer.current = 1.0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sphere.jumpTrigger])

  useFrame((state, delta) => {
    if (!meshRef.current) return

    // Resolve target position from active quad node
    const node = sphere.activeFileId ? quadNodes[sphere.activeFileId] : null
    if (node) {
      if (getWorldPos) {
        const wp = getWorldPos(sphere.activeFileId!)
        if (wp) { targetX.current = wp.x; targetZ.current = wp.z; targetY.current = 1.5 }
      } else {
        targetX.current = node.bounds.x + node.bounds.w / 2
        targetZ.current = node.bounds.z + node.bounds.h / 2
        targetY.current = 1.5 + node.depth * 0.025
      }
    } else {
      targetX.current = 0
      targetZ.current = 0
      targetY.current = 1.5
    }

    // Smooth XZ lerp
    meshRef.current.position.x += (targetX.current - meshRef.current.position.x) * 0.1
    meshRef.current.position.z += (targetZ.current - meshRef.current.position.z) * 0.1

    // ── Bounce arc on Y ──────────────────────────────────────────────────────
    const t = jumpTimer.current
    const arc = t > 0 ? Math.sin(t * Math.PI) * 1.1 : 0
    meshRef.current.position.y = targetY.current + arc

    // Decay timer
    jumpTimer.current = Math.max(0, t - delta * 2.4)

    // ── Emissive: flash on landing, gentle pulse otherwise ───────────────────
    const mat = meshRef.current.material as MeshStandardMaterial
    if (mat) {
      // Landing flash fires when t crosses ≈ 0.15 (near the end of the arc)
      const landFlash = t > 0 && t < 0.22 ? (0.22 - t) / 0.22 : 0
      // Travel dim: slightly dimmer while jumping
      const travelDim = t > 0.3 ? 0.4 : 0
      const pulse = Math.sin(state.clock.elapsedTime * 2.0) * 0.35
      mat.emissiveIntensity = 2.0 + pulse - travelDim + landFlash * 4.0
    }
  })

  return (
    <mesh ref={meshRef} position={[targetX.current, targetY.current, targetZ.current]}>
      <sphereGeometry args={[0.2, 24, 24]} />
      <meshStandardMaterial
        color={sphere.color}
        emissive={sphere.color}
        emissiveIntensity={2}
        roughness={0.05}
        metalness={0.5}
        transparent
        opacity={0.95}
      />
      {/* Local light that travels with the sphere */}
      <pointLight color={sphere.color} intensity={3} distance={6} decay={2} />
    </mesh>
  )
}
