import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { SceneLighting } from './SceneLighting'
import { QuadScene } from './QuadScene'
import { AgentSphereObject } from './AgentSphere'
import { useStore } from '../../store/useStore'

function AgentSpheres() {
  const { agentSpheres } = useStore()
  return (
    <>
      {Object.values(agentSpheres).map((sphere) => (
        <AgentSphereObject key={sphere.sessionId} sphere={sphere} />
      ))}
    </>
  )
}

export function SceneCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 22, 5], fov: 60 }}
      style={{ background: 'transparent' }}
    >
      <SceneLighting />

      {/* Ground grid — gives the QuadTree a floor reference */}
      <Grid
        position={[0, -0.06, 0]}
        args={[60, 60]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#1a1640"
        sectionSize={6}
        sectionThickness={0.5}
        sectionColor="#23204a"
        fadeDistance={40}
        fadeStrength={1.5}
        followCamera={false}
        infiniteGrid
      />

      <Suspense fallback={null}>
        <QuadScene />
        <AgentSpheres />
      </Suspense>

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        screenSpacePanning
        minDistance={2}
        maxDistance={60}
        zoomSpeed={1.2}
        panSpeed={0.9}
      />
    </Canvas>
  )
}
