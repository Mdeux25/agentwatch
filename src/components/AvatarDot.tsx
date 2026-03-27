import { motion } from 'framer-motion'
import type { AvatarState } from '../types/events'

const STATE_COLORS: Record<AvatarState, string> = {
  idle:     '#3b82f6',
  thinking: '#f59e0b',
  speaking: '#10b981',
  working:  '#8b5cf6',
  error:    '#ef4444',
  success:  '#22c55e',
}

interface Props {
  state: AvatarState
}

export function AvatarDot({ state }: Props) {
  const color    = STATE_COLORS[state]
  const isActive = state !== 'idle'

  return (
    <div className="relative w-6 h-6 flex-shrink-0 flex items-center justify-center self-end mb-[9px]">
      {/* Outer pulse ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        animate={{
          scale:   isActive ? [1, 1.7, 1] : [1, 1.2, 1],
          opacity: isActive ? [0.18, 0.04, 0.18] : [0.08, 0.02, 0.08],
        }}
        transition={{ duration: isActive ? 1.0 : 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Core dot */}
      <motion.div
        className="relative w-3.5 h-3.5 rounded-full"
        style={{ backgroundColor: color }}
        animate={{
          boxShadow: isActive
            ? [`0 0 6px ${color}99`, `0 0 14px ${color}66`, `0 0 6px ${color}99`]
            : [`0 0 3px ${color}44`, `0 0 7px ${color}22`, `0 0 3px ${color}44`],
        }}
        transition={{ duration: state === 'thinking' ? 0.5 : 2.0, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Working spinner ring */}
        {state === 'working' && (
          <motion.div
            className="absolute inset-0 rounded-full border border-transparent"
            style={{ borderTopColor: 'rgba(255,255,255,0.75)' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
        )}
        {/* Speaking ripple */}
        {state === 'speaking' && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
            animate={{ scale: [0.7, 1.1, 0.7] }}
            transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </motion.div>
    </div>
  )
}
