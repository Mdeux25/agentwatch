import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ClaudeEvent } from '../types/events'
import { EventItem } from './EventItem'

interface EventLogProps {
  events: ClaudeEvent[]
}

export function EventLog({ events }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  if (events.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center p-8 select-none"
      >
        <span className="text-gray-700 text-2xl leading-none">◈</span>
        <p className="text-gray-500 text-sm">Ask Claude anything</p>
        <p className="text-gray-700 text-[11px] font-mono">Type / for commands</p>
      </motion.div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb scrollbar-track-transparent">
      <div className="py-2 px-2">
        <AnimatePresence initial={false}>
          {events.map((event, i) => (
            <EventItem key={`${event.timestamp}-${i}`} event={event} />
          ))}
        </AnimatePresence>
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
