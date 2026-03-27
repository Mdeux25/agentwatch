import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ClaudeEvent } from '../types/events'

export async function openFolderDialog(): Promise<string | null> {
  const result = await invoke<string>('open_folder_dialog')
  return result || null
}

export async function sendPrompt(prompt: string, sessionId: string | null = null): Promise<void> {
  await invoke<void>('send_prompt', { prompt, sessionId })
}

export async function stopSession(): Promise<void> {
  await invoke<void>('stop_session')
}

export async function readFilePreview(path: string): Promise<string> {
  return invoke<string>('read_file_preview', { path })
}

export async function scanDirectory(path: string): Promise<string[]> {
  return invoke<string[]>('scan_directory', { path })
}

export async function getHomeDir(): Promise<string> {
  return invoke<string>('get_home_dir')
}

export async function readFileFull(path: string): Promise<string> {
  return invoke<string>('read_file_full', { path })
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke<void>('write_file', { path, content })
}

export async function listenForEvents(
  handler: (event: ClaudeEvent) => void,
): Promise<UnlistenFn> {
  return listen<ClaudeEvent>('claude-event', (e) => handler(e.payload))
}
