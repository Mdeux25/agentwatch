import { create } from 'zustand'
import type {
  ClaudeEvent,
  AvatarState,
  EmotionType,
  QuadNode,
  AgentSphere,
  ToolInputWithPath,
} from '../types/events'
import type { UsageRecord } from '../types/usage'
import {
  ROOT_ID,
  ROOT_BOUNDS,
  recomputeDescendants,
  getRelativeSegments,
  findCommonAncestor,
} from '../lib/quadTree'

// ─── Agent colours ───────────────────────────────────────────────────────────

const AGENT_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
]

// ─── Tools that expose a file_path ───────────────────────────────────────────

const FILE_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']

// ─── Avatar state helpers ─────────────────────────────────────────────────────

function eventToAvatarState(event: ClaudeEvent): AvatarState {
  switch (event.type) {
    case 'tool_use': return 'working'
    case 'thinking': return 'thinking'
    case 'assistant_message': return 'speaking'
    case 'result': return 'success'
    case 'error': return 'error'
    default: return 'idle'
  }
}

function eventToEmotion(event: ClaudeEvent): EmotionType {
  switch (event.type) {
    case 'tool_use': return 'focused'
    case 'thinking': return 'focused'
    case 'assistant_message': return 'confident'
    case 'result': return 'happy'
    case 'error': return 'concerned'
    default: return 'neutral'
  }
}

// ─── QuadTree update ──────────────────────────────────────────────────────────

function processQuadTree(
  filePath: string,
  sphereSessionId: string,
  currentNodes: Record<string, QuadNode>,
  currentRoot: string | null,
  currentSpheres: Record<string, AgentSphere>,
): {
  quadNodes: Record<string, QuadNode>
  projectRoot: string
  agentSpheres: Record<string, AgentSphere>
} | null {
  // Resolve project root (common ancestor of all seen files)
  const fileParent = filePath.substring(0, filePath.lastIndexOf('/'))
  let root: string
  if (!currentRoot) {
    root = fileParent
  } else if (filePath.startsWith(currentRoot + '/')) {
    root = currentRoot
  } else {
    root = findCommonAncestor(currentRoot, fileParent)
  }
  if (!root) return null

  const segments = getRelativeSegments(filePath, root)
  if (segments.length === 0) return null

  const now = Date.now()
  let nodes: Record<string, QuadNode> = { ...currentNodes }

  // Ensure virtual root node exists
  if (!nodes[ROOT_ID]) {
    nodes[ROOT_ID] = {
      id: ROOT_ID,
      name: root.split('/').pop() ?? 'project',
      kind: 'directory',
      depth: -1,
      bounds: ROOT_BOUNDS,
      parentId: null,
      childIds: [],
      accessCount: 0,
      lastAccessedAt: 0,
      ext: '',
    }
  }

  let parentId = ROOT_ID

  for (let i = 0; i < segments.length; i++) {
    const name = segments[i]
    const isFile = i === segments.length - 1 && name.includes('.')
    const segPath = root + '/' + segments.slice(0, i + 1).join('/')
    const ext = isFile ? name.split('.').pop()!.toLowerCase() : ''

    if (!nodes[segPath]) {
      // ── New node: append to parent, recompute all siblings' bounds ──
      const parent = nodes[parentId]
      const newChildIds = [...(parent?.childIds ?? []), segPath]

      // Placeholder bounds (will be recomputed below)
      nodes[segPath] = {
        id: segPath,
        name,
        kind: isFile ? 'file' : 'directory',
        depth: i,
        bounds: { x: 0, z: 0, w: 1, h: 1 },
        parentId,
        childIds: [],
        accessCount: 1,
        lastAccessedAt: now,
        ext,
      }

      if (nodes[parentId]) {
        const updatedParent = { ...nodes[parentId], childIds: newChildIds }
        nodes[parentId] = updatedParent
        // Recompute bounds for all siblings (and their descendants)
        const recomputed = recomputeDescendants(updatedParent, nodes)
        nodes = { ...nodes, ...recomputed }
      }
    } else {
      // ── Existing node: just update access counters ──
      nodes[segPath] = {
        ...nodes[segPath],
        accessCount: nodes[segPath].accessCount + 1,
        lastAccessedAt: now,
      }
    }

    parentId = segPath
  }

  // ── Update agent sphere ──────────────────────────────────────────────────
  const spheres = { ...currentSpheres }
  if (!spheres[sphereSessionId]) {
    const colorIndex = Object.keys(spheres).length % AGENT_COLORS.length
    spheres[sphereSessionId] = {
      sessionId: sphereSessionId,
      color: AGENT_COLORS[colorIndex],
      activeFileId: filePath,
      jumpTrigger: 0,
    }
  } else {
    spheres[sphereSessionId] = {
      ...spheres[sphereSessionId],
      activeFileId: filePath,
      jumpTrigger: spheres[sphereSessionId].jumpTrigger + 1,
    }
  }

  return { quadNodes: nodes, projectRoot: root, agentSpheres: spheres }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AppStore {
  // ── Chat ──
  events: ClaudeEvent[]
  sessionId: string | null
  isProcessing: boolean
  avatarState: AvatarState
  emotion: EmotionType
  addEvent: (event: ClaudeEvent) => void
  setSessionId: (id: string | null) => void
  setProcessing: (processing: boolean) => void
  setAvatarState: (state: AvatarState) => void
  clearSession: () => void
  // ── Scene ──
  quadNodes: Record<string, QuadNode>
  projectRoot: string | null
  agentSpheres: Record<string, AgentSphere>
  activeFileId: string | null       // most recently touched file (for preview)
  activeFilePreview: string | null
  sceneVisible: boolean
  sceneMode: 'treemap' | 'tree'
  toggleScene: () => void
  toggleSceneMode: () => void
  resetScene: () => void
  setActiveFileId: (id: string | null) => void
  setActiveFilePreview: (preview: string | null) => void
  activeFileContent: string | null
  setActiveFileContent: (content: string | null) => void
  loadPaths: (paths: string[]) => void
  // ── Viz filters ──
  vizOptions: { showFolders: boolean; showMisc: boolean; showSubmodules: boolean }
  setVizOption: (key: keyof AppStore['vizOptions'], value: boolean) => void
  // ── Label scale (font size multiplier for scene file labels) ──
  labelScale: number
  setLabelScale: (scale: number) => void
  // ── Scan options ──
  useGitignore: boolean
  setUseGitignore: (v: boolean) => void
  // ── Search ──
  searchQuery: string
  setSearchQuery: (q: string) => void
  // ── Chat context injection ──
  chatContext: string | null
  setChatContext: (ctx: string | null) => void
  // ── Usage tracking ──
  sessionUsageRecords: UsageRecord[]
  addSessionUsageRecord: (record: UsageRecord) => void
  usagePanelOpen: boolean
  toggleUsagePanel: () => void
}

const SCENE_INITIAL = {
  quadNodes: {} as Record<string, QuadNode>,
  projectRoot: null as string | null,
  agentSpheres: {} as Record<string, AgentSphere>,
  activeFileId: null as string | null,
  activeFilePreview: null as string | null,
  activeFileContent: null as string | null,
  sceneVisible: true,
  sceneMode: 'treemap' as 'treemap' | 'tree',
  vizOptions: { showFolders: true, showMisc: true, showSubmodules: true },
  labelScale: 1.0,
  useGitignore: true,
}

export const useStore = create<AppStore>((set) => ({
  events: [],
  sessionId: null,
  isProcessing: false,
  avatarState: 'idle',
  emotion: 'neutral',
  chatContext: null,
  searchQuery: '',
  sessionUsageRecords: [],
  usagePanelOpen: false,
  ...SCENE_INITIAL,

  addEvent: (event) =>
    set((state) => {
      const base = {
        events: [...state.events, event],
        avatarState: eventToAvatarState(event),
        emotion: eventToEmotion(event),
      }

      if (event.type !== 'tool_use') return base

      const toolName = event.message ?? ''
      const data = event.data
      if (!data || typeof data !== 'object') return base

      const sphereId = event.session_id ?? state.sessionId ?? 'default'

      // File-path tools (Read, Write, Edit, …) — track exact file
      if (FILE_TOOLS.includes(toolName)) {
        const input = data as ToolInputWithPath
        const filePath = typeof input.file_path === 'string' ? input.file_path : null
        if (!filePath) return base
        const sceneUpdate = processQuadTree(
          filePath,
          sphereId,
          state.quadNodes,
          state.projectRoot,
          state.agentSpheres,
        )
        return { ...base, ...(sceneUpdate ?? {}), activeFileId: filePath }
      }

      // Directory-hint tools (Glob, Grep, Bash) — track the search root
      if (toolName === 'Glob' || toolName === 'Grep' || toolName === 'Bash') {
        const input = data as { path?: string; pattern?: string; command?: string }
        // Prefer explicit path; for Glob fall back to pattern dirname; skip Bash (no reliable path)
        let scanPath: string | null = typeof input.path === 'string' ? input.path : null
        if (!scanPath && toolName === 'Glob' && typeof input.pattern === 'string') {
          const p = input.pattern
          const slash = p.lastIndexOf('/')
          if (slash > 0) scanPath = p.slice(0, slash)
        }
        if (!scanPath) return base
        const sceneUpdate = processQuadTree(
          scanPath,
          sphereId,
          state.quadNodes,
          state.projectRoot,
          state.agentSpheres,
        )
        if (!sceneUpdate) return base
        return { ...base, ...sceneUpdate, activeFileId: scanPath }
      }

      return base
    }),

  setSessionId: (id) => set({ sessionId: id }),

  setProcessing: (processing) =>
    set({ isProcessing: processing, avatarState: processing ? 'thinking' : 'idle' }),

  setAvatarState: (avatarState) => set({ avatarState }),

  toggleScene: () => set((state) => ({ sceneVisible: !state.sceneVisible })),

  toggleSceneMode: () => set((state) => ({
    sceneMode: state.sceneMode === 'treemap' ? 'tree' : 'treemap',
  })),

  setVizOption: (key, value) =>
    set((state) => ({ vizOptions: { ...state.vizOptions, [key]: value } })),

  setLabelScale: (scale) => set({ labelScale: Math.max(0.5, Math.min(3.0, scale)) }),

  setUseGitignore: (v) => set({ useGitignore: v }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  resetScene: () => set({
    quadNodes: {} as Record<string, QuadNode>,
    projectRoot: null,
    agentSpheres: {} as Record<string, AgentSphere>,
    activeFileId: null,
    activeFilePreview: null,
    activeFileContent: null,
  }),

  setActiveFileId: (id) => set({ activeFileId: id }),

  setActiveFilePreview: (preview) => set({ activeFilePreview: preview }),

  setActiveFileContent: (content) => set({ activeFileContent: content }),

  setChatContext: (ctx) => set({ chatContext: ctx }),

  addSessionUsageRecord: (record) =>
    set((state) => ({ sessionUsageRecords: [...state.sessionUsageRecords, record] })),

  toggleUsagePanel: () => set((state) => ({ usagePanelOpen: !state.usagePanelOpen })),

  loadPaths: (paths) =>
    set((state) => {
      let nodes = state.quadNodes
      let root = state.projectRoot
      // Process each file path through the quad tree (no sphere updates for scan)
      for (const filePath of paths) {
        const result = processQuadTree(filePath, '__scan__', nodes, root, state.agentSpheres)
        if (result) {
          nodes = result.quadNodes
          root = result.projectRoot
        }
      }
      return { quadNodes: nodes, projectRoot: root }
    }),

  clearSession: () =>
    set({
      events: [],
      sessionId: null,
      isProcessing: false,
      avatarState: 'idle',
      emotion: 'neutral',
      sessionUsageRecords: [],
      ...SCENE_INITIAL,
    }),
}))
