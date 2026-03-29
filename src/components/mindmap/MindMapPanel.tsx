import { useState, useCallback, useRef, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { ForceCanvas } from './ForceCanvas'
import { PseudoPanel } from './PseudoPanel'
import { ArchPanel } from './ArchPanel'
import { saveMindMap } from '../../lib/mindMapStorage'
import { readFileFull } from '../../lib/tauri'
import type { MapNode, MindMapData } from '../../types/mindMap'

const BINARY_EXTS = new Set([
  'png','jpg','jpeg','gif','webp','bmp','ico','tiff','svg','woff','woff2',
  'ttf','otf','eot','pdf','zip','tar','gz','dmg','exe','bin','dylib','so','a','o','lock',
])

interface PseudoState {
  node: MapNode; symIdx: number; screenX: number; screenY: number
}

function scatterPos(dir: string, allDirs: string[]): { x: number; y: number } {
  const idx = allDirs.indexOf(dir)
  const angle = (idx / (allDirs.length || 1)) * 2 * Math.PI
  const r = 350
  return {
    x: r * Math.cos(angle) + (Math.random() - 0.5) * 160,
    y: r * Math.sin(angle) + (Math.random() - 0.5) * 160,
  }
}

export function MindMapPanel() {
  const mindMapData      = useStore(s => s.mindMapData)
  const setMindMapData   = useStore(s => s.setMindMapData)
  const addFileToMindMap = useStore(s => s.addFileToMindMap)
  const projectRoot      = useStore(s => s.projectRoot)
  const quadNodes        = useStore(s => s.quadNodes)

  const [mapView, setMapView]           = useState<'graph' | 'arch'>('arch')
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [pseudoState, setPseudoState]   = useState<PseudoState | null>(null)
  const [dimensions, setDimensions]     = useState({ w: 800, h: 600 })
  const [scanning, setScanning]         = useState(false)
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null)
  const [expandingIds, setExpandingIds] = useState<Set<string>>(new Set())
  const containerRef    = useRef<HTMLDivElement>(null)
  const lastScannedRoot = useRef<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDimensions({ w: width, h: height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ── Full read-scan: reads every file, adds as explored nodes ─────────────────
  const handleAnalyzeFolder = useCallback(async () => {
    if (!projectRoot || scanning) return
    const filePaths = Object.values(quadNodes)
      .filter(n => n.kind === 'file' && !BINARY_EXTS.has(n.ext?.toLowerCase() ?? ''))
      .map(n => n.id)
      .filter(fp => fp.startsWith(projectRoot))
      .slice(0, 150)
    if (filePaths.length === 0) return

    setScanning(true)
    setScanProgress({ done: 0, total: filePaths.length })
    let done = 0
    const BATCH = 8
    for (let i = 0; i < filePaths.length; i += BATCH) {
      const batch = filePaths.slice(i, i + BATCH)
      await Promise.all(batch.map(async fp => {
        try {
          const content = await readFileFull(fp)
          const ext = fp.split('.').pop()?.toLowerCase() ?? ''
          useStore.getState().addFileToMindMap(fp, content, ext, projectRoot)
        } catch { /* unreadable — skip */ }
        done++
        setScanProgress({ done, total: filePaths.length })
      }))
    }
    const saved = useStore.getState().mindMapData
    if (saved && projectRoot) saveMindMap(projectRoot, saved).catch(() => {})
    setScanning(false)
    setScanProgress(null)
  }, [projectRoot, quadNodes, scanning])

  // ── Auto-scan once on project open (if no existing map data) ─────────────────
  useEffect(() => {
    const fileCount = Object.values(quadNodes).filter(n => n.kind === 'file' && !BINARY_EXTS.has(n.ext?.toLowerCase() ?? '')).length
    if (!projectRoot || fileCount === 0) return
    if (lastScannedRoot.current === projectRoot) return
    if (mindMapData && Object.keys(mindMapData.nodes).length > 0) {
      lastScannedRoot.current = projectRoot
      return
    }
    lastScannedRoot.current = projectRoot
    handleAnalyzeFolder()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot, Object.keys(quadNodes).length])

  // ── Scan: add all files as BLACK BOXES (no reading) ───────────────────────────
  const handleScanProject = useCallback(async () => {
    if (!projectRoot || scanning) return
    const filePaths = Object.values(quadNodes)
      .filter(n => n.kind === 'file' && !BINARY_EXTS.has(n.ext?.toLowerCase() ?? ''))
      .map(n => n.id)
      .filter(fp => fp.startsWith(projectRoot))
      .slice(0, 200)
    if (filePaths.length === 0) return
    setScanning(true)

    const existing = mindMapData ?? { nodes: {}, edges: [], showExternals: false }
    const newNodes = { ...existing.nodes }

    // Group by dir for cluster placement
    const dirGroups: Record<string, string[]> = {}
    for (const fp of filePaths) {
      const dir = fp.substring(0, fp.lastIndexOf('/'))
      if (!dirGroups[dir]) dirGroups[dir] = []
      dirGroups[dir].push(fp)
    }
    const allDirs = Object.keys(dirGroups)

    for (const [dir, paths] of Object.entries(dirGroups)) {
      for (const fp of paths) {
        if (!newNodes[fp]) {
          const pos = scatterPos(dir, allDirs)
          newNodes[fp] = {
            id: fp,
            kind: 'file',
            label: fp.split('/').pop() ?? fp,
            filePath: fp,
            dir,
            isBlackBox: true,   // ← always black box on scan
            isExternal: false,
            symbols: [],
            x: pos.x,
            y: pos.y,
          }
        }
      }
    }

    const updated: MindMapData = { ...existing, nodes: newNodes }
    setMindMapData(updated)
    if (projectRoot) saveMindMap(projectRoot, updated).catch(() => {})
    setScanning(false)
  }, [projectRoot, quadNodes, scanning, mindMapData, setMindMapData])

  // ── Expand: click black-box → read file → explore ────────────────────────────
  const handleNodeExpand = useCallback(async (nodeId: string) => {
    if (!projectRoot || !mindMapData) return
    const node = mindMapData.nodes[nodeId]
    if (!node || !node.isBlackBox || node.isExternal) return

    setExpandingIds(prev => new Set([...prev, nodeId]))
    try {
      const content = await readFileFull(nodeId)
      const ext = nodeId.split('.').pop()?.toLowerCase() ?? ''
      addFileToMindMap(nodeId, content, ext, projectRoot)
      const data = useStore.getState().mindMapData
      if (data && projectRoot) saveMindMap(projectRoot, data).catch(() => {})
    } catch {
      // file unreadable — leave as black box
    }
    setExpandingIds(prev => { const s = new Set(prev); s.delete(nodeId); return s })
  }, [projectRoot, mindMapData, addFileToMindMap])

  // ── Collapse: explored → black box ───────────────────────────────────────────
  const handleNodeCollapse = useCallback((nodeId: string) => {
    if (!mindMapData) return
    const node = mindMapData.nodes[nodeId]
    if (!node || node.isBlackBox) return
    const updated = {
      ...mindMapData,
      nodes: { ...mindMapData.nodes, [nodeId]: { ...node, isBlackBox: true, symbols: [] } },
    }
    setMindMapData(updated)
    if (projectRoot) saveMindMap(projectRoot, updated).catch(() => {})
    if (selectedId === nodeId) { setSelectedId(null); setPseudoState(null) }
  }, [mindMapData, setMindMapData, projectRoot, selectedId])

  const handleNodeSelect  = useCallback((id: string | null) => { setSelectedId(id); if (!id) setPseudoState(null) }, [])
  const handleSymbolClick = useCallback((node: MapNode, symIdx: number, sx: number, sy: number) => setPseudoState({ node, symIdx, screenX: sx, screenY: sy }), [])
  const handlePositionsCommit = useCallback((positions: Record<string, { x: number; y: number }>) => {
    if (!mindMapData) return
    const updatedNodes = { ...mindMapData.nodes }
    for (const [id, pos] of Object.entries(positions)) {
      if (updatedNodes[id]) updatedNodes[id] = { ...updatedNodes[id], ...pos }
    }
    const updated = { ...mindMapData, nodes: updatedNodes }
    setMindMapData(updated)
    if (projectRoot) saveMindMap(projectRoot, updated).catch(() => {})
  }, [mindMapData, setMindMapData, projectRoot])

  const toggleExternals = useCallback(() => {
    if (!mindMapData) return
    const updated = { ...mindMapData, showExternals: !mindMapData.showExternals }
    setMindMapData(updated)
    if (projectRoot) saveMindMap(projectRoot, updated).catch(() => {})
  }, [mindMapData, setMindMapData, projectRoot])

  const nodeCount = mindMapData
    ? Object.values(mindMapData.nodes).filter(n => !n.isExternal || mindMapData.showExternals).length : 0
  const edgeCount = mindMapData?.edges.length ?? 0

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (!mindMapData || Object.keys(mindMapData.nodes).length === 0) {
    const codeFileCount = Object.values(quadNodes).filter(n =>
      n.kind === 'file' && !BINARY_EXTS.has(n.ext?.toLowerCase() ?? '')
    ).length

    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 14,
        background: 'radial-gradient(ellipse at 50% 50%,#1e2130 0%,#1a1a1e 60%,#171719 100%)',
        fontFamily: "'JetBrains Mono',ui-monospace,monospace",
      }}>
        <div style={{ fontSize: 28, color: '#2d3050' }}>◈</div>
        <div style={{ color: '#3d4468', fontSize: 13, letterSpacing: '.04em' }}>ARCH</div>
        {scanning ? (
          <div style={{ color: '#4fc3f7', fontSize: 11 }}>adding files…</div>
        ) : codeFileCount > 0 && projectRoot ? (
          <button onClick={handleScanProject} style={{
            background: 'rgba(79,195,247,.1)', border: '1px solid #4fc3f7', borderRadius: 5,
            color: '#4fc3f7', fontSize: 11, fontFamily: 'inherit', fontWeight: 600,
            padding: '6px 18px', cursor: 'pointer', letterSpacing: '.04em',
          }}>
            ⊕ Add {codeFileCount} files as nodes
          </button>
        ) : null}
        <div style={{ fontSize: 10, color: '#252525', letterSpacing: '.03em' }}>
          or click on a file in the explorer to open it
        </div>
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 36, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
        background: '#252526', borderBottom: '1px solid #3e3e42',
        fontFamily: "'JetBrains Mono',ui-monospace,monospace", flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#555' }}>◈ ARCH</span>
        <div style={{ width: 1, height: 18, background: '#3e3e42', margin: '0 2px' }} />
        {scanProgress ? (
          <span style={{ fontSize: 11, color: '#4fc3f7' }}>
            scanning {scanProgress.done}/{scanProgress.total} files…
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#444' }}>{nodeCount} nodes · {edgeCount} edges</span>
        )}
        <div style={{ flex: 1 }} />
        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid #3e3e42', borderRadius: 4, overflow: 'hidden' }}>
          {(['graph', 'arch'] as const).map(v => (
            <button key={v} onClick={() => setMapView(v)} style={{
              background: mapView === v ? 'rgba(79,195,247,.15)' : 'transparent',
              border: 'none', borderRight: v === 'graph' ? '1px solid #3e3e42' : 'none',
              color: mapView === v ? '#4fc3f7' : '#555',
              fontSize: 10, padding: '3px 10px', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: mapView === v ? 700 : 400,
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>{v === 'graph' ? 'Graph' : 'Arch'}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: '#3e3e42', margin: '0 2px' }} />
        {mapView === 'graph' && <span style={{ fontSize: 10, color: '#2a2a2a', fontStyle: 'italic' }}>scroll=zoom · drag=pan</span>}
        {mapView === 'graph' && <div style={{ width: 1, height: 18, background: '#3e3e42', margin: '0 2px' }} />}

        <button onClick={handleScanProject} disabled={scanning}
          style={{
            background: 'rgba(255,255,255,.05)', border: '1px solid #3e3e42',
            borderRadius: 4, color: scanning ? '#4fc3f7' : '#9ca3af', fontSize: 11,
            padding: '3px 10px', cursor: scanning ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}>
          {scanning ? 'adding…' : '⟳ rescan'}
        </button>
        <button onClick={toggleExternals} style={{
          background: mindMapData.showExternals ? 'rgba(79,195,247,.12)' : 'rgba(255,255,255,.05)',
          border: `1px solid ${mindMapData.showExternals ? '#4fc3f7' : '#3e3e42'}`,
          borderRadius: 4, color: mindMapData.showExternals ? '#4fc3f7' : '#9ca3af',
          fontSize: 11, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          npm {mindMapData.showExternals ? '✓' : '○'}
        </button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ position: 'absolute', top: 36, left: 0, right: 0, bottom: 0, display: 'flex' }}>
        {mapView === 'graph' ? (
          <ForceCanvas
            data={mindMapData}
            width={dimensions.w}
            height={Math.max(1, dimensions.h)}
            selectedId={selectedId}
            expandingIds={expandingIds}
            onNodeSelect={handleNodeSelect}
            onNodeExpand={handleNodeExpand}
            onNodeCollapse={handleNodeCollapse}
            onPositionsCommit={handlePositionsCommit}
            onSymbolClick={handleSymbolClick}
          />
        ) : (
          <ArchPanel
            data={mindMapData}
            projectRoot={projectRoot}
            onAnalyzeFolder={handleAnalyzeFolder}
            folderScanning={scanning}
            scanProgress={scanProgress}
          />
        )}
      </div>

      {/* Legend — graph view only */}
      {mapView === 'graph' && <div style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 10,
        background: 'rgba(18,18,20,.92)', border: '1px solid #2e2e32',
        borderRadius: 8, padding: '10px 14px', backdropFilter: 'blur(8px)',
        fontFamily: "'JetBrains Mono',ui-monospace,monospace",
        fontSize: 10, pointerEvents: 'none',
      }}>
        <div style={{ color: '#333', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 7 }}>Legend</div>
        {[
          { box: 'rgba(255,255,255,.05)', border: '1.5px solid #4ade80', label: 'Explored — click ⊟ to collapse' },
          { box: '#0f0f0f', border: '1px dashed #444', label: 'Unexplored — click to open' },
          { box: 'rgba(99,102,241,.1)', border: '1px solid #4f46e5', label: 'npm package' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < 2 ? 5 : 0, color: '#555' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: r.box, border: r.border }} />
            {r.label}
          </div>
        ))}
      </div>}

      {/* Pseudo panel — graph view only */}
      <AnimatePresence>
        {pseudoState && (
          <PseudoPanel
            key={`${pseudoState.node.id}-${pseudoState.symIdx}`}
            node={pseudoState.node}
            symIdx={pseudoState.symIdx}
            screenX={pseudoState.screenX}
            screenY={pseudoState.screenY}
            onClose={() => setPseudoState(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
