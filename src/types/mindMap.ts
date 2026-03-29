import type { FileSymbol } from './events'

export interface PseudoLine {
  t: 'comment' | 'keyword' | 'assign' | 'call' | 'arrow' | 'param'
  l: string
}

export interface MapNode {
  id: string            // filePath for file nodes, package name for externals
  kind: 'file' | 'external'
  label: string         // display name (filename or npm package)
  filePath: string
  dir: string           // parent directory — used for cluster grouping
  isBlackBox: boolean   // not yet explored — grayed out
  isExternal: boolean   // npm package — hidden by default
  symbols: (FileSymbol & { pseudo?: PseudoLine[] })[]
  x: number             // force layout position (saved)
  y: number
}

export interface MapEdge {
  id: string
  source: string        // node id
  target: string        // node id
  kind: 'imports'
}

export interface MindMapData {
  nodes: Record<string, MapNode>
  edges: MapEdge[]
  showExternals: boolean
}
