import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { runClaudePrompt } from '../../lib/tauri'
import type { MindMapData, MapNode } from '../../types/mindMap'

interface Props {
  data: MindMapData
  projectRoot: string | null
  onAnalyzeFolder?: () => void
  folderScanning?: boolean
  scanProgress?: { done: number; total: number } | null
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArchLayer {
  name: string
  role: string
  files: string[]
  filePaths: string[]
  health: 'good' | 'warning' | 'critical'
  note: string
}

interface ArchInsight {
  type: 'praise' | 'warning' | 'issue'
  title: string
  body: string
}

interface LocalAnalysis {
  stack: string[]
  layers: ArchLayer[]
}

interface GlobalEnrichment {
  patterns: string[]
  insights: ArchInsight[]
  summary: string
  layerHealth: Record<string, { health: ArchLayer['health']; note: string }>
}

interface LayerAnalysis {
  summary: string
  patterns: string[]
  insights: ArchInsight[]
  health: ArchLayer['health']
  note: string
}

type LayerState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: LayerAnalysis }
  | { status: 'error'; message: string }

// ── Cache ─────────────────────────────────────────────────────────────────────

function globalCacheKey(root: string) { return `aw:arch:global:${root}` }
function layerCacheKey(root: string, layer: string) { return `aw:arch:layer:${root}:${layer}` }
function loadJson<T>(key: string): T | null {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null } catch { return null }
}
function saveJson(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}

// ── GitHub-style dark theme tokens ────────────────────────────────────────────
// https://primer.style/foundations/color

const GH = {
  // Backgrounds
  canvasBg:   '#0d1117',
  surfaceBg:  '#161b22',
  surface2:   '#1c2128',
  overlay:    '#21262d',

  // Borders
  border:     '#30363d',
  borderMuted:'#21262d',

  // Foreground
  fgDefault:  '#e6edf3',
  fgMuted:    '#8b949e',
  fgSubtle:   '#6e7681',
  fgOnEmphasis: '#ffffff',

  // Accent
  accentFg:   '#58a6ff',
  accentSubtle:'rgba(56,139,253,0.15)',
  accentEmphasis: '#1f6feb',

  // Success (green)
  successFg:  '#3fb950',
  successSubtle: 'rgba(46,160,67,0.15)',
  successEmphasis: '#238636',

  // Attention (yellow)
  attentionFg: '#d29922',
  attentionSubtle: 'rgba(187,128,9,0.15)',
  attentionEmphasis: '#9e6a03',

  // Danger (red)
  dangerFg:   '#f85149',
  dangerSubtle: 'rgba(248,81,73,0.15)',
  dangerEmphasis: '#da3633',

  // Done (purple)
  doneFg:     '#bc8cff',
  doneSubtle: 'rgba(163,113,247,0.15)',

  // Sponsors (pink)
  sponsorFg:  '#db61a2',

  // Neutral
  neutralSubtle: 'rgba(110,118,129,0.1)',
  neutralEmphasis: '#6e7681',
}

// Fonts
const FONT_UI   = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif'
const FONT_MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

// ── Tech stack colours (GitHub-toned) ────────────────────────────────────────

const TECH_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  React:      { bg: 'rgba(56,139,253,0.1)',  text: '#58a6ff', border: 'rgba(56,139,253,0.3)'  },
  TypeScript: { bg: 'rgba(163,113,247,0.1)', text: '#bc8cff', border: 'rgba(163,113,247,0.3)' },
  JavaScript: { bg: 'rgba(210,153,34,0.1)',  text: '#d29922', border: 'rgba(210,153,34,0.3)'  },
  Rust:       { bg: 'rgba(248,81,73,0.1)',   text: '#f85149', border: 'rgba(248,81,73,0.3)'   },
  Tauri:      { bg: 'rgba(63,185,80,0.1)',   text: '#3fb950', border: 'rgba(63,185,80,0.3)'   },
  Python:     { bg: 'rgba(210,153,34,0.1)',  text: '#d29922', border: 'rgba(210,153,34,0.3)'  },
  Go:         { bg: 'rgba(56,139,253,0.1)',  text: '#79c0ff', border: 'rgba(56,139,253,0.25)' },
  Vue:        { bg: 'rgba(63,185,80,0.1)',   text: '#3fb950', border: 'rgba(63,185,80,0.3)'   },
  Svelte:     { bg: 'rgba(248,81,73,0.1)',   text: '#ffa198', border: 'rgba(248,81,73,0.25)'  },
  Next:       { bg: GH.neutralSubtle,        text: GH.fgMuted, border: GH.border              },
  Vite:       { bg: 'rgba(163,113,247,0.1)', text: '#d2a8ff', border: 'rgba(163,113,247,0.3)' },
  Zustand:    { bg: 'rgba(210,153,34,0.1)',  text: '#e3b341', border: 'rgba(210,153,34,0.3)'  },
  Zod:        { bg: 'rgba(56,139,253,0.1)',  text: '#58a6ff', border: 'rgba(56,139,253,0.3)'  },
  Prisma:     { bg: 'rgba(63,185,80,0.1)',   text: '#56d364', border: 'rgba(63,185,80,0.3)'   },
  GraphQL:    { bg: 'rgba(219,97,162,0.1)',  text: '#db61a2', border: 'rgba(219,97,162,0.3)'  },
  Redux:      { bg: 'rgba(163,113,247,0.1)', text: '#bc8cff', border: 'rgba(163,113,247,0.3)' },
  Framer:     { bg: 'rgba(219,97,162,0.1)',  text: '#f778ba', border: 'rgba(219,97,162,0.3)'  },
  Tailwind:   { bg: 'rgba(56,139,253,0.1)',  text: '#79c0ff', border: 'rgba(56,139,253,0.25)' },
  CSS:        { bg: 'rgba(56,139,253,0.1)',  text: '#58a6ff', border: 'rgba(56,139,253,0.3)'  },
  SCSS:       { bg: 'rgba(219,97,162,0.1)',  text: '#f778ba', border: 'rgba(219,97,162,0.3)'  },
  Node:       { bg: 'rgba(63,185,80,0.1)',   text: '#56d364', border: 'rgba(63,185,80,0.3)'   },
  Express:    { bg: GH.neutralSubtle,        text: GH.fgMuted, border: GH.border              },
}

function techColor(name: string) {
  const key = Object.keys(TECH_COLORS).find(k => name.toLowerCase().includes(k.toLowerCase()))
  return key ? TECH_COLORS[key] : { bg: GH.neutralSubtle, text: GH.fgMuted, border: GH.border }
}

// ── Health config ─────────────────────────────────────────────────────────────

const HEALTH = {
  good:     { fg: GH.successFg,    subtle: GH.successSubtle,    label: 'healthy',  icon: '●' },
  warning:  { fg: GH.attentionFg,  subtle: GH.attentionSubtle,  label: 'review',   icon: '●' },
  critical: { fg: GH.dangerFg,     subtle: GH.dangerSubtle,     label: 'critical', icon: '●' },
}

const INSIGHT = {
  praise:  { fg: GH.successFg,   subtle: GH.successSubtle,   border: GH.successEmphasis,   icon: '✓' },
  warning: { fg: GH.attentionFg, subtle: GH.attentionSubtle, border: GH.attentionEmphasis, icon: '!' },
  issue:   { fg: GH.dangerFg,    subtle: GH.dangerSubtle,    border: GH.dangerEmphasis,    icon: '×' },
}

// ── Layer detection ───────────────────────────────────────────────────────────

const LAYER_PATTERNS: [string[], string][] = [
  [['component', 'view', 'page', 'screen', 'widget', 'panel', 'ui'],  'UI Layer'],
  [['store', 'state', 'redux', 'context', 'atom', 'slice'],           'State'],
  [['service', 'api', 'client', 'network', 'fetch', 'request'],       'Services'],
  [['lib', 'util', 'helper', 'common', 'shared', 'core'],             'Logic'],
  [['hook'],                                                            'Hooks'],
  [['type', 'interface', 'model', 'schema', 'dto'],                   'Types'],
  [['route', 'router', 'navigation', 'nav'],                          'Routing'],
  [['controller', 'handler', 'resolver'],                             'Controllers'],
  [['middleware', 'guard', 'interceptor'],                             'Middleware'],
  [['test', '__test__', 'spec', '__mock__'],                           'Tests'],
  [['db', 'database', 'repository', 'dao', 'prisma', 'mongo'],        'Data Layer'],
]

const LAYER_ROLES: Record<string, string> = {
  'UI Layer':    'Visual components and user interface elements',
  'State':       'Application state management and data stores',
  'Services':    'API clients, data fetching, and external integrations',
  'Logic':       'Shared utilities, helpers, and core business logic',
  'Hooks':       'Reusable React hooks and custom state logic',
  'Types':       'TypeScript interfaces, types, and data models',
  'Routing':     'Navigation and route configuration',
  'Controllers': 'Request handlers and business logic controllers',
  'Middleware':  'Cross-cutting concerns and request pipeline',
  'Tests':       'Test suites and test utilities',
  'Data Layer':  'Database models, repositories, and data access',
}

const PKG_TO_TECH: [string, string][] = [
  ['@tauri-apps', 'Tauri'], ['tauri', 'Tauri'],
  ['react', 'React'], ['next', 'Next'],
  ['vue', 'Vue'], ['svelte', 'Svelte'],
  ['zustand', 'Zustand'], ['redux', 'Redux'],
  ['framer-motion', 'Framer'], ['zod', 'Zod'],
  ['prisma', 'Prisma'], ['graphql', 'GraphQL'],
  ['tailwind', 'Tailwind'], ['vite', 'Vite'],
  ['express', 'Express'], ['axios', 'Axios'],
]

function detectLayer(dir: string, projectRoot: string | null): string {
  const rel = (projectRoot && dir.startsWith(projectRoot)
    ? dir.slice(projectRoot.length + 1) : dir).toLowerCase()
  const parts = rel.split('/')
  for (const part of parts)
    for (const [patterns, label] of LAYER_PATTERNS)
      if (patterns.some(p => part.includes(p))) return label
  return parts.filter(p => p && p !== 'src').pop() ?? 'Core'
}

// ── Phase 1: instant local analysis ──────────────────────────────────────────

function computeLocal(data: MindMapData, projectRoot: string | null): LocalAnalysis {
  const explored = Object.values(data.nodes).filter(n => !n.isBlackBox && !n.isExternal)
  const externals = Object.values(data.nodes).filter(n => n.isExternal)

  const stackSet = new Set<string>()
  const exts = new Set(explored.map(n => n.filePath.split('.').pop()?.toLowerCase() ?? ''))
  if (exts.has('tsx') || exts.has('jsx')) stackSet.add('React')
  if (exts.has('ts') || exts.has('tsx'))  stackSet.add('TypeScript')
  else if (exts.has('js') || exts.has('jsx')) stackSet.add('JavaScript')
  if (exts.has('rs'))     stackSet.add('Rust')
  if (exts.has('py'))     stackSet.add('Python')
  if (exts.has('go'))     stackSet.add('Go')
  if (exts.has('vue'))  { stackSet.add('Vue'); stackSet.add('TypeScript') }
  if (exts.has('svelte')) stackSet.add('Svelte')
  if (exts.has('css'))    stackSet.add('CSS')
  if (exts.has('scss'))   stackSet.add('SCSS')

  const pkgNames = externals.map(n => n.label.toLowerCase())
  for (const [pkg, tech] of PKG_TO_TECH)
    if (pkgNames.some(p => p.includes(pkg))) stackSet.add(tech)

  const byLayer = new Map<string, MapNode[]>()
  for (const n of explored) {
    const layer = detectLayer(n.dir, projectRoot)
    const arr = byLayer.get(layer) ?? []
    arr.push(n)
    byLayer.set(layer, arr)
  }

  const layers: ArchLayer[] = Array.from(byLayer.entries()).map(([name, nodes]) => ({
    name,
    role: LAYER_ROLES[name] ?? 'Application layer',
    files: nodes.map(n => n.filePath.split('/').pop() ?? n.filePath).slice(0, 12),
    filePaths: nodes.map(n => n.filePath),
    health: 'good' as const,
    note: '',
  }))

  return { stack: [...stackSet], layers }
}

// ── Context-full detection & retry helpers ────────────────────────────────────

function isContextFull(err: string): boolean {
  const s = err.toLowerCase()
  return (
    s.includes('context') || s.includes('token') || s.includes('too long') ||
    s.includes('too large') || s.includes('length') || s.includes('exceed') ||
    s.includes('maximum') || s.includes('prompt is too') || s.includes('content is too') ||
    s.includes('input is too') || s.includes('limit') || s.includes('capacity')
  )
}

function parseJson(raw: string) {
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
}

// ── Prompts with truncation levels ───────────────────────────────────────────
// level 0 = full, 1 = trimmed, 2 = compact (no functions), 3 = minimal (names only)

function buildGlobalPrompt(local: LocalAnalysis, data: MindMapData, projectRoot: string | null, level = 0): string {
  const projectName = projectRoot?.split('/').pop() ?? 'Project'
  const explored = Object.values(data.nodes).filter(n => !n.isBlackBox && !n.isExternal)

  // Progressive file cap per level
  const fileCaps = [60, 30, 15, 0]
  const edgeCaps = [25, 15,  8, 0]
  const filesCap = fileCaps[level] ?? 0
  const edgesCap = edgeCaps[level] ?? 0

  const layerSummary = local.layers.map(l => {
    const shown = filesCap > 0 ? l.files.slice(0, Math.max(2, Math.floor(filesCap / local.layers.length))).join(', ') : ''
    return shown ? `${l.name} (${l.files.length} files): ${shown}` : `${l.name}: ${l.files.length} files`
  }).join('\n')

  const edgeSample = edgesCap > 0
    ? data.edges.slice(0, edgesCap).map(e => {
        const src = explored.find(n => n.id === e.source)?.filePath.split('/').pop() ?? ''
        const tgt = explored.find(n => n.id === e.target)?.filePath.split('/').pop() ?? ''
        return src && tgt ? `${src} → ${tgt}` : null
      }).filter(Boolean).join('\n')
    : 'omitted'

  return `Senior software architect. Respond ONLY with valid JSON, no markdown.

Project: ${projectName} | Stack: ${local.stack.join(', ')}

Layers:\n${layerSummary}

Import sample:\n${edgeSample}

JSON:
{
  "patterns": ["Pattern1"],
  "summary": "2-3 sentence executive summary",
  "layerHealth": { "LayerName": { "health": "good|warning|critical", "note": "one-line observation" } },
  "insights": [{ "type": "praise|warning|issue", "title": "title", "body": "2 sentences" }]
}
3-5 insights. No filler.`
}

function buildLayerPrompt(layer: ArchLayer, data: MindMapData, projectRoot: string | null, level = 0): string {
  const explored = Object.values(data.nodes).filter(n => !n.isBlackBox && !n.isExternal)
  const layerNodes = explored.filter(n => layer.filePaths.includes(n.filePath))
  const projectName = projectRoot?.split('/').pop() ?? 'Project'

  // level 0: full (functions + edges), 1: no functions, 2: filenames only, 3: minimal
  const includeFunctions = level === 0
  const edgeCap = [15, 10, 5, 0][level] ?? 0

  const fileDetails = level < 3
    ? layerNodes.map(n => {
        const rel = projectRoot ? n.filePath.slice(projectRoot.length + 1) : n.filePath
        if (includeFunctions) {
          const fns = n.symbols.filter(s => s.kind === 'function').slice(0, 6).map(s => s.name)
          return `${rel}${fns.length ? ` [${fns.join(', ')}]` : ''}`
        }
        return rel
      }).join('\n')
    : `${layerNodes.length} files in ${layer.name}`

  const layerIds = new Set(layerNodes.map(n => n.id))
  const allExplored = new Set(explored.map(n => n.id))
  const internalEdges = edgeCap > 0
    ? data.edges.filter(e => layerIds.has(e.source) && layerIds.has(e.target)).slice(0, edgeCap)
        .map(e => `${e.source.split('/').pop()} → ${e.target.split('/').pop()}`)
    : []
  const externalDeps = edgeCap > 0
    ? data.edges.filter(e => layerIds.has(e.source) && !layerIds.has(e.target) && allExplored.has(e.target)).slice(0, Math.floor(edgeCap / 2))
        .map(e => `→ ${e.target.split('/').pop()}`)
    : []

  return `Senior software architect. Respond ONLY with valid JSON, no markdown.

Project: ${projectName} | Layer: "${layer.name}" — ${layer.role}

Files:\n${fileDetails || '(none)'}
${internalEdges.length ? `Internal deps:\n${internalEdges.join('\n')}` : ''}
${externalDeps.length ? `External deps:\n${externalDeps.join('\n')}` : ''}

JSON:
{
  "health": "good|warning|critical",
  "note": "one-line health observation",
  "summary": "2-3 sentences about structure and quality",
  "patterns": ["Pattern1"],
  "insights": [{ "type": "praise|warning|issue", "title": "title", "body": "2 sentences" }]
}
3-4 insights. Be direct.`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ArchPanel({ data, projectRoot, onAnalyzeFolder, folderScanning, scanProgress }: Props) {
  const [local, setLocal]               = useState<LocalAnalysis | null>(null)
  const [global, setGlobal]             = useState<GlobalEnrichment | null>(null)
  const [globalLoading, setGlobalLoading] = useState(false)
  const [globalError, setGlobalError]   = useState<string | null>(null)
  const [trimStatus, setTrimStatus]     = useState<string | null>(null)   // shown while auto-retrying
  const [layerStates, setLayerStates]   = useState<Record<string, LayerState>>({})
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const globalRunKey = useRef<string>('')

  const exploredCount = useMemo(
    () => Object.values(data.nodes).filter(n => !n.isBlackBox && !n.isExternal).length,
    [data.nodes]
  )

  useEffect(() => {
    if (exploredCount < 3) { setLocal(null); return }
    setLocal(computeLocal(data, projectRoot))
  }, [exploredCount, projectRoot]) // eslint-disable-line react-hooks/exhaustive-deps

  const runGlobal = useCallback(async (loc: LocalAnalysis) => {
    if (!projectRoot) return
    setGlobalLoading(true); setGlobalError(null); setTrimStatus(null)
    const LEVELS = [0, 1, 2, 3]
    let lastErr = ''
    for (const level of LEVELS) {
      if (level > 0) setTrimStatus(`context too large — retrying (level ${level}/3)…`)
      try {
        const raw = await runClaudePrompt(buildGlobalPrompt(loc, data, projectRoot, level))
        const parsed = parseJson(raw)
        const enrichment: GlobalEnrichment = {
          patterns:    parsed.patterns    ?? [],
          insights:    parsed.insights    ?? [],
          summary:     parsed.summary     ?? '',
          layerHealth: parsed.layerHealth ?? {},
        }
        setGlobal(enrichment)
        setTrimStatus(null)
        saveJson(globalCacheKey(projectRoot), { ...enrichment, exploredCount, ts: Date.now() })
        setGlobalLoading(false)
        return
      } catch (e) {
        lastErr = String(e)
        if (!isContextFull(lastErr)) break   // non-context error — don't retry
      }
    }
    setGlobalError(lastErr); setTrimStatus(null); setGlobalLoading(false)
  }, [data, projectRoot, exploredCount])

  useEffect(() => {
    if (!local || !projectRoot || exploredCount < 3) return
    const cached = loadJson<GlobalEnrichment & { exploredCount: number }>(globalCacheKey(projectRoot))
    if (cached && Math.abs((cached.exploredCount ?? 0) - exploredCount) <= 5) {
      setGlobal({ patterns: cached.patterns, insights: cached.insights, summary: cached.summary, layerHealth: cached.layerHealth })
      return
    }
    const key = `${projectRoot}:${exploredCount}`
    if (globalRunKey.current === key) return
    globalRunKey.current = key
    runGlobal(local)
  }, [local, projectRoot, exploredCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const runLayerAnalysis = useCallback(async (layer: ArchLayer) => {
    if (!projectRoot) return
    const hit = loadJson<LayerAnalysis>(layerCacheKey(projectRoot, layer.name))
    if (hit) { setLayerStates(s => ({ ...s, [layer.name]: { status: 'done', result: hit } })); return }
    setLayerStates(s => ({ ...s, [layer.name]: { status: 'loading' } }))
    const LEVELS = [0, 1, 2, 3]
    let lastErr = ''
    for (const level of LEVELS) {
      try {
        const raw = await runClaudePrompt(buildLayerPrompt(layer, data, projectRoot, level))
        const parsed = parseJson(raw)
        const result: LayerAnalysis = {
          health: parsed.health ?? 'good', note: parsed.note ?? '',
          summary: parsed.summary ?? '', patterns: parsed.patterns ?? [], insights: parsed.insights ?? [],
        }
        setLayerStates(s => ({ ...s, [layer.name]: { status: 'done', result } }))
        saveJson(layerCacheKey(projectRoot, layer.name), result)
        return
      } catch (e) {
        lastErr = String(e)
        if (!isContextFull(lastErr)) break
        // Update loading message to show trimming
        setLayerStates(s => ({ ...s, [layer.name]: { status: 'loading' } }))
      }
    }
    setLayerStates(s => ({ ...s, [layer.name]: { status: 'error', message: lastErr } }))
  }, [data, projectRoot])

  const handleLayerClick = useCallback((layer: ArchLayer) => {
    if (selectedLayer === layer.name) { setSelectedLayer(null); return }
    setSelectedLayer(layer.name)
    const s = layerStates[layer.name]
    if (!s || s.status === 'idle') runLayerAnalysis(layer)
  }, [selectedLayer, layerStates, runLayerAnalysis])

  const mergedLayers: ArchLayer[] = useMemo(() => {
    if (!local) return []
    return local.layers.map(l => {
      const h = global?.layerHealth?.[l.name]
      const ls = layerStates[l.name]
      const lr = ls?.status === 'done' ? ls.result : null
      return { ...l, health: lr?.health ?? h?.health ?? l.health, note: lr?.note ?? h?.note ?? l.note }
    })
  }, [local, global, layerStates])

  const activeMergedLayer = selectedLayer ? mergedLayers.find(l => l.name === selectedLayer) ?? null : null
  const activeLayerState  = selectedLayer ? layerStates[selectedLayer] : undefined

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (exploredCount < 3 && !folderScanning) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: GH.canvasBg, fontFamily: FONT_UI }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: GH.surfaceBg, border: `1px solid ${GH.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: GH.fgSubtle }}>⬡</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: GH.fgDefault, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Architecture Intelligence</div>
          <div style={{ color: GH.fgMuted, fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>Scan your project and let Claude analyze the architecture, tech stack, patterns, and health.</div>
        </div>
        {onAnalyzeFolder && (
          <button onClick={onAnalyzeFolder} style={{ padding: '6px 16px', background: GH.successEmphasis, border: `1px solid ${GH.successFg}33`, borderRadius: 6, cursor: 'pointer', color: GH.fgOnEmphasis, fontSize: 13, fontFamily: FONT_UI, fontWeight: 500 }}>
            Analyze Architecture
          </button>
        )}
        <div style={{ color: GH.fgSubtle, fontSize: 12 }}>or open files manually in the explorer</div>
      </div>
    )
  }

  if (folderScanning && exploredCount < 3) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, background: GH.canvasBg, fontFamily: FONT_UI }}>
        <div style={{ color: GH.fgDefault, fontSize: 14, fontWeight: 600 }}>Reading project files…</div>
        {scanProgress && <GHProgressBar done={scanProgress.done} total={scanProgress.total} />}
        <div style={{ color: GH.fgSubtle, fontSize: 12 }}>Architecture view will appear once enough files are scanned</div>
      </div>
    )
  }

  if (!local) return null

  const pct = scanProgress ? Math.round(scanProgress.done / scanProgress.total * 100) : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: GH.canvasBg, fontFamily: FONT_UI }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${GH.border}`, background: GH.surfaceBg, flexShrink: 0 }}>
        <span style={{ color: GH.fgDefault, fontSize: 13, fontWeight: 600 }}>Architecture</span>
        <span style={{ color: GH.fgSubtle, fontSize: 12 }}>·</span>
        {pct !== null
          ? <span style={{ color: GH.accentFg, fontSize: 12 }}>Reading files {scanProgress!.done}/{scanProgress!.total}</span>
          : trimStatus
            ? <span style={{ color: GH.attentionFg, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Spinner color={GH.attentionFg} size={12} /> {trimStatus}</span>
            : globalLoading
              ? <span style={{ color: GH.fgMuted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Spinner color={GH.accentFg} size={12} /> Analyzing with Claude…</span>
              : global
                ? <span style={{ color: GH.successFg, fontSize: 12 }}>Analysis complete</span>
                : null}
        <span style={{ flex: 1 }} />
        <span style={{ color: GH.fgSubtle, fontSize: 12 }}>{exploredCount} files</span>
        <button
          onClick={() => { globalRunKey.current = ''; local && runGlobal(local) }}
          disabled={globalLoading || folderScanning}
          style={ghBtnStyle}
        >Re-analyze</button>
      </div>

      {/* Scan progress bar */}
      {pct !== null && (
        <div style={{ height: 3, background: GH.borderMuted, flexShrink: 0 }}>
          <div style={{ height: 3, width: `${pct}%`, background: GH.accentFg, transition: 'width .2s' }} />
        </div>
      )}
      {/* LLM sweep bar */}
      {globalLoading && pct === null && (
        <div style={{ height: 3, background: GH.borderMuted, flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ height: 3, width: '35%', background: `linear-gradient(90deg,transparent,${GH.accentFg},transparent)`, animation: 'archSweep 1.8s ease-in-out infinite' }} />
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: layer list */}
        <div style={{ width: 220, flexShrink: 0, overflowY: 'auto', borderRight: `1px solid ${GH.border}`, padding: '8px 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 12px 8px', fontSize: 11, fontWeight: 600, color: GH.fgSubtle, letterSpacing: '.04em', textTransform: 'uppercase' }}>Layers</div>

          {mergedLayers.map(layer => {
            const h = HEALTH[layer.health] ?? HEALTH.good
            const isSelected = selectedLayer === layer.name
            const ls = layerStates[layer.name]
            const isLayerLoading = ls?.status === 'loading'

            return (
              <button key={layer.name} onClick={() => handleLayerClick(layer)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', margin: '0 4px',
                background: isSelected ? GH.accentSubtle : 'transparent',
                border: `1px solid ${isSelected ? GH.accentEmphasis : 'transparent'}`,
                borderRadius: 6, cursor: 'pointer', textAlign: 'left', transition: 'background .1s, border-color .1s',
              }}>
                {/* health indicator */}
                <div style={{ flexShrink: 0, width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isLayerLoading
                    ? <Spinner color={GH.accentFg} size={11} />
                    : global
                      ? <span style={{ color: h.fg, fontSize: 8 }}>●</span>
                      : <span style={{ color: GH.fgSubtle, fontSize: 8, opacity: .4 }}>●</span>
                  }
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isSelected ? GH.accentFg : GH.fgDefault, fontSize: 13, fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {layer.name}
                  </div>
                  <div style={{ color: GH.fgSubtle, fontSize: 11, marginTop: 1 }}>{layer.files.length} files</div>
                </div>

                {global && (
                  <span style={{ flexShrink: 0, fontSize: 10, padding: '1px 6px', borderRadius: 100, background: h.subtle, color: h.fg, fontWeight: 500 }}>
                    {h.label}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* RIGHT: detail */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {selectedLayer && activeMergedLayer
            ? <LayerDetail layer={activeMergedLayer} state={activeLayerState ?? { status: 'idle' }} onRetry={() => runLayerAnalysis(activeMergedLayer)} onClose={() => setSelectedLayer(null)} />
            : <GlobalOverview local={local} global={global} globalError={globalError} onRetryGlobal={() => { globalRunKey.current = ''; local && runGlobal(local) }} />
          }
        </div>
      </div>
    </div>
  )
}

// ── Global overview ───────────────────────────────────────────────────────────

function GlobalOverview({ local, global: g, globalError, onRetryGlobal }: {
  local: LocalAnalysis
  global: GlobalEnrichment | null
  globalError: string | null
  onRetryGlobal: () => void
}) {
  return (
    <>
      {/* Summary */}
      {g?.summary
        ? <p style={{ margin: 0, color: GH.fgMuted, fontSize: 14, lineHeight: 1.7 }}>{g.summary}</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Shimmer width="75%" height={14} /><Shimmer width="52%" height={14} /></div>
      }

      {/* Tech stack */}
      {local.stack.length > 0 && (
        <Section title="Tech Stack">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {local.stack.map((tech, i) => {
              const c = techColor(tech)
              return <span key={i} style={{ padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>{tech}</span>
            })}
          </div>
        </Section>
      )}

      {/* Design patterns */}
      <Section title="Design Patterns">
        {g
          ? g.patterns.length > 0
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.patterns.map((p, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500, background: GH.doneSubtle, color: GH.doneFg, border: `1px solid ${GH.doneFg}33` }}>{p}</span>
                ))}
              </div>
            : <span style={{ color: GH.fgSubtle, fontSize: 13 }}>None detected</span>
          : <div style={{ display: 'flex', gap: 6 }}>{[80,100,70,90].map((w,i) => <Shimmer key={i} width={w} height={26} style={{ borderRadius: 100 }} />)}</div>
        }
      </Section>

      {/* Insights */}
      <Section title="Insights" subtitle="Select a layer for detailed insights">
        {g
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
            </div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3].map(i => <InsightShimmer key={i} />)}
            </div>
        }
      </Section>

      {globalError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, background: GH.dangerSubtle, border: `1px solid ${GH.dangerFg}33` }}>
          <span style={{ color: GH.dangerFg, fontSize: 13 }}>AI analysis failed</span>
          <button onClick={onRetryGlobal} style={{ ...ghBtnStyle, marginLeft: 'auto' }}>Retry</button>
        </div>
      )}
    </>
  )
}

// ── Layer detail ──────────────────────────────────────────────────────────────

function LayerDetail({ layer, state, onRetry, onClose }: {
  layer: ArchLayer
  state: LayerState
  onRetry: () => void
  onClose: () => void
}) {
  const h = HEALTH[layer.health] ?? HEALTH.good
  const result = state.status === 'done' ? state.result : null

  return (
    <>
      {/* Layer header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 16, borderBottom: `1px solid ${GH.border}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h2 style={{ margin: 0, color: GH.fgDefault, fontSize: 18, fontWeight: 600 }}>{layer.name}</h2>
            <span style={{ padding: '2px 8px', borderRadius: 100, fontSize: 12, fontWeight: 500, background: h.subtle, color: h.fg }}>{h.label}</span>
          </div>
          <p style={{ margin: 0, color: GH.fgMuted, fontSize: 13 }}>{layer.role}</p>
          {layer.note && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: h.subtle, borderLeft: `3px solid ${h.fg}`, color: GH.fgMuted, fontSize: 13, lineHeight: 1.6 }}>{layer.note}</div>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${GH.border}`, borderRadius: 6, color: GH.fgMuted, cursor: 'pointer', fontSize: 13, padding: '3px 8px', fontFamily: FONT_UI }}>✕</button>
      </div>

      {/* Files */}
      <Section title={`Files · ${layer.files.length}`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {layer.files.map((f, i) => (
            <code key={i} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: GH.surface2, color: GH.fgMuted, border: `1px solid ${GH.border}`, fontFamily: FONT_MONO }}>{f}</code>
          ))}
        </div>
      </Section>

      {/* Loading */}
      {state.status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: GH.fgMuted, fontSize: 13 }}>
            <Spinner color={GH.accentFg} size={14} /> Analyzing layer with Claude…
          </div>
          <div style={{ height: 3, background: GH.borderMuted, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: 3, width: '50%', background: `linear-gradient(90deg,transparent,${h.fg},transparent)`, animation: 'archSweep 1.6s ease-in-out infinite' }} />
          </div>
          <Section title="Summary"><Shimmer width="80%" height={14} /><Shimmer width="60%" height={14} style={{ marginTop: 6 }} /></Section>
          <Section title="Patterns"><div style={{ display: 'flex', gap: 6 }}>{[80,100,70].map((w,i) => <Shimmer key={i} width={w} height={26} style={{ borderRadius: 100 }} />)}</div></Section>
          <Section title="Insights"><InsightShimmer /><InsightShimmer /></Section>
        </div>
      )}

      {state.status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, background: GH.dangerSubtle, border: `1px solid ${GH.dangerFg}33` }}>
          <span style={{ color: GH.dangerFg, fontSize: 13 }}>Analysis failed</span>
          <button onClick={onRetry} style={{ ...ghBtnStyle, marginLeft: 'auto' }}>Retry</button>
        </div>
      )}

      {result && (
        <>
          <Section title="Summary">
            <p style={{ margin: 0, color: GH.fgMuted, fontSize: 14, lineHeight: 1.7 }}>{result.summary}</p>
          </Section>

          {result.patterns.length > 0 && (
            <Section title="Patterns">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.patterns.map((p, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500, background: GH.doneSubtle, color: GH.doneFg, border: `1px solid ${GH.doneFg}33` }}>{p}</span>
                ))}
              </div>
            </Section>
          )}

          <Section title="Insights">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
            </div>
          </Section>
        </>
      )}
    </>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, color: GH.fgDefault, fontSize: 14, fontWeight: 600 }}>{title}</h3>
        {subtitle && <span style={{ color: GH.fgSubtle, fontSize: 12 }}>{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

function InsightCard({ insight: ins }: { insight: ArchInsight }) {
  const cfg = INSIGHT[ins.type] ?? INSIGHT.warning
  return (
    <div style={{ padding: '10px 14px', borderRadius: 6, background: GH.surfaceBg, border: `1px solid ${GH.border}`, borderLeft: `3px solid ${cfg.fg}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: cfg.subtle, color: cfg.fg, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{cfg.icon}</span>
        <span style={{ color: GH.fgDefault, fontSize: 13, fontWeight: 600 }}>{ins.title}</span>
      </div>
      <p style={{ margin: 0, color: GH.fgMuted, fontSize: 13, lineHeight: 1.6, paddingLeft: 26 }}>{ins.body}</p>
    </div>
  )
}

function InsightShimmer() {
  return (
    <div style={{ padding: '10px 14px', borderRadius: 6, background: GH.surfaceBg, border: `1px solid ${GH.border}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Shimmer width={18} height={18} style={{ borderRadius: '50%' }} />
        <Shimmer width={140} height={13} />
      </div>
      <Shimmer width="88%" height={12} style={{ marginLeft: 26 }} />
      <Shimmer width="65%" height={12} style={{ marginLeft: 26 }} />
    </div>
  )
}

function Shimmer({ width, height = 10, style = {} }: { width: number | string; height?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      width, height, borderRadius: 4, flexShrink: 0,
      background: `linear-gradient(90deg,${GH.surfaceBg} 25%,${GH.overlay} 50%,${GH.surfaceBg} 75%)`,
      backgroundSize: '200% 100%', animation: 'archShimmer 1.5s ease infinite',
      ...style,
    }} />
  )
}

function Spinner({ color, size }: { color: string; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', border: `2px solid ${color}33`, borderTopColor: color, animation: 'archSpin .7s linear infinite', flexShrink: 0 }} />
  )
}

function GHProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <div style={{ width: '100%', height: 8, background: GH.surfaceBg, borderRadius: 100, overflow: 'hidden', border: `1px solid ${GH.border}` }}>
        <div style={{ height: '100%', width: `${pct}%`, background: GH.successEmphasis, borderRadius: 100, transition: 'width .2s' }} />
      </div>
      <span style={{ color: GH.fgMuted, fontSize: 12 }}>{done} / {total} files</span>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const ghBtnStyle: React.CSSProperties = {
  padding: '4px 12px', background: GH.overlay,
  border: `1px solid ${GH.border}`, borderRadius: 6,
  color: GH.fgDefault, fontSize: 12, fontFamily: FONT_UI,
  fontWeight: 500, cursor: 'pointer',
}
