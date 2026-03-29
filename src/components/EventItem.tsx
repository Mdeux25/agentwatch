import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClaudeEvent } from '../types/events'

interface EventItemProps {
  event: ClaudeEvent
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit',
  })
}

const PROSE =
  'prose prose-invert prose-sm max-w-none select-text ' +
  'prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-1.5 ' +
  'prose-headings:text-gray-100 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1.5 ' +
  'prose-h1:text-[13px] prose-h2:text-[12px] prose-h3:text-[12px] ' +
  'prose-strong:text-gray-100 prose-strong:font-semibold ' +
  'prose-em:text-gray-300 ' +
  'prose-code:text-amber-300 prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 ' +
  'prose-code:rounded prose-code:text-[11px] prose-code:font-mono ' +
  'prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:bg-[#1a1a1a] prose-pre:border prose-pre:border-white/10 ' +
  'prose-pre:rounded-lg prose-pre:p-3 prose-pre:my-2 ' +
  'prose-pre:text-gray-300 prose-pre:text-[11px] ' +
  'prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 prose-li:text-gray-300 ' +
  'prose-ol:my-1.5 prose-ol:pl-4 ' +
  'prose-hr:border-white/10 prose-hr:my-3 ' +
  'prose-blockquote:border-l-blue-500/50 prose-blockquote:text-gray-400 ' +
  'prose-blockquote:pl-3 prose-blockquote:my-2 prose-blockquote:not-italic ' +
  'prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline ' +
  'prose-table:text-[11px] prose-th:text-gray-300 prose-td:text-gray-400 ' +
  'prose-th:border-white/20 prose-td:border-white/10'

export function EventItem({ event }: EventItemProps) {
  const time = formatTime(event.timestamp)

  // ── session_init ── horizontal divider ────────────────────────────────────
  if (event.type === 'session_init') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3 py-4 px-2 select-none"
      >
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-gray-700 text-[10px] font-mono tracking-widest uppercase">
          session started
        </span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </motion.div>
    )
  }

  // ── user_message ── elevated card ─────────────────────────────────────────
  if (event.type === 'user_message') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mx-1 mt-4 mb-0.5 px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.07]"
      >
        <div className="flex items-center gap-2 mb-1.5 select-none">
          <span className="text-gray-300 text-[11px] font-semibold tracking-wide">You</span>
          <span className="text-gray-700 text-[10px] font-mono">{time}</span>
        </div>
        <p className="text-gray-200 text-[13px] leading-relaxed whitespace-pre-wrap break-words select-text">
          {event.message}
        </p>
      </motion.div>
    )
  }

  // ── tool_use ── compact single-line CLI row ────────────────────────────────
  if (event.type === 'tool_use') {
    const toolBody = (() => {
      if (!event.data) return null
      const d = event.data as Record<string, unknown>
      return d.command ?? d.file_path ?? d.pattern ?? d.path ?? null
    })()

    return (
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15 }}
        className="flex items-center gap-1.5 py-[3px] px-2 group min-w-0"
      >
        <span className="text-amber-500/60 text-[10px] flex-shrink-0 select-none">◆</span>
        <span className="text-amber-400/90 text-[11px] font-mono font-medium flex-shrink-0 select-none">
          {event.message ?? 'Tool'}
        </span>
        {toolBody != null && (
          <>
            <span className="text-gray-700 text-[10px] select-none flex-shrink-0">·</span>
            <span className="text-gray-500/80 text-[11px] font-mono truncate min-w-0 select-text">
              {String(toolBody)}
            </span>
          </>
        )}
        <span className="ml-auto text-gray-800 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pl-2 select-none">
          {time}
        </span>
      </motion.div>
    )
  }

  // ── tool_result ── same compact row with diamond outline icon ─────────────
  if (event.type === 'tool_result') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15 }}
        className="flex items-center gap-1.5 py-[3px] px-2 group min-w-0"
      >
        <span className="text-indigo-500/50 text-[10px] flex-shrink-0 select-none">◇</span>
        <span className="text-indigo-400/60 text-[11px] font-mono truncate min-w-0 select-text">
          {event.message ?? 'result'}
        </span>
        <span className="ml-auto text-gray-800 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pl-2 select-none">
          {time}
        </span>
      </motion.div>
    )
  }

  // ── thinking ── animated pulsing line ─────────────────────────────────────
  if (event.type === 'thinking') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-1.5 py-1 px-2"
      >
        <motion.span
          animate={{ opacity: [0.3, 0.85, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="text-amber-400/70 text-[10px] select-none"
        >
          ◎
        </motion.span>
        <span className="text-amber-400/50 text-[11px] font-mono italic select-none">
          {event.message ? event.message.slice(0, 80) : 'thinking…'}
        </span>
      </motion.div>
    )
  }

  // ── error ── red alert card ────────────────────────────────────────────────
  if (event.type === 'error') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mx-1 my-2 px-3 py-2.5 rounded-lg bg-red-950/30 border border-red-900/40"
      >
        <div className="flex items-center gap-1.5 mb-1 select-none">
          <span className="text-red-400 text-[10px]">✕</span>
          <span className="text-red-400 text-[11px] font-mono font-semibold tracking-wide">Error</span>
          <span className="text-red-900 text-[10px] font-mono ml-auto">{time}</span>
        </div>
        {event.message && (
          <p className="text-red-300/70 text-[12px] font-mono leading-relaxed whitespace-pre-wrap break-words select-text">
            {event.message}
          </p>
        )}
      </motion.div>
    )
  }

  // ── assistant_message / result ── prominent left-border block ─────────────
  if (event.type === 'assistant_message' || event.type === 'result') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="mt-2 mb-4 pl-3.5 pr-1 border-l-2 border-emerald-500/30"
      >
        <div className="flex items-center gap-1.5 mb-2 select-none">
          <span className="text-emerald-400/70 text-[10px]">◈</span>
          <span className="text-emerald-400/70 text-[11px] font-mono font-medium tracking-wide">
            Claude
          </span>
          <span className="text-gray-700 text-[10px] font-mono">{time}</span>
        </div>
        {event.message && (
          <div className={PROSE}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {event.message}
            </ReactMarkdown>
          </div>
        )}
      </motion.div>
    )
  }

  // ── fallback ── simple one-liner for unknown types ─────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2 py-1 px-2 group"
    >
      <span className="text-gray-600 text-[10px] font-mono select-none">·</span>
      <span className="text-gray-600 text-[11px] font-mono uppercase tracking-wide select-none">
        {event.type}
      </span>
      {event.message && (
        <span className="text-gray-500 text-[11px] truncate select-text">{event.message}</span>
      )}
    </motion.div>
  )
}
