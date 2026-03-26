import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
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
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
        <p className="text-gray-600 text-sm font-mono">Waiting for your prompt...</p>
        <p className="text-gray-700 text-xs font-mono">
          Claude Code CLI will be spawned for each request
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb scrollbar-track-transparent">
      <div className="space-y-0.5 p-4">
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
