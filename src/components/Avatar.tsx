import { motion } from 'framer-motion'
import type { AvatarState, EmotionType } from '../types/events'

interface AvatarProps {
  state: AvatarState
  emotion: EmotionType
}

const STATE_COLORS: Record<AvatarState, string> = {
  idle: '#3b82f6',
  thinking: '#f59e0b',
  speaking: '#10b981',
  working: '#8b5cf6',
  error: '#ef4444',
  success: '#22c55e',
}

const STATE_LABELS: Record<AvatarState, string> = {
  idle: 'Ready',
  thinking: 'Thinking...',
  speaking: 'Responding',
  working: 'Working...',
  error: 'Error',
  success: 'Done',
}

export function Avatar({ state, emotion }: AvatarProps) {
  const color = STATE_COLORS[state]
  const isActive = state !== 'idle'

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Orb */}
      <div className="relative w-48 h-48 flex items-center justify-center">
        {/* Outer pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color, opacity: 0.1 }}
          animate={{ scale: isActive ? [1, 1.35, 1] : [1, 1.06, 1] }}
          transition={{ duration: isActive ? 1.1 : 3.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Mid ring */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 160, height: 160, backgroundColor: color, opacity: 0.15 }}
          animate={{ scale: isActive ? [1, 1.12, 1] : 1 }}
          transition={{ duration: isActive ? 0.9 : 0, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Core */}
        <motion.div
          className="relative w-28 h-28 rounded-full flex items-center justify-center"
          style={{ backgroundColor: color }}
          animate={{
            boxShadow: isActive
              ? [`0 0 40px ${color}90`, `0 0 80px ${color}60`, `0 0 40px ${color}90`]
              : [`0 0 20px ${color}40`, `0 0 35px ${color}25`, `0 0 20px ${color}40`],
          }}
          transition={{ duration: state === 'thinking' ? 0.55 : 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Inner highlight */}
          <motion.div
            className="w-16 h-16 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
            animate={{
              scale: state === 'speaking'
                ? [1, 0.78, 1.12, 0.88, 1]
                : [1, 0.94, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: state === 'speaking' ? 0.45 : 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Working spinner */}
          {state === 'working' && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-transparent"
              style={{ borderTopColor: 'rgba(255,255,255,0.6)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </motion.div>
      </div>

      {/* State label */}
      <motion.p
        key={state}
        className="text-xs font-mono tracking-widest uppercase"
        style={{ color }}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 2.2, repeat: Infinity }}
      >
        {STATE_LABELS[state]}
      </motion.p>

      {/* Emotion badge */}
      {emotion !== 'neutral' && (
        <motion.span
          key={emotion}
          className="text-xs text-gray-600 font-mono"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {emotion}
        </motion.span>
      )}
    </div>
  )
}
