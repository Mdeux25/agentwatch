import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { DiffLines } from '../lib/diffUtils'
import { deriveFileHistory, deriveTaskHistory } from '../lib/editHistory'
import type { EditEntry, TaskEntry } from '../lib/editHistory'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EditRow({ entry, defaultOpen = false }: { entry: EditEntry; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
        }}
      >
        <span style={{ color: '#374151', fontSize: 9, width: 8, flexShrink: 0, userSelect: 'none' }}>{open ? '▾' : '▸'}</span>
        <span style={{ color: '#6b7280', fontSize: 9, fontFamily: "'JetBrains Mono', monospace", flex: 1 }}>
          {fmtTime(entry.timestamp)}
        </span>
        <span style={{ fontSize: 8, color: '#22c55e', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
          +{entry.addCount}
        </span>
        <span style={{ fontSize: 8, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
          -{entry.removeCount}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <DiffLines sections={entry.sections} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── File tab ───────────────────────────────────────────────────────────────────

function FileTab({ activeFileId }: { activeFileId: string | null }) {
  const { events } = useStore()
  const fileHistory = useMemo(() => deriveFileHistory(events), [events])
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const activeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeFileId])

  if (fileHistory.size === 0) {
    return (
      <div style={{ padding: '20px 12px', color: '#374151', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
        no edits yet
      </div>
    )
  }

  const toggleFile = (fp: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      next.has(fp) ? next.delete(fp) : next.add(fp)
      return next
    })
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }} className="scrollbar-thin scrollbar-thumb scrollbar-track-transparent">
      {Array.from(fileHistory.entries()).map(([fp, entries]) => {
        const isActive = fp === activeFileId
        const open = expandedFiles.has(fp) || isActive
        const filename = fp.split('/').pop() ?? fp
        return (
          <div
            key={fp}
            ref={isActive ? activeRef : undefined}
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <button
              onClick={() => toggleFile(fp)}
              style={{
                width: '100%', textAlign: 'left', background: isActive ? 'rgba(99,102,241,0.08)' : 'none',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
              }}
            >
              <span style={{ color: '#374151', fontSize: 9, width: 8, flexShrink: 0, userSelect: 'none' }}>{open ? '▾' : '▸'}</span>
              <span style={{
                color: isActive ? '#a5b4fc' : '#9ca3af',
                fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: isActive ? 700 : 400, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {filename}
              </span>
              <span style={{
                fontSize: 8, color: '#4b5563', fontFamily: "'JetBrains Mono', monospace",
                background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 4px', flexShrink: 0,
              }}>
                {entries.length}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  style={{ overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}
                >
                  {entries.map((entry, i) => (
                    <EditRow key={entry.timestamp} entry={entry} defaultOpen={i === 0} />
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

// ── Task tab ───────────────────────────────────────────────────────────────────

function TaskTab() {
  const { events } = useStore()
  const tasks = useMemo(() => deriveTaskHistory(events), [events])
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set())
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  if (tasks.length === 0) {
    return (
      <div style={{ padding: '20px 12px', color: '#374151', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
        no tasks yet
      </div>
    )
  }

  const toggleTask = (idx: number) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const toggleFile = (key: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }} className="scrollbar-thin scrollbar-thumb scrollbar-track-transparent">
      {tasks.map((task: TaskEntry) => {
        const open = expandedTasks.has(task.index)
        // Group this task's edits by file
        const byFile = new Map<string, EditEntry[]>()
        for (const entry of task.editEvents) {
          if (!byFile.has(entry.filePath)) byFile.set(entry.filePath, [])
          byFile.get(entry.filePath)!.push(entry)
        }

        return (
          <div key={task.index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={() => toggleTask(task.index)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 6, padding: '7px 10px',
              }}
            >
              <span style={{ color: '#374151', fontSize: 9, width: 8, flexShrink: 0, userSelect: 'none', marginTop: 1 }}>{open ? '▾' : '▸'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: '#9ca3af', fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {truncate(task.prompt, 42)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <span style={{ color: '#374151', fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtTime(task.timestamp)}
                  </span>
                  <span style={{
                    fontSize: 8, color: '#4b5563', fontFamily: "'JetBrains Mono', monospace",
                    background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 4px',
                  }}>
                    {task.filesEdited.length} {task.filesEdited.length === 1 ? 'file' : 'files'}
                  </span>
                </div>
              </div>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  style={{ overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}
                >
                  {Array.from(byFile.entries()).map(([fp, entries]) => {
                    const fileKey = `${task.index}::${fp}`
                    const fileOpen = expandedFiles.has(fileKey)
                    const filename = fp.split('/').pop() ?? fp
                    return (
                      <div key={fp} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <button
                          onClick={() => toggleFile(fileKey)}
                          style={{
                            width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 24px',
                          }}
                        >
                          <span style={{ color: '#374151', fontSize: 9, width: 8, flexShrink: 0, userSelect: 'none' }}>{fileOpen ? '▾' : '▸'}</span>
                          <span style={{
                            color: '#6b7280', fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace",
                            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {filename}
                          </span>
                          <span style={{ fontSize: 8, color: '#22c55e', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                            +{entries.reduce((s, e) => s + e.addCount, 0)}
                          </span>
                          <span style={{ fontSize: 8, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                            -{entries.reduce((s, e) => s + e.removeCount, 0)}
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {fileOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              style={{ overflow: 'hidden' }}
                            >
                              {entries.map((entry) => (
                                <EditRow key={entry.timestamp} entry={entry} />
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

// ── Main component ─────────────────────────────────────────────────────────────

interface EditHistoryPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function EditHistoryPanel({ isOpen, onClose }: EditHistoryPanelProps) {
  const { activeFileId } = useStore()
  const [tab, setTab] = useState<'file' | 'task'>('file')

  const tabBtn = (id: 'file' | 'task', label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px 3px',
        fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
        color: tab === id ? '#818cf8' : '#4b5563',
        borderBottom: tab === id ? '1px solid #6366f1' : '1px solid transparent',
        transition: 'color 0.12s, border-color 0.12s',
      }}
    >
      {label}
    </button>
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -12, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -12, scale: 0.97 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: 36, left: 12, zIndex: 20,
            width: 296,
            maxHeight: 'calc(100% - 56px)',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(4, 7, 16, 0.93)',
            border: '1px solid rgba(99, 102, 241, 0.22)',
            borderRadius: 8,
            overflow: 'hidden',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px 0',
            borderBottom: '1px solid rgba(99,102,241,0.13)',
            background: 'rgba(8,12,26,0.85)',
            flexShrink: 0,
          }}>
            <span style={{ color: '#6366f1', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', paddingBottom: 4 }}>
              HISTORY
            </span>
            <div style={{ flex: 1, display: 'flex', gap: 0, alignItems: 'flex-end' }}>
              {tabBtn('file', 'by file')}
              {tabBtn('task', 'by task')}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 0 4px 4px', flexShrink: 0 }}
            >
              ×
            </button>
          </div>

          {/* Tab content */}
          {tab === 'file'
            ? <FileTab activeFileId={activeFileId} />
            : <TaskTab />
          }
        </motion.div>
      )}
    </AnimatePresence>
  )
}
