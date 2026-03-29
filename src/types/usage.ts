export interface UsageRecord {
  id: string           // `${timestamp}-${sessionId}`
  timestamp: number    // ms since epoch
  date: string         // 'YYYY-MM-DD' local time
  projectRoot: string
  projectName: string  // last segment of projectRoot
  sessionId: string
  taskIndex: number
  taskPrompt: string   // first 100 chars of the triggering user message
  inputTokens: number
  outputTokens: number
  costUsd: number      // calculated at write time
  model: string
}

export interface UsageAggregate {
  inputTokens: number
  outputTokens: number
  costUsd: number
  taskCount: number
}
