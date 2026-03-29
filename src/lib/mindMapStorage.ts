import { readFileFull, writeFile } from './tauri'
import type { MindMapData } from '../types/mindMap'

const MAP_SUBPATH = '.agentwatch/mindmap.json'

export async function loadMindMap(projectRoot: string): Promise<MindMapData | null> {
  try {
    const raw = await readFileFull(`${projectRoot}/${MAP_SUBPATH}`)
    return JSON.parse(raw) as MindMapData
  } catch {
    return null
  }
}

export async function saveMindMap(projectRoot: string, data: MindMapData): Promise<void> {
  await writeFile(`${projectRoot}/${MAP_SUBPATH}`, JSON.stringify(data, null, 2))
}
