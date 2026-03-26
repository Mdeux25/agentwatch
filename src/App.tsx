import { useEffect, useRef } from 'react'
import { AvatarBadge } from './components/AvatarBadge'
import { EventLog } from './components/EventLog'
import { ChatInput } from './components/ChatInput'
import { SceneCanvas } from './components/scene/SceneCanvas'
import { useStore } from './store/useStore'
import { sendPrompt, listenForEvents, scanDirectory, getHomeDir, readFileFull } from './lib/tauri'
import { CodeEditorPanel } from './components/CodeEditorPanel'
import type { ClaudeEvent } from './types/events'

function StatusDot({ isProcessing }: { isProcessing: boolean }) {
  return (
    <div
      className={`w-2 h-2 rounded-full transition-colors duration-500 ${
        isProcessing ? 'bg-amber-400 animate-pulse' : 'bg-blue-500'
      }`}
    />
  )
}

export default function App() {
  const {
    events,
    sessionId,
    isProcessing,
    avatarState,
    emotion,
    addEvent,
    setProcessing,
    setSessionId,
    clearSession,
    sceneVisible,
    toggleScene,
    activeFileId,
    quadNodes,
    projectRoot,
    setActiveFileContent,
    loadPaths,
    resetScene,
  } = useStore()

  const homeDirRef = useRef<string>('')
  useEffect(() => { getHomeDir().then(h => { homeDirRef.current = h }) }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    listenForEvents((event: ClaudeEvent) => {
      if (event.type === 'session_init') {
        if (event.session_id) setSessionId(event.session_id)
        return
      }
      // Auto-clear session when context window is exceeded
      if (
        event.type === 'error' &&
        /too long|context.{0,20}(window|length|limit)|token.{0,10}limit/i.test(event.message ?? '')
      ) {
        clearSession()
        addEvent({
          type: 'error',
          message: 'Context too long — session cleared automatically. Continue from here.',
          timestamp: Date.now(),
        })
        setTimeout(() => setProcessing(false), 400)
        return
      }
      addEvent(event)
      if (event.type === 'assistant_message' || event.type === 'error') {
        setTimeout(() => setProcessing(false), 400)
      }
    }).then((fn) => {
      if (cancelled) { fn() } else { unlisten = fn }
    })

    return () => { cancelled = true; unlisten?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load full file content when active file changes
  useEffect(() => {
    if (!activeFileId) { setActiveFileContent(null); return }
    const node = quadNodes[activeFileId]
    if (!node || node.kind !== 'file') { setActiveFileContent(null); return }
    setActiveFileContent(null)
    readFileFull(node.id).then(setActiveFileContent).catch(() => setActiveFileContent(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileId])

  const handleSubmit = async (prompt: string) => {
    addEvent({ type: 'user_message', message: prompt, timestamp: Date.now() })
    setProcessing(true)
    try {
      await sendPrompt(prompt, sessionId)
    } catch (err) {
      addEvent({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      })
      setProcessing(false)
    }
  }

  const activeNode = activeFileId ? quadNodes[activeFileId] : null

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex overflow-hidden">

      {/* Center panel — QuadTree 3D (with avatar badge overlay) */}
      {sceneVisible && (
        <div className="w-[500px] flex-shrink-0 border-r border-white/5 bg-gray-950 flex flex-col">
          <div className="flex-1 relative min-h-0 overflow-hidden">
            <SceneCanvas />

            {/* Avatar badge — top-left overlay */}
            <div className="absolute top-3 left-3 pointer-events-none z-10">
              <AvatarBadge
                state={avatarState}
                emotion={emotion}
                sessionId={sessionId}
                onClearSession={clearSession}
              />
            </div>

            {/* Active file pill — bottom center */}
            <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-900/80 text-purple-400/70 border border-purple-900/30">
                {activeNode?.name ?? 'no active file'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Code editor panel — appears when a file is selected */}
      <CodeEditorPanel />

      {/* Right panel — Chat */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-shrink-0 border-b border-white/5 px-6 py-3.5 flex items-center gap-3">
          <StatusDot isProcessing={isProcessing} />
          <h1 className="text-xs font-mono font-semibold text-gray-500 tracking-widest uppercase">
            Claude Code
          </h1>
          <button
            onClick={toggleScene}
            className="ml-auto text-xs font-mono text-gray-700 hover:text-purple-400 border border-gray-800 hover:border-purple-900 rounded px-2 py-0.5 transition-colors"
          >
            {sceneVisible ? 'hide viz' : 'show viz'}
          </button>
          {events.length > 0 && (
            <span
              title={events.length > 60 ? 'Session is getting long — consider /clear to start fresh' : undefined}
              className={`text-xs font-mono ${
                events.length > 80 ? 'text-red-500 animate-pulse' :
                events.length > 60 ? 'text-amber-500' :
                'text-gray-700'
              }`}
            >
              {events.length} events{events.length > 60 ? ' ⚠' : ''}
            </span>
          )}
        </div>
        <EventLog events={events} />
        <ChatInput
          onSubmit={handleSubmit}
          onCommand={(name, args) => {
            if (name === 'clear') {
              clearSession()
            } else if (name === 'scan') {
              // Resolve path: expand ~, fall back to last scan, then projectRoot
              const LAST_SCAN_KEY = 'claudeAvatar.lastScanPath'
              let raw = args.trim()
              if (!raw) raw = localStorage.getItem(LAST_SCAN_KEY) ?? projectRoot ?? ''
              if (!raw) {
                addEvent({
                  type: 'error',
                  message: `scan: no path — try /scan ~/your-project`,
                  timestamp: Date.now(),
                })
                return
              }
              // Expand leading ~ to home dir
              const home = homeDirRef.current
              const path = raw.startsWith('~/') && home ? home + raw.slice(1) : raw
              localStorage.setItem(LAST_SCAN_KEY, path)
              resetScene()
              addEvent({ type: 'assistant_message', message: `Scanning ${path}…`, timestamp: Date.now() })
              scanDirectory(path)
                .then((paths) => {
                  loadPaths(paths)
                  const capped = paths.length >= 600 ? ' (capped at 600 — use a more specific path)' : ''
                  addEvent({ type: 'result', message: `Loaded ${paths.length} files into the tree.${capped}`, timestamp: Date.now() })
                })
                .catch((err) => {
                  addEvent({ type: 'error', message: `scan failed: ${err}`, timestamp: Date.now() })
                })
            }
          }}
          isDisabled={isProcessing}
        />
      </div>
    </div>
  )
}
