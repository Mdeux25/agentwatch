import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClaudeEvent, ClaudeEventType } from '../types/events'

interface EventItemProps {
  event: ClaudeEvent
}

const STYLES: Record<ClaudeEventType, { color: string; label: string; icon: string }> = {
  session_init:      { color: 'text-blue-400',   label: 'Session',  icon: '⬡' },
  assistant_message: { color: 'text-emerald-400', label: 'Claude',   icon: '◈' },
  tool_use:          { color: 'text-purple-400',  label: 'Tool',     icon: '◆' },
  tool_result:       { color: 'text-indigo-400',  label: 'Result',   icon: '◇' },
  thinking:          { color: 'text-amber-400',   label: 'Thinking', icon: '◎' },
  result:            { color: 'text-green-400',   label: 'Done',     icon: '✓' },
  error:             { color: 'text-red-400',     label: 'Error',    icon: '✕' },
  user_message:      { color: 'text-gray-300',    label: 'You',      icon: '▷' },
}

export function EventItem({ event }: EventItemProps) {
  const style = STYLES[event.type] ?? { color: 'text-gray-500', label: event.type, icon: '·' }
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const label = event.type === 'tool_use' && event.message
    ? `Tool: ${event.message}`
    : style.label

  const isMarkdown = event.type === 'assistant_message'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="flex gap-3 py-2 px-2 rounded hover:bg-white/5 transition-colors group"
    >
      <span className={`${style.color} font-mono text-sm w-4 flex-shrink-0 mt-1 select-none`}>
        {style.icon}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className={`${style.color} text-xs font-mono font-semibold uppercase tracking-wide`}>
            {label}
          </span>
          <span className="text-gray-700 text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </span>
        </div>

        {event.message && event.type !== 'tool_use' && (
          isMarkdown ? (
            <div className="prose prose-invert prose-sm max-w-none
              prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-1
              prose-headings:text-gray-100 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
              prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
              prose-strong:text-gray-100 prose-strong:font-semibold
              prose-em:text-gray-300
              prose-code:text-amber-300 prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-gray-900 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg prose-pre:p-3 prose-pre:my-2
              prose-pre:text-gray-300 prose-pre:text-xs
              prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5 prose-li:text-gray-300
              prose-ol:my-1 prose-ol:pl-4
              prose-hr:border-white/10 prose-hr:my-3
              prose-blockquote:border-l-blue-500 prose-blockquote:text-gray-400 prose-blockquote:pl-3 prose-blockquote:my-2
              prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
              prose-table:text-xs prose-th:text-gray-300 prose-td:text-gray-400 prose-th:border-white/20 prose-td:border-white/10">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {event.message}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
              {event.message}
            </p>
          )
        )}
      </div>
    </motion.div>
  )
}
