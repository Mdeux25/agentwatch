import { invoke } from '@tauri-apps/api/core'
import type { UsageRecord } from '../types/usage'

export async function appendUsageRecord(record: UsageRecord): Promise<void> {
  await invoke('append_usage_record', { record: JSON.stringify(record) })
}

export async function loadAllUsageRecords(): Promise<UsageRecord[]> {
  const raw = await invoke<string>('load_usage_records')
  if (!raw.trim()) return []
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as UsageRecord)
}
