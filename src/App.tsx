import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EventLog } from './components/EventLog'
import { ChatInput } from './components/ChatInput'
import { SceneCanvas } from './components/scene/SceneCanvas'
import { useStore } from './store/useStore'
import { sendPrompt, listenForEvents, scanDirectory, getHomeDir, readFileFull } from './lib/tauri'
import { CodeEditorPanel } from './components/CodeEditorPanel'
import { AvatarDot } from './components/AvatarDot'
import { RenderErrorBoundary } from './components/scene/RenderErrorBoundary'
import { buildEditDiff, DiffLines } from './lib/diffUtils'
import { deriveFileHistory, deriveTaskHistory } from './lib/editHistory'
import type { ClaudeEvent } from './types/events'
import type { EditEntry, TaskEntry } from './lib/editHistory'

// ── File accent colours (matches scene FILE_META) ─────────────────────────────
const EXT_COLOR: Record<string, string> = {
  ts: '#3b82f6', tsx: '#818cf8', js: '#eab308', jsx: '#f97316',
  css: '#06b6d4', scss: '#e879f9', html: '#f97316', md: '#94a3b8',
  json: '#eab308', swift: '#fb923c', py: '#fbbf24', go: '#00acd7',
  rs: '#fb923c', rb: '#cc342d', vue: '#4ade80', dart: '#22d3ee',
}
function fileAccent(ext: string) { return EXT_COLOR[ext.toLowerCase()] ?? '#64748b' }

// ── Viz filter labels ─────────────────────────────────────────────────────────
const VIZ_LABELS: Record<string, string> = {
  showFolders: 'folders', showMisc: 'misc', showSubmodules: 'submod',
}

// ── Inline history sub-components (used in the bottom panel) ─────────────────

function EditRow({ entry, open, onToggle }: { entry: EditEntry; open: boolean; onToggle: () => void }) {
  const t = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <div>
      <button className="ide-hist-edit-row" onClick={onToggle}>
        <span className="ide-hist-chevron">{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--ide-font-mono)', color: 'var(--ide-fg-dim)' }}>{t}</span>
        <span className="ide-diff-add">+{entry.addCount}</span>
        <span style={{ width: 4 }} />
        <span className="ide-diff-remove">-{entry.removeCount}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.14, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}>
            <DiffLines sections={entry.sections} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function HistoryByFile({ events, activeFileId }: { events: ClaudeEvent[]; activeFileId: string | null }) {
  const fileHistory = useMemo(() => deriveFileHistory(events), [events])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editExpanded, setEditExpanded] = useState<Set<string>>(new Set())

  if (fileHistory.size === 0) return <div className="ide-empty">no edits yet</div>

  const toggleFile = (fp: string) => setExpanded(p => { const n = new Set(p); n.has(fp) ? n.delete(fp) : n.add(fp); return n })
  const toggleEdit = (k: string) => setEditExpanded(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })

  return (
    <div className="scrollbar-thin scrollbar-thumb scrollbar-track-transparent" style={{ overflowY: 'auto', height: '100%' }}>
      {Array.from(fileHistory.entries()).map(([fp, entries]) => {
        const isActive = fp === activeFileId
        const open = expanded.has(fp) || isActive
        const name = fp.split('/').pop() ?? fp
        return (
          <div key={fp}>
            <button className={`ide-hist-row ${isActive ? 'active-file' : ''}`} onClick={() => toggleFile(fp)}>
              <span className="ide-hist-chevron">{open ? '▾' : '▸'}</span>
              <span className={`ide-hist-file ${isActive ? 'active' : ''}`}>{name}</span>
              <span className="ide-hist-badge">{entries.length}</span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="ide-hist-expand">
                  {entries.map((e, i) => (
                    <EditRow key={e.timestamp} entry={e} open={editExpanded.has(`${fp}:${i}`)}
                      onToggle={() => toggleEdit(`${fp}:${i}`)} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

function HistoryByTask({ events }: { events: ClaudeEvent[] }) {
  const tasks = useMemo(() => deriveTaskHistory(events), [events])
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set())
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [expandedEdits, setExpandedEdits] = useState<Set<string>>(new Set())

  if (tasks.length === 0) return <div className="ide-empty">no tasks yet</div>

  const toggleTask = (i: number) => setExpandedTasks(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })
  const toggleFile = (k: string) => setExpandedFiles(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleEdit = (k: string) => setExpandedEdits(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n) + '…' : s
  const fmtT = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })

  return (
    <div className="scrollbar-thin scrollbar-thumb scrollbar-track-transparent" style={{ overflowY: 'auto', height: '100%' }}>
      {tasks.map((task: TaskEntry) => {
        const tOpen = expandedTasks.has(task.index)
        const byFile = new Map<string, EditEntry[]>()
        for (const e of task.editEvents) {
          if (!byFile.has(e.filePath)) byFile.set(e.filePath, [])
          byFile.get(e.filePath)!.push(e)
        }
        return (
          <div key={task.index}>
            <button className="ide-hist-row" onClick={() => toggleTask(task.index)}>
              <span className="ide-hist-chevron">{tOpen ? '▾' : '▸'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--ide-font-mono)', color: 'var(--ide-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {trunc(task.prompt, 44)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ide-fg-muted)', marginTop: 1 }}>{fmtT(task.timestamp)}</div>
              </div>
              <span className="ide-hist-badge">{task.filesEdited.length}f</span>
            </button>
            <AnimatePresence initial={false}>
              {tOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="ide-hist-expand">
                  {Array.from(byFile.entries()).map(([fp, entries]) => {
                    const fKey = `${task.index}::${fp}`
                    const fOpen = expandedFiles.has(fKey)
                    const name = fp.split('/').pop() ?? fp
                    return (
                      <div key={fp}>
                        <button className="ide-hist-edit-row" style={{ paddingLeft: 24 }} onClick={() => toggleFile(fKey)}>
                          <span className="ide-hist-chevron">{fOpen ? '▾' : '▸'}</span>
                          <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--ide-font-mono)', color: 'var(--ide-fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                          <span className="ide-diff-add">+{entries.reduce((s, e) => s + e.addCount, 0)}</span>
                          <span style={{ width: 4 }} />
                          <span className="ide-diff-remove">-{entries.reduce((s, e) => s + e.removeCount, 0)}</span>
                        </button>
                        <AnimatePresence initial={false}>
                          {fOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.14 }}
                              style={{ overflow: 'hidden' }}>
                              {entries.map((e, i) => (
                                <EditRow key={e.timestamp} entry={e}
                                  open={expandedEdits.has(`${fKey}:${i}`)}
                                  onToggle={() => toggleEdit(`${fKey}:${i}`)} />
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const {
    events, sessionId, isProcessing, avatarState,
    addEvent, setProcessing, setSessionId, clearSession,
    sceneMode, toggleSceneMode,
    activeFileId, quadNodes, projectRoot,
    setActiveFileContent, setActiveFileId,
    loadPaths, resetScene,
    chatContext, setChatContext,
    vizOptions, setVizOption,
    searchQuery, setSearchQuery,
  } = useStore()

  // IDE panel state
  const [sceneOpen, setSceneOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(true)
  const [bottomTab, setBottomTab] = useState<'diff' | 'history' | null>(null)
  const [histTab, setHistTab] = useState<'file' | 'task'>('file')

  // Resizable panel sizes
  const [sceneH, setSceneH] = useState(300)    // top scene panel height px
  const [chatW, setChatW] = useState(320)       // right chat panel width px
  const [bottomH, setBottomH] = useState(220)  // bottom diff/history height px

  // Drag resize refs
  const draggingRef = useRef<null | { type: 'scene' | 'chat' | 'bottom'; start: number; startVal: number }>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = draggingRef.current
      if (!d) return
      if (d.type === 'scene') {
        const delta = e.clientY - d.start
        setSceneH(Math.max(80, Math.min(window.innerHeight - 150, d.startVal + delta)))
      } else if (d.type === 'chat') {
        const delta = d.start - e.clientX
        setChatW(Math.max(180, Math.min(600, d.startVal + delta)))
      } else if (d.type === 'bottom') {
        const delta = d.start - e.clientY
        setBottomH(Math.max(60, Math.min(500, d.startVal + delta)))
      }
    }
    const onUp = () => { draggingRef.current = null; document.body.style.cursor = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const startDrag = (type: 'scene' | 'chat' | 'bottom', e: React.MouseEvent, val: number) => {
    e.preventDefault()
    draggingRef.current = { type, start: type === 'chat' ? e.clientX : e.clientY, startVal: val }
    document.body.style.cursor = type === 'chat' ? 'col-resize' : 'row-resize'
  }

  const homeDirRef = useRef<string>('')
  useEffect(() => { getHomeDir().then(h => { homeDirRef.current = h }) }, [])

  // ── Event listener ────────────────────────────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    listenForEvents((event: ClaudeEvent) => {
      if (event.type === 'session_init') {
        if (event.session_id) setSessionId(event.session_id)
        return
      }
      if (
        event.type === 'error' &&
        /too long|context.{0,20}(window|length|limit)|token.{0,10}limit/i.test(event.message ?? '')
      ) {
        clearSession()
        addEvent({ type: 'error', message: 'Context too long — session cleared automatically. Continue from here.', timestamp: Date.now() })
        setTimeout(() => setProcessing(false), 400)
        return
      }
      addEvent(event)
      if (event.type === 'assistant_message' || event.type === 'error') {
        setTimeout(() => setProcessing(false), 400)
      }
    }).then(fn => { if (cancelled) fn(); else unlisten = fn })
    return () => { cancelled = true; unlisten?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-open bottom diff panel on new edit
  const latestDiff = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const d = buildEditDiff(events[i])
      if (d) return d
    }
    return null
  }, [events])

  const lastDiffTs = useRef<number | null>(null)
  useEffect(() => {
    if (latestDiff && latestDiff.timestamp !== lastDiffTs.current) {
      lastDiffTs.current = latestDiff.timestamp
      setBottomTab('diff')
    }
  }, [latestDiff?.timestamp])

  // ── File loading ──────────────────────────────────────────────────────────
  const BINARY_EXTS = new Set(['png','jpg','jpeg','gif','webp','bmp','ico','tiff','svg','woff','woff2','ttf','otf','eot','pdf','zip','tar','gz','dmg','exe','bin','dylib','so','a','o'])

  useEffect(() => {
    if (!activeFileId) { setActiveFileContent(null); setChatContext(null); return }
    const node = quadNodes[activeFileId]
    if (!node || node.kind !== 'file') { setActiveFileContent(null); setChatContext(null); return }
    if (BINARY_EXTS.has(node.ext)) { setActiveFileContent(null); setChatContext(null); return }
    setActiveFileContent(null)
    readFileFull(node.id)
      .then(content => {
        setActiveFileContent(content)
        setChatContext(`<file path="${node.id}">\n${content}\n</file>`)
      })
      .catch(() => { setActiveFileContent(null); setChatContext(null) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileId])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSubmit = async (prompt: string) => {
    const fullPrompt = chatContext ? `${chatContext}\n\n${prompt}` : prompt
    addEvent({ type: 'user_message', message: prompt, timestamp: Date.now() })
    setProcessing(true)
    setChatContext(null)
    try {
      await sendPrompt(fullPrompt, sessionId)
    } catch (err) {
      addEvent({ type: 'error', message: err instanceof Error ? err.message : String(err), timestamp: Date.now() })
      setProcessing(false)
    }
  }

  const handleCommand = (name: string, args: string) => {
    if (name === 'clear') {
      clearSession()
    } else if (name === 'scan') {
      const LAST_SCAN_KEY = 'claudeAvatar.lastScanPath'
      let raw = args.trim()
      if (!raw) raw = localStorage.getItem(LAST_SCAN_KEY) ?? projectRoot ?? ''
      if (!raw) { addEvent({ type: 'error', message: 'scan: no path — try /scan ~/your-project', timestamp: Date.now() }); return }
      const home = homeDirRef.current
      const path = raw.startsWith('~/') && home ? home + raw.slice(1) : raw
      localStorage.setItem(LAST_SCAN_KEY, path)
      resetScene()
      addEvent({ type: 'assistant_message', message: `Scanning ${path}…`, timestamp: Date.now() })
      scanDirectory(path)
        .then(paths => {
          loadPaths(paths)
          const capped = paths.length >= 600 ? '\n⚠ Capped at 600 — use a more specific path.' : ''
          const fileList = paths.map(p => p.replace(path.endsWith('/') ? path : path + '/', '')).join('\n')
          addEvent({ type: 'result', message: `Loaded ${paths.length} files:${capped}\n\`\`\`\n${fileList}\n\`\`\``, timestamp: Date.now() })
        })
        .catch(err => addEvent({ type: 'error', message: `scan failed: ${err}`, timestamp: Date.now() }))
    }
  }

  const activeNode = activeFileId ? quadNodes[activeFileId] : null
  const contextFileName = chatContext && activeNode ? activeNode.name : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--ide-bg)', color: 'var(--ide-fg)' }}>

      {/* ── Title bar ── */}
      <div className="ide-titlebar">
        <span className="ide-titlebar-title">Claude Avatar</span>
        {sessionId && (
          <button className="ide-chip" onClick={clearSession} title="Clear session">
            {sessionId.slice(0, 6)}… ×
          </button>
        )}
        <div style={{ flex: 1 }} />
        {events.length > 60 && (
          <span style={{ fontSize: 10, color: '#f87171', fontFamily: 'var(--ide-font-mono)' }}>
            {events.length}⚠
          </span>
        )}
      </div>

      {/* ── Workspace ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Activity bar */}
        <div className="ide-activitybar">
          <button
            className={`ide-activity-btn ${sceneOpen ? 'active' : ''}`}
            onClick={() => setSceneOpen(v => !v)}
            title="Toggle explorer"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>

          <button
            className={`ide-activity-btn ${bottomTab === 'history' ? 'active' : ''}`}
            onClick={() => setBottomTab(v => v === 'history' ? null : 'history')}
            title="Edit history"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>

          <div style={{ flex: 1 }} />

          <button
            className={`ide-activity-btn ${!chatOpen ? 'active' : ''}`}
            onClick={() => setChatOpen(v => !v)}
            title="Toggle chat"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M2 3h12v8H9l-3 2v-2H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* ── Right of activity bar: flex column ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

          {/* ── TOP: Explorer / Scene ─────────────────────────────────────────
               CSS height transition (NOT framer-motion) so the SceneCanvas
               unmounts immediately on close — preventing R3F <Html> portal
               elements from escaping overflow:hidden and bleeding over the UI. */}
          <div style={{
            height: sceneOpen ? sceneH : 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'height 0.18s ease-in-out',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--ide-sidebar-bg)',
            borderBottom: sceneOpen ? '1px solid var(--ide-border)' : 'none',
          }}>
            {sceneOpen && (
              <>
                {/* Scene panel header */}
                <div className="ide-panel-header" style={{ background: '#2a2a2b' }}>
                  <span className="ide-panel-title">Explorer</span>
                  <div className="ide-panel-actions">
                    <button className="ide-icon-btn" onClick={toggleSceneMode} title={`Switch to ${sceneMode === 'treemap' ? 'tree' : 'map'}`}>
                      {sceneMode === 'treemap' ? '⊞' : '⊟'}
                    </button>
                    {(['showFolders', 'showMisc', 'showSubmodules'] as const).map(key => (
                      <button
                        key={key}
                        className={`ide-icon-btn ${vizOptions[key] ? 'active' : 'dim'}`}
                        onClick={() => setVizOption(key, !vizOptions[key])}
                        title={VIZ_LABELS[key]}
                        style={{ fontSize: 9, fontFamily: 'var(--ide-font-mono)', fontWeight: 700, width: 28 }}
                      >
                        {VIZ_LABELS[key].slice(0, 3)}
                      </button>
                    ))}
                    {/* Inline search */}
                    <div className="ide-sidebar-search" style={{ border: '1px solid var(--ide-border)', borderRadius: 4, height: 22, padding: '0 6px', gap: 4, background: 'rgba(0,0,0,0.25)', marginLeft: 6, width: 130 }}>
                      <span className="ide-sidebar-search-icon" style={{ fontSize: 10 }}>⌕</span>
                      <input
                        className="ide-sidebar-search-input"
                        placeholder="filter…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setSearchQuery('')}
                        style={{ fontSize: 11 }}
                      />
                      {searchQuery && (
                        <button className="ide-sidebar-search-clear" onClick={() => setSearchQuery('')}>×</button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scene canvas */}
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                  <RenderErrorBoundary label="canvas">
                    <SceneCanvas />
                  </RenderErrorBoundary>
                </div>
              </>
            )}
          </div>

          {/* ── Resize handle: scene / editor ── */}
          {sceneOpen && (
            <div
              onMouseDown={e => startDrag('scene', e, sceneH)}
              style={{
                height: 4, flexShrink: 0, cursor: 'row-resize',
                background: 'transparent',
                borderBottom: '1px solid var(--ide-border)',
                transition: 'background 0.1s',
              }}
              className="ide-resize-h"
            />
          )}

          {/* ── BOTTOM: Editor + Chat ── */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

            {/* Editor column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: 'var(--ide-panel-bg)' }}>

              {/* Tab bar */}
              <div className="ide-tabbar">
                {activeNode ? (
                  <div className="ide-tab active">
                    <div className="ide-tab-dot" style={{ background: fileAccent(activeNode.ext) }} />
                    <span className="ide-tab-name">{activeNode.name}</span>
                    {chatContext && <span className="ide-tab-dirty">·</span>}
                    <button className="ide-tab-close" onClick={() => { setActiveFileId(null); setChatContext(null) }}>×</button>
                  </div>
                ) : (
                  <div className="ide-tab active" style={{ color: 'var(--ide-fg-muted)', fontStyle: 'italic' }}>
                    <span className="ide-tab-name">no file open</span>
                  </div>
                )}
              </div>

              {/* Editor */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <RenderErrorBoundary label="editor">
                  <CodeEditorPanel />
                </RenderErrorBoundary>
              </div>

              {/* Bottom panel (diff / history) */}
              <AnimatePresence initial={false}>
                {bottomTab && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: bottomH }} exit={{ height: 0 }}
                    transition={{ duration: 0.18, ease: 'easeInOut' }}
                    className="ide-bottom-panel"
                    style={{ overflow: 'hidden' }}
                  >
                    {/* Resize handle at top of bottom panel */}
                    <div
                      onMouseDown={e => startDrag('bottom', e, bottomH)}
                      style={{ height: 4, cursor: 'row-resize', flexShrink: 0, background: 'transparent' }}
                      className="ide-resize-h"
                    />
                    <div className="ide-panel-tabbar">
                      <button className={`ide-panel-tab ${bottomTab === 'diff' ? 'active' : ''}`} onClick={() => setBottomTab('diff')}>DIFF</button>
                      <button className={`ide-panel-tab ${bottomTab === 'history' ? 'active' : ''}`} onClick={() => setBottomTab('history')}>HISTORY</button>
                      {bottomTab === 'history' && (
                        <>
                          <button className={`ide-panel-tab ${histTab === 'file' ? 'active' : ''}`} style={{ fontSize: 10, padding: '0 8px' }} onClick={() => setHistTab('file')}>by file</button>
                          <button className={`ide-panel-tab ${histTab === 'task' ? 'active' : ''}`} style={{ fontSize: 10, padding: '0 8px' }} onClick={() => setHistTab('task')}>by task</button>
                        </>
                      )}
                      <button className="ide-panel-close" onClick={() => setBottomTab(null)}>×</button>
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }} className="scrollbar-thin scrollbar-thumb scrollbar-track-transparent">
                      {bottomTab === 'diff' && (
                        latestDiff ? (
                          <>
                            <div className="ide-diff-header">
                              <span className="ide-diff-path">{latestDiff.filePath}</span>
                              <span className="ide-diff-add">+{latestDiff.addCount}</span>
                              <span className="ide-diff-remove">-{latestDiff.removeCount}</span>
                            </div>
                            <DiffLines sections={latestDiff.sections} />
                          </>
                        ) : (
                          <div className="ide-empty">no diffs yet</div>
                        )
                      )}
                      {bottomTab === 'history' && histTab === 'file' && <HistoryByFile events={events} activeFileId={activeFileId} />}
                      {bottomTab === 'history' && histTab === 'task' && <HistoryByTask events={events} />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Resize handle: editor / chat */}
            {chatOpen && (
              <div
                onMouseDown={e => startDrag('chat', e, chatW)}
                style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent', borderLeft: '1px solid var(--ide-border)' }}
                className="ide-resize-v"
              />
            )}

            {/* Chat panel */}
            <AnimatePresence initial={false}>
              {chatOpen && (
                <motion.div
                  initial={{ width: 0 }} animate={{ width: chatW }} exit={{ width: 0 }}
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                  className="ide-chat-panel"
                  style={{ overflow: 'hidden', width: chatW }}
                >
                  <div className="ide-panel-header">
                    <div className={`ide-status-dot ${isProcessing ? 'processing' : ''}`} style={{ marginRight: 2 }} />
                    <span className="ide-panel-title">Claude</span>
                    <div className="ide-panel-actions">
                      <button className="ide-icon-btn" onClick={() => setChatOpen(false)} title="Close chat">
                        <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                          <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <EventLog events={events} />
                  <div className="ide-chat-input-area">
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ flexShrink: 0, padding: '0 6px 8px 10px' }}>
                        <AvatarDot state={avatarState} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <ChatInput
                          onSubmit={handleSubmit}
                          contextFileName={contextFileName}
                          onDismissContext={() => setChatContext(null)}
                          onCommand={handleCommand}
                          isDisabled={isProcessing}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="ide-statusbar">
        <div className="ide-status-left">
          <div className={`ide-status-dot ${isProcessing ? 'processing' : ''}`} />
          <span className="ide-status-item">Claude Avatar</span>
          {sessionId && <span className="ide-status-dim">{sessionId.slice(0, 8)}</span>}
        </div>
        <div className="ide-status-right">
          {activeNode && (
            <>
              <span className="ide-status-item">{activeNode.name}</span>
              <span className="ide-status-dim" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 2, padding: '0 4px' }}>
                {activeNode.ext.toUpperCase()}
              </span>
            </>
          )}
          {events.length > 0 && (
            <span className={`ide-status-item ${events.length > 80 ? 'error' : ''}`} style={{ opacity: 0.7 }}>
              {events.length} events
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
