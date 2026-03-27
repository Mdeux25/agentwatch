import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { buildEditDiff, DiffLines } from '../lib/diffUtils'
import type { EditDiff } from '../lib/diffUtils'
import type { ClaudeEvent } from '../types/events'

// ── Latest-diff extraction ─────────────────────────────────────────────────────

function extractLatestDiff(events: ClaudeEvent[]): EditDiff | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const diff = buildEditDiff(events[i])
    if (diff) return diff
  }
  return null
}

// ── Component ──────────────────────────────────────────────────────────────────

interface DiffPanelProps {
  onOpenHistory?: () => void
}

export function DiffPanel({ onOpenHistory }: DiffPanelProps) {
  const { events } = useStore()
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  const diff = useMemo(() => extractLatestDiff(events), [events])
  const visible = diff !== null && diff.timestamp !== dismissedAt

  return (
    <AnimatePresence>
      {visible && diff && (
        <motion.div
          key={diff.timestamp}
          initial={{ opacity: 0, x: -10, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -10, scale: 0.97 }}
          transition={{ duration: 0.2 }}
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
            display: 'flex', alignItems: 'center',
            padding: '6px 10px',
            borderBottom: '1px solid rgba(99, 102, 241, 0.13)',
            background: 'rgba(8, 12, 26, 0.85)',
            gap: 6, flexShrink: 0,
          }}>
            <span style={{ color: '#6366f1', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>DIFF</span>
            <span style={{ color: '#4b5563', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={diff.filePath}
            >
              {diff.filePath.split('/').pop()}
            </span>
            <span style={{ fontSize: 8, color: '#22c55e', fontWeight: 600 }}>+{diff.addCount}</span>
            <span style={{ fontSize: 8, color: '#ef4444', fontWeight: 600 }}>-{diff.removeCount}</span>
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                title="View edit history"
                style={{
                  background: 'none', border: '1px solid rgba(99,102,241,0.25)',
                  color: '#6366f1', cursor: 'pointer',
                  fontSize: 8, fontFamily: 'inherit', fontWeight: 700,
                  borderRadius: 3, padding: '1px 5px', lineHeight: '12px',
                  letterSpacing: '0.04em',
                }}
              >
                hist
              </button>
            )}
            <button
              onClick={() => setDismissedAt(diff.timestamp)}
              title="Dismiss"
              style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 0 0 2px', flexShrink: 0 }}
            >
              ×
            </button>
          </div>

          {/* Diff lines */}
          <div style={{ overflowY: 'auto', flex: 1 }} className="scrollbar-thin scrollbar-thumb scrollbar-track-transparent">
            <DiffLines sections={diff.sections} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
