import { motion } from 'framer-motion'
import type { AvatarState, EmotionType } from '../types/events'

const STATE_COLORS: Record<AvatarState, string> = {
  idle:     '#3b82f6',
  thinking: '#f59e0b',
  speaking: '#10b981',
  working:  '#8b5cf6',
  error:    '#ef4444',
  success:  '#22c55e',
}

const STATE_LABELS: Record<AvatarState, string> = {
  idle:     'ready',
  thinking: 'thinking',
  speaking: 'responding',
  working:  'working',
  error:    'error',
  success:  'done',
}

interface Props {
  state: AvatarState
  emotion: EmotionType
  sessionId: string | null
  onClearSession: () => void
}

export function AvatarBadge({ state, emotion, sessionId, onClearSession }: Props) {
  const color    = STATE_COLORS[state]
  const isActive = state !== 'idle'

  return (
    <div className="flex flex-col items-start gap-1.5 pointer-events-auto">
      {/* Orb */}
      <div className="relative w-10 h-10 flex items-center justify-center">
        {/* Outer pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ scale: isActive ? [1, 1.5, 1] : [1, 1.1, 1], opacity: isActive ? [0.15, 0.08, 0.15] : [0.08, 0.04, 0.08] }}
          transition={{ duration: isActive ? 1.0 : 3.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Mid ring */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 32, height: 32, backgroundColor: color }}
          animate={{ scale: isActive ? [1, 1.15, 1] : 1, opacity: isActive ? [0.2, 0.1, 0.2] : 0.12 }}
          transition={{ duration: isActive ? 0.9 : 0, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Core */}
        <motion.div
          className="relative w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color }}
          animate={{
            boxShadow: isActive
              ? [`0 0 10px ${color}90`, `0 0 20px ${color}60`, `0 0 10px ${color}90`]
              : [`0 0 6px ${color}50`, `0 0 10px ${color}30`, `0 0 6px ${color}50`],
          }}
          transition={{ duration: state === 'thinking' ? 0.5 : 2.0, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Inner highlight */}
          <motion.div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
            animate={{ scale: state === 'speaking' ? [1, 0.7, 1.2, 0.85, 1] : [1, 0.9, 1] }}
            transition={{ duration: state === 'speaking' ? 0.45 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Working spinner */}
          {state === 'working' && (
            <motion.div
              className="absolute inset-0 rounded-full border border-transparent"
              style={{ borderTopColor: 'rgba(255,255,255,0.7)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </motion.div>
      </div>

      {/* State + emotion label row */}
      <div className="flex items-center gap-1.5">
        <motion.span
          key={state}
          className="text-[9px] font-mono tracking-wider uppercase leading-none"
          style={{ color }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        >
          {STATE_LABELS[state]}
        </motion.span>
        {emotion !== 'neutral' && (
          <span className="text-[8px] text-gray-700 font-mono leading-none">· {emotion}</span>
        )}
      </div>

      {/* Session info */}
      {sessionId && (
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-gray-700 font-mono leading-none truncate max-w-[80px]">
            {sessionId.slice(0, 8)}…
          </span>
          <button
            onClick={onClearSession}
            className="text-[8px] text-gray-700 hover:text-red-400 font-mono transition-colors leading-none"
          >
            clear
          </button>
        </div>
      )}
    </div>
  )
}
