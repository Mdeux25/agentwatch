import { useState, useRef, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Slash commands ───────────────────────────────────────────────────────────

interface SlashCommand {
  name: string          // e.g. "clear"
  label: string         // display label
  description: string
}

const COMMANDS: SlashCommand[] = [
  { name: 'clear', label: '/clear', description: 'Clear chat & reset scene' },
  { name: 'scan',  label: '/scan [path]', description: 'Render full directory tree in the viz' },
]

interface ChatInputProps {
  onSubmit: (prompt: string) => void
  onCommand: (name: string, args: string) => void
  isDisabled: boolean
  contextFileName?: string | null
  onDismissContext?: () => void
}

export function ChatInput({ onSubmit, onCommand, isDisabled, contextFileName, onDismissContext }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Show picker when input starts with '/'
  const isSlash = value.startsWith('/')
  const query = isSlash ? value.slice(1).toLowerCase() : ''
  const matches = isSlash
    ? COMMANDS.filter(c => c.name.startsWith(query))
    : []

  const executeCommand = (cmd: SlashCommand, args = '') => {
    onCommand(cmd.name, args)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isDisabled) return

    // Slash command: /name [args]
    if (trimmed.startsWith('/')) {
      const rest = trimmed.slice(1)
      const spaceIdx = rest.indexOf(' ')
      const cmdName = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)
      const cmdArgs = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim()
      const cmd = COMMANDS.find(c => c.name === cmdName)
      if (cmd) { executeCommand(cmd, cmdArgs); return }
    }

    onSubmit(trimmed)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, matches.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const cmd = matches[selectedIdx] ?? matches[0]
        // Tab autocompletes, Enter also submits any args already typed
        const rest = value.slice(1)
        const spaceIdx = rest.indexOf(' ')
        const args = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim()
        executeCommand(cmd, args)
        return
      }
      if (e.key === 'Escape') { setValue(''); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    setSelectedIdx(0)
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  return (
    <div className="flex-shrink-0 border-t border-white/10 p-4">
      {/* Command picker */}
      <AnimatePresence>
        {matches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="mb-2 rounded-lg border border-white/10 bg-gray-900 overflow-hidden"
          >
            {matches.map((cmd, i) => (
              <button
                key={cmd.name}
                onMouseDown={(e) => {
                  e.preventDefault()
                  const rest = value.slice(1)
                  const spaceIdx = rest.indexOf(' ')
                  const args = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim()
                  executeCommand(cmd, args)
                }}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 text-xs font-mono transition-colors ${
                  i === selectedIdx ? 'bg-indigo-600/30 text-indigo-300' : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                <span className="text-indigo-400 font-semibold">{cmd.label}</span>
                <span className="text-gray-600">{cmd.description}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context file badge */}
      <AnimatePresence>
        {contextFileName && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-800/40"
          >
            <span className="text-indigo-500 text-[10px] font-mono">ctx</span>
            <span className="text-indigo-300 text-xs font-mono truncate flex-1">{contextFileName}</span>
            <button
              onClick={onDismissContext}
              className="text-indigo-700 hover:text-indigo-300 transition-colors text-sm leading-none ml-1 flex-shrink-0"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-2 bg-white/5 rounded-xl border border-white/10 focus-within:border-blue-500/40 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={isDisabled}
          placeholder={isDisabled ? 'Processing...' : 'Ask Claude… or type / for commands'}
          rows={1}
          className="flex-1 bg-transparent text-gray-200 placeholder-gray-600 text-sm resize-none px-4 py-3 focus:outline-none max-h-40 overflow-y-auto"
        />
        <motion.button
          onClick={handleSubmit}
          disabled={isDisabled || !value.trim()}
          whileTap={{ scale: 0.92 }}
          className="flex-shrink-0 m-2 w-8 h-8 rounded-lg bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white flex items-center justify-center transition-colors hover:bg-blue-400 disabled:cursor-not-allowed"
        >
          {isDisabled ? (
            <motion.div
              className="w-3 h-3 border-2 border-current border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
            />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </motion.button>
      </div>
      <p className="text-xs text-gray-700 mt-2 text-center font-mono select-none">
        Enter to send · Shift+Enter for newline · / for commands
      </p>
    </div>
  )
}
