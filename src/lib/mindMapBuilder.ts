import { parseSymbols, extractPseudo } from './symbolParser'
import type { MapNode, MapEdge, MindMapData } from '../types/mindMap'

// ── EXT_COLOR (matches App.tsx) ────────────────────────────────────────────────
const EXT_COLOR: Record<string, string> = {
  ts: '#3b82f6', tsx: '#818cf8', js: '#eab308', jsx: '#f97316',
  css: '#06b6d4', scss: '#e879f9', html: '#f97316', md: '#94a3b8',
  json: '#eab308', swift: '#fb923c', py: '#fbbf24', go: '#00acd7',
  rs: '#fb923c', rb: '#cc342d', vue: '#4ade80', dart: '#22d3ee',
}
export { EXT_COLOR }

const NODE_CAP = 100

// ── Import parsing ─────────────────────────────────────────────────────────────

function parseImports(content: string, ext: string): string[] {
  const imports: string[] = []
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue'].includes(ext)) {
    const re1 = /(?:import|from)\s+['"]([^'"]+)['"]/g
    const re2 = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    let m: RegExpExecArray | null
    while ((m = re1.exec(content)) !== null) imports.push(m[1])
    while ((m = re2.exec(content)) !== null) imports.push(m[1])
  } else if (ext === 'py') {
    const re = /^(?:import|from)\s+(\S+)/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) imports.push(m[1])
  }
  return [...new Set(imports)]
}

function isRelative(imp: string) {
  return imp.startsWith('./') || imp.startsWith('../')
}

function resolveRelative(imp: string, fileDir: string): string {
  // Join fileDir + imp and normalize
  const parts = (fileDir + '/' + imp).split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '..') resolved.pop()
    else if (part !== '.') resolved.push(part)
  }
  return resolved.join('/')
}

// ── Cluster center math ────────────────────────────────────────────────────────

function clusterCenter(dir: string, allDirs: string[]): { x: number; y: number } {
  const idx = allDirs.indexOf(dir)
  const total = allDirs.length || 1
  const angle = (idx / total) * 2 * Math.PI
  const r = 350
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) }
}

function scatterPos(cx: number, cy: number): { x: number; y: number } {
  const r = (Math.random() - 0.5) * 160
  const theta = Math.random() * 2 * Math.PI
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) }
}

// ── Core builder ──────────────────────────────────────────────────────────────

export function buildFileMapDelta(
  filePath: string,
  content: string,
  ext: string,
  _projectRoot: string,
  existingData: MindMapData,
): { newNodes: MapNode[]; newEdges: MapEdge[] } {
  const existingNodes = existingData.nodes
  const existingEdges = existingData.edges

  const newNodes: MapNode[] = []
  const newEdges: MapEdge[] = []

  const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
  const label = filePath.split('/').pop() ?? filePath

  // All known dirs (for cluster placement)
  const allDirs = [...new Set([
    ...Object.values(existingNodes).map(n => n.dir),
    fileDir,
  ])]

  // ── Build the explored node for the current file ──
  const rawSymbols = parseSymbols(content, ext)
  const lines = content.split('\n')

  // Functions only, cap at 6
  const fnSymbols = rawSymbols.filter(s => s.kind === 'function').slice(0, 6)

  // Attach pseudo-code to each symbol
  const symbols = fnSymbols.map((sym, i) => {
    const nextLine = fnSymbols[i + 1]?.line ?? sym.line + 40
    const pseudo = extractPseudo(lines, sym.line, nextLine)
    return { ...sym, pseudo }
  })

  const existingPos = existingNodes[filePath]
  const center = clusterCenter(fileDir, allDirs)
  const pos = existingPos ?? scatterPos(center.x, center.y)

  const fileNode: MapNode = {
    id: filePath,
    kind: 'file',
    label,
    filePath,
    dir: fileDir,
    isBlackBox: false,
    isExternal: false,
    symbols,
    x: pos.x,
    y: pos.y,
  }
  newNodes.push(fileNode)

  // ── Parse imports and create dep nodes + edges ──
  const imports = parseImports(content, ext)
  const totalVisible = Object.values(existingNodes).filter(n => !n.isExternal || existingData.showExternals).length
  let capReached = totalVisible + newNodes.length > NODE_CAP

  for (const imp of imports) {
    if (isRelative(imp)) {
      const resolved = resolveRelative(imp, fileDir)
      const nodeId = resolved
      const edgeId = `${filePath}→${nodeId}`

      // Skip duplicate edges
      if (existingEdges.some(e => e.id === edgeId) || newEdges.some(e => e.id === edgeId)) {
        // Edge exists or will exist — still add if node is new
      } else {
        newEdges.push({ id: edgeId, source: filePath, target: nodeId, kind: 'imports' })
      }

      // Add black-box node if not yet known
      if (!existingNodes[nodeId] && !newNodes.find(n => n.id === nodeId)) {
        if (!capReached) {
          const depDir = nodeId.substring(0, nodeId.lastIndexOf('/'))
          const depCenter = clusterCenter(depDir, allDirs)
          const depPos = scatterPos(depCenter.x, depCenter.y)
          newNodes.push({
            id: nodeId,
            kind: 'file',
            label: nodeId.split('/').pop() ?? nodeId,
            filePath: nodeId,
            dir: depDir,
            isBlackBox: true,
            isExternal: false,
            symbols: [],
            x: depPos.x,
            y: depPos.y,
          })
          capReached = totalVisible + newNodes.length > NODE_CAP
        }
      }
    } else {
      // npm package
      const pkgId = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0]
      const edgeId = `${filePath}→${pkgId}`

      if (!existingEdges.some(e => e.id === edgeId) && !newEdges.some(e => e.id === edgeId)) {
        newEdges.push({ id: edgeId, source: filePath, target: pkgId, kind: 'imports' })
      }

      if (!existingNodes[pkgId] && !newNodes.find(n => n.id === pkgId)) {
        if (!capReached && !existingData.showExternals === false) {
          // Always create external nodes, they're just hidden when showExternals=false
          newNodes.push({
            id: pkgId,
            kind: 'external',
            label: pkgId,
            filePath: '',
            dir: '__external__',
            isBlackBox: true,
            isExternal: true,
            symbols: [],
            x: (Math.random() - 0.5) * 600,
            y: (Math.random() - 0.5) * 600,
          })
        }
      }
    }
  }

  return { newNodes, newEdges }
}
