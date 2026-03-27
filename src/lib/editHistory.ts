import type { ClaudeEvent } from '../types/events'
import { buildEditDiff } from './diffUtils'
import type { DiffLine } from './diffUtils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EditEntry {
  filePath: string
  filename: string
  timestamp: number
  toolName: string
  sections: DiffLine[][]
  addCount: number
  removeCount: number
  taskIndex: number   // index into TaskEntry[]
}

export interface TaskEntry {
  index: number
  prompt: string          // the user_message text
  timestamp: number
  filesEdited: string[]   // unique file paths in order of first appearance
  editEvents: EditEntry[]
}

// ── Derivation functions ───────────────────────────────────────────────────────

/**
 * Groups all edit events by task (conversation turn).
 * A task starts at each `user_message` event.
 * Returns tasks most-recent-first.
 */
export function deriveTaskHistory(events: ClaudeEvent[]): TaskEntry[] {
  const tasks: TaskEntry[] = []
  let current: TaskEntry | null = null

  for (const ev of events) {
    if (ev.type === 'user_message') {
      current = {
        index: tasks.length,
        prompt: ev.message ?? '',
        timestamp: ev.timestamp,
        filesEdited: [],
        editEvents: [],
      }
      tasks.push(current)
      continue
    }

    if (!current) continue

    if (ev.type === 'tool_use') {
      const diff = buildEditDiff(ev)
      if (!diff) continue

      const entry: EditEntry = {
        filePath: diff.filePath,
        filename: diff.filePath.split('/').pop() ?? diff.filePath,
        timestamp: diff.timestamp,
        toolName: ev.message ?? '',
        sections: diff.sections,
        addCount: diff.addCount,
        removeCount: diff.removeCount,
        taskIndex: current.index,
      }

      current.editEvents.push(entry)
      if (!current.filesEdited.includes(diff.filePath)) {
        current.filesEdited.push(diff.filePath)
      }
    }
  }

  // Return most-recent-first, only tasks that have edits
  return tasks.filter((t) => t.editEvents.length > 0).reverse()
}

/**
 * Returns a map of filePath → EditEntry[] (most-recent-first per file).
 * Files are ordered by most-recently-edited.
 */
export function deriveFileHistory(events: ClaudeEvent[]): Map<string, EditEntry[]> {
  // First derive all tasks to get taskIndex
  const allTasks: TaskEntry[] = []
  let current: TaskEntry | null = null

  for (const ev of events) {
    if (ev.type === 'user_message') {
      current = { index: allTasks.length, prompt: ev.message ?? '', timestamp: ev.timestamp, filesEdited: [], editEvents: [] }
      allTasks.push(current)
      continue
    }
    if (!current || ev.type !== 'tool_use') continue
    const diff = buildEditDiff(ev)
    if (!diff) continue
    const entry: EditEntry = {
      filePath: diff.filePath,
      filename: diff.filePath.split('/').pop() ?? diff.filePath,
      timestamp: diff.timestamp,
      toolName: ev.message ?? '',
      sections: diff.sections,
      addCount: diff.addCount,
      removeCount: diff.removeCount,
      taskIndex: current.index,
    }
    current.editEvents.push(entry)
    if (!current.filesEdited.includes(diff.filePath)) current.filesEdited.push(diff.filePath)
  }

  // Flatten into per-file map, preserve insertion order (== chronological)
  const map = new Map<string, EditEntry[]>()
  for (const task of allTasks) {
    for (const entry of task.editEvents) {
      if (!map.has(entry.filePath)) map.set(entry.filePath, [])
      map.get(entry.filePath)!.push(entry)
    }
  }

  // Reverse each file's list so most-recent is first,
  // then re-insert in most-recently-touched order
  const sorted = new Map<string, EditEntry[]>()
  const filesByLastEdit = Array.from(map.entries()).sort(
    (a, b) => b[1][b[1].length - 1].timestamp - a[1][a[1].length - 1].timestamp,
  )
  for (const [fp, entries] of filesByLastEdit) {
    sorted.set(fp, [...entries].reverse())
  }
  return sorted
}
