import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
  /** Use fixed positioning (for root-level boundaries not inside a positioned container) */
  fixed?: boolean
}

interface State {
  error: Error | null
  componentStack: string | null
  expanded: boolean
}

export class RenderErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, expanded: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
    console.error(`[RenderErrorBoundary:${this.props.label ?? 'scene'}]`, error, info)
  }

  reset = () => this.setState({ error: null, componentStack: null, expanded: false })

  render() {
    const { error, componentStack, expanded } = this.state
    if (!error) return this.props.children

    return (
      <div
        style={{
          position: this.props.fixed ? 'fixed' : 'absolute',
          inset: 0,
          background: 'rgba(10,0,0,0.92)',
          color: '#f87171',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          padding: 16,
          overflow: 'auto',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>
            ✖ Render Error
          </span>
          {this.props.label && (
            <span style={{ color: '#6b7280', fontSize: 10 }}>[{this.props.label}]</span>
          )}
          <button
            onClick={this.reset}
            style={{
              marginLeft: 'auto',
              background: '#1f0000',
              border: '1px solid #7f1d1d',
              color: '#fca5a5',
              borderRadius: 4,
              padding: '2px 10px',
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'inherit',
            }}
          >
            retry
          </button>
        </div>

        <div
          style={{
            background: '#0f0000',
            border: '1px solid #7f1d1d',
            borderRadius: 4,
            padding: '8px 10px',
            color: '#fca5a5',
            fontSize: 12,
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {error.message}
        </div>

        {componentStack && (
          <>
            <button
              onClick={() => this.setState((s) => ({ expanded: !s.expanded }))}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: 'inherit',
                textAlign: 'left',
                padding: 0,
              }}
            >
              {expanded ? '▾' : '▸'} component stack
            </button>
            {expanded && (
              <pre
                style={{
                  background: '#0a0000',
                  border: '1px solid #3f1515',
                  borderRadius: 4,
                  padding: '8px 10px',
                  color: '#9ca3af',
                  fontSize: 10,
                  lineHeight: 1.5,
                  overflowX: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {componentStack.trim()}
              </pre>
            )}
          </>
        )}
      </div>
    )
  }
}

// ─── WebGL context monitor ─────────────────────────────────────────────────────
// Attach to the <Canvas onCreated={...}> callback to track context loss.

interface WebGLDebugState {
  contextLost: boolean
  glRenderer: string | null
  glVersion: string | null
}

let _webglDebugListeners: Array<(s: WebGLDebugState) => void> = []
let _webglState: WebGLDebugState = { contextLost: false, glRenderer: null, glVersion: null }

export function subscribeWebGLDebug(fn: (s: WebGLDebugState) => void) {
  _webglDebugListeners.push(fn)
  fn(_webglState)
  return () => { _webglDebugListeners = _webglDebugListeners.filter((l) => l !== fn) }
}

function emitWebGL(patch: Partial<WebGLDebugState>) {
  _webglState = { ..._webglState, ...patch }
  _webglDebugListeners.forEach((l) => l(_webglState))
}

export function onCanvasCreated({ gl }: { gl: { getContext: () => WebGLRenderingContext | WebGL2RenderingContext; domElement: HTMLCanvasElement } }) {
  const ctx = gl.getContext()
  const dbg = ctx.getExtension('WEBGL_debug_renderer_info')
  emitWebGL({
    glRenderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
    glVersion: ctx.getParameter(ctx.VERSION),
  })

  const canvas = gl.domElement
  canvas.addEventListener('webglcontextlost', () => {
    emitWebGL({ contextLost: true })
    console.error('[WebGL] Context lost!')
  })
  canvas.addEventListener('webglcontextrestored', () => {
    emitWebGL({ contextLost: false })
    console.info('[WebGL] Context restored.')
  })
}

