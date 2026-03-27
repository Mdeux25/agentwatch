import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { MOUSE, TOUCH } from 'three'
import { SceneLighting } from './SceneLighting'
import { TreemapScene } from './TreemapScene'
import { SpreadTreeScene } from './SpreadTreeScene'
import { AgentSphereObject } from './AgentSphere'
import { useStore } from '../../store/useStore'
import {
  RenderErrorBoundary,
  onCanvasCreated,
  subscribeWebGLDebug,
} from './RenderErrorBoundary'

// In treemap mode, AgentSpheres use node.bounds — rendered separately
function TreemapAgentSpheres() {
  const { agentSpheres } = useStore()
  return (
    <>
      {Object.values(agentSpheres).map((sphere) => (
        <AgentSphereObject key={sphere.sessionId} sphere={sphere} />
      ))}
    </>
  )
}

function WebGLContextBanner() {
  const [contextLost, setContextLost] = useState(false)
  useEffect(() => subscribeWebGLDebug((s) => setContextLost(s.contextLost)), [])
  if (!contextLost) return null
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(10,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      color: '#f87171', gap: 8,
    }}>
      <span style={{ fontSize: 16 }}>⚠</span>
      WebGL context lost — reload to recover
    </div>
  )
}

export function SceneCanvas() {
  const { sceneMode } = useStore()

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <RenderErrorBoundary label="canvas">
        {/* Camera: steep top-down view. Avoid up=[0,0,-1] with perfectly vertical position
            as that causes NaN in the projection matrix and a rAF crash not caught by React. */}
        <Canvas
          camera={{ position: [0, 26, 3], fov: 48 }}
          style={{ background: 'transparent' }}
          onCreated={onCanvasCreated}
        >
          <SceneLighting />

          <Grid
            position={[0, -0.06, 0]}
            args={[120, 120]}
            cellSize={1}
            cellThickness={0.3}
            cellColor="#1a1640"
            sectionSize={6}
            sectionThickness={0.5}
            sectionColor="#23204a"
            fadeDistance={60}
            fadeStrength={1.5}
            followCamera
            infiniteGrid
          />

          <Suspense fallback={null}>
            <RenderErrorBoundary label="scene">
              {sceneMode === 'treemap' ? (
                <>
                  <TreemapScene />
                  <TreemapAgentSpheres />
                </>
              ) : (
                <SpreadTreeScene />
              )}
            </RenderErrorBoundary>
          </Suspense>

          {/* 2D pan+zoom: single touch/left-drag pans, two-finger/scroll zooms */}
          <OrbitControls
            enableRotate={false}
            enableDamping
            dampingFactor={0.12}
            screenSpacePanning
            minDistance={3}
            maxDistance={120}
            zoomSpeed={1.4}
            panSpeed={1.0}
            mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
            touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
          />
        </Canvas>
      </RenderErrorBoundary>

      <WebGLContextBanner />
    </div>
  )
}
