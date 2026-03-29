export type AvatarState = 'idle' | 'thinking' | 'speaking' | 'working' | 'error' | 'success'
export type EmotionType = 'neutral' | 'confident' | 'focused' | 'concerned' | 'happy'

export type ClaudeEventType =
  | 'session_init'
  | 'assistant_message'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'result'
  | 'error'
  | 'user_message'

export interface ClaudeEvent {
  type: ClaudeEventType
  message?: string
  data?: unknown
  timestamp: number
  session_id?: string
  input_tokens?: number
  output_tokens?: number
}

// Tool input shapes
export interface ToolInputWithPath { file_path?: string }

// QuadTree node — each directory/file occupies a rectangular region in XZ space
export interface QuadNode {
  id: string                                          // absolute path (or '__root__')
  name: string                                        // display name (last path segment)
  kind: 'directory' | 'file'
  depth: number                                       // 0 = direct child of root
  bounds: { x: number; z: number; w: number; h: number }
  parentId: string | null
  childIds: string[]
  accessCount: number
  lastAccessedAt: number
  ext: string                                         // lowercase extension (files only)
}

// Symbol extracted from a file (function, class, type, variable)
export interface FileSymbol {
  kind: 'function' | 'class' | 'type' | 'variable'
  name: string
  line: number
}

// One bouncing sphere per agent session
export interface AgentSphere {
  sessionId: string
  color: string
  activeFileId: string | null
  jumpTrigger: number                                 // increment each tool call to fire bounce
}
