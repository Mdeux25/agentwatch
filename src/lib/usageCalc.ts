import type { UsageRecord, UsageAggregate } from '../types/usage'

// Pricing per million tokens
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-6':   { input: 15, output: 75 },
  'claude-haiku-4-5':  { input: 0.8, output: 4 },
  default:             { input: 3, output: 15 },
}

export function calcCost(inputTokens: number, outputTokens: number, model = 'default'): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING.default
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

export function aggregate(records: UsageRecord[]): UsageAggregate {
  return records.reduce(
    (acc, r) => ({
      inputTokens:  acc.inputTokens  + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      costUsd:      acc.costUsd      + r.costUsd,
      taskCount:    acc.taskCount    + 1,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0, taskCount: 0 }
  )
}

export function groupByDay(records: UsageRecord[]): Record<string, UsageRecord[]> {
  return records.reduce((acc, r) => {
    acc[r.date] = [...(acc[r.date] ?? []), r]
    return acc
  }, {} as Record<string, UsageRecord[]>)
}

export function groupByProject(records: UsageRecord[]): Record<string, UsageRecord[]> {
  return records.reduce((acc, r) => {
    acc[r.projectName] = [...(acc[r.projectName] ?? []), r]
    return acc
  }, {} as Record<string, UsageRecord[]>)
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`
  return String(n)
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`
}

export function todayStr(): string {
  return new Date().toLocaleDateString('en-CA') // 'YYYY-MM-DD'
}

export function currentMonthPrefix(): string {
  return new Date().toISOString().slice(0, 7) // 'YYYY-MM'
}

export function todayRecords(records: UsageRecord[]): UsageRecord[] {
  const today = todayStr()
  return records.filter(r => r.date === today)
}

export function currentMonthRecords(records: UsageRecord[]): UsageRecord[] {
  const prefix = currentMonthPrefix()
  return records.filter(r => r.date.startsWith(prefix))
}
