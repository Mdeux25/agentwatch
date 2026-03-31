import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ClaudeEvent } from '../types/events'

/** Returns version string if Claude Code is installed, null otherwise */
export async function checkClaudeInstalled(): Promise<string | null> {
  return invoke<string | null>('check_claude_installed')
}

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

export async function scanDirectory(path: string, useGitignore = true): Promise<string[]> {
  return invoke<string[]>('scan_directory', { path, useGitignore })
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

export async function generateFileSummary(path: string, content: string): Promise<string> {
  return invoke<string>('generate_file_summary', { path, content })
}

export async function runClaudePrompt(prompt: string): Promise<string> {
  return invoke<string>('run_claude_prompt', { prompt })
}

export async function saveContextFiles(
  projectRoot: string,
  filePath: string,
  html: string,
  ctxMd: string,
): Promise<void> {
  return invoke<void>('save_context_files', { projectRoot, filePath, html, ctxMd })
}

export async function listenForEvents(
  handler: (event: ClaudeEvent) => void,
): Promise<UnlistenFn> {
  return listen<ClaudeEvent>('claude-event', (e) => handler(e.payload))
}
