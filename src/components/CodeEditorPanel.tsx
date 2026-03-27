import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { writeFile } from '../lib/tauri'
import { parseSymbols, SYMBOL_COLORS, SYMBOL_LETTER } from '../lib/symbolParser'
import { highlightCode } from '../lib/syntaxHighlight'

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG         = '#1a1b2e'
const BG_GUTTER  = '#13131f'
const BG_HEADER  = '#13131f'
const TEXT       = '#c0caf5'
const TEXT_DIM   = '#3b4261'
const TEXT_ACTIVE_LINE = '#737aa2'
const FONT       = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', monospace"
const FONT_SIZE  = 12
const LINE_H     = 20       // px — must match CSS line-height
const GUTTER_W   = 48       // px

// ─── Shared style for pre + textarea ─────────────────────────────────────────

const SHARED: React.CSSProperties = {
  fontFamily:  FONT,
  fontSize:    FONT_SIZE,
  lineHeight:  `${LINE_H}px`,
  tabSize:     2,
  whiteSpace:  'pre',
  overflowWrap: 'normal',
  wordBreak:   'normal',
  margin:      0,
  padding:     '12px 16px',
  boxSizing:   'border-box',
  minWidth:    '100%',
}

// ─── Line-numbers gutter ──────────────────────────────────────────────────────

function Gutter({
  lineCount,
  activeLine,
  scrollTopRef,
}: {
  lineCount: number
  activeLine: number
  scrollTopRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div
      ref={scrollTopRef}
      style={{
        width: GUTTER_W,
        flexShrink: 0,
        background: BG_GUTTER,
        borderRight: '1px solid rgba(255,255,255,0.05)',
        overflow: 'hidden',
        userSelect: 'none',
        paddingTop: 12,
        paddingBottom: 12,
      }}
    >
      {Array.from({ length: lineCount }, (_, i) => {
        const n = i + 1
        const isActive = n === activeLine
        return (
          <div
            key={n}
            style={{
              height: LINE_H,
              paddingRight: 12,
              textAlign: 'right',
              fontFamily: FONT,
              fontSize: FONT_SIZE - 1,
              lineHeight: `${LINE_H}px`,
              color: isActive ? TEXT_ACTIVE_LINE : TEXT_DIM,
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {n}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CodeEditorPanel() {
  const {
    activeFileId,
    activeFileContent,
    setActiveFileContent,
    quadNodes,
  } = useStore()

  const [draft, setDraft]         = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [activeLine, setActiveLine] = useState(1)

  const taRef      = useRef<HTMLTextAreaElement>(null)
  const preRef     = useRef<HTMLPreElement>(null)
  const gutterRef  = useRef<HTMLDivElement>(null)

  const node = activeFileId ? quadNodes[activeFileId] : null
  const ext  = node?.ext ?? ''

  // Reset draft when active file changes
  useEffect(() => {
    setDraft(null)
    setSaveState('idle')
    setActiveLine(1)
  }, [activeFileId])

  const MAX_LINES = 7000
  const rawContent   = draft ?? activeFileContent ?? ''
  const rawLines     = rawContent.split('\n')
  const isTruncated  = rawLines.length > MAX_LINES
  const content      = isTruncated ? rawLines.slice(0, MAX_LINES).join('\n') : rawContent
  const isDirty      = draft !== null && draft !== activeFileContent
  const lines        = content.split('\n')
  const symbols     = useMemo(() => {
    try { return activeFileContent ? parseSymbols(activeFileContent, ext) : [] }
    catch { return [] }
  }, [activeFileContent, ext])
  const highlighted = useMemo(() => {
    try { return content ? highlightCode(content, ext) : '' }
    catch { return content }   // fallback: plain text, no highlighting
  }, [content, ext])

  if (!node || node.kind !== 'file') return null

  // ── Scroll sync: textarea drives pre + gutter ──────────────────────────────
  const syncScroll = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    if (preRef.current) {
      preRef.current.scrollTop  = ta.scrollTop
      preRef.current.scrollLeft = ta.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop
    }
  }, [])

  // ── Track active line ──────────────────────────────────────────────────────
  const updateActiveLine = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const line = content.slice(0, ta.selectionStart).split('\n').length
    setActiveLine(line)
  }, [content])

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeFileId || !isDirty) return
    setSaveState('saving')
    try {
      await writeFile(activeFileId, draft!)
      setActiveFileContent(draft)
      setDraft(null)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1800)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 2500)
    }
  }, [activeFileId, isDirty, draft, setActiveFileContent])

  // ── Tab key ───────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const s = ta.selectionStart, end = ta.selectionEnd
      const next = content.slice(0, s) + '  ' + content.slice(end)
      setDraft(next)
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
    }
  }, [content, handleSave])

  // ── Active line highlight top offset ─────────────────────────────────────
  const activeLineTop = 12 + (activeLine - 1) * LINE_H

  // ── Breadcrumb (show last 2 path segments) ────────────────────────────────
  const parts = (activeFileId ?? '').split('/')
  const breadcrumb = parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : parts.join('/')

  return (
    <div
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: BG, minHeight: 0, overflow: 'hidden' }}
    >

      {/* ── Subheader: breadcrumb + save + symbol chips ───────────────────── */}
      <div style={{ background: BG_HEADER, borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '5px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: symbols.length ? 5 : 0 }}>
          {/* Breadcrumb path */}
          <span style={{ fontFamily: FONT, fontSize: 10, color: '#565f89', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={activeFileId ?? ''}>
            {breadcrumb}
          </span>

          {/* Save state */}
          {isDirty ? (
            <button
              onClick={handleSave}
              disabled={saveState === 'saving'}
              style={{
                fontFamily: FONT, fontSize: 10, padding: '2px 8px', borderRadius: 4,
                background: saveState === 'error' ? '#f7768e22' : '#9ece6a22',
                border: `1px solid ${saveState === 'error' ? '#f7768e66' : '#9ece6a66'}`,
                color: saveState === 'error' ? '#f7768e' : '#9ece6a',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {saveState === 'saving' ? '…' : saveState === 'saved' ? '✓ saved' : saveState === 'error' ? '⚠ error' : 'save'}
            </button>
          ) : (
            <span style={{ fontFamily: FONT, fontSize: 9, color: '#3b4261', flexShrink: 0 }}>⌘S to save</span>
          )}
        </div>

        {/* Symbol chips */}
        {symbols.length > 0 && (
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 1 }}>
            {symbols.map((sym) => (
              <button
                key={`${sym.line}-${sym.name}`}
                onClick={() => {
                  const ta = taRef.current
                  if (!ta) return
                  const lineStart = content.split('\n').slice(0, sym.line - 1).join('\n').length + (sym.line > 1 ? 1 : 0)
                  ta.focus()
                  ta.setSelectionRange(lineStart, lineStart)
                  const scrollTo = (sym.line - 1) * LINE_H
                  ta.scrollTop = Math.max(0, scrollTo - 80)
                  syncScroll()
                  setActiveLine(sym.line)
                }}
                style={{
                  fontFamily: FONT, fontSize: 9, padding: '2px 7px', borderRadius: 10,
                  border: `1px solid ${SYMBOL_COLORS[sym.kind]}44`,
                  background: `${SYMBOL_COLORS[sym.kind]}12`,
                  color: SYMBOL_COLORS[sym.kind],
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                <span style={{ opacity: 0.6, marginRight: 3 }}>{SYMBOL_LETTER[sym.kind]}</span>
                {sym.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Editor body ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Gutter */}
        <Gutter lineCount={lines.length} activeLine={activeLine} scrollTopRef={gutterRef} />

        {/* Code area: pre (mirror) + textarea (input) stacked */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: BG }}>

          {/* Active line highlight */}
          <div
            style={{
              position: 'absolute', left: 0, right: 0,
              top: activeLineTop,
              height: LINE_H,
              background: 'rgba(122,162,247,0.07)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          {/* Syntax-highlighted mirror pre */}
          <pre
            ref={preRef}
            aria-hidden
            dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
            style={{
              ...SHARED,
              position: 'absolute', inset: 0,
              overflow: 'hidden',
              color: TEXT,
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />

          {/* Editable textarea — transparent text, visible caret */}
          <textarea
            ref={taRef}
            value={content}
            readOnly={isTruncated}
            onChange={e => { if (!isTruncated) setDraft(e.target.value) }}
            onScroll={syncScroll}
            onKeyDown={handleKeyDown}
            onKeyUp={updateActiveLine}
            onClick={updateActiveLine}
            onSelect={updateActiveLine}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              ...SHARED,
              position: 'absolute', inset: 0,
              color: 'transparent',
              caretColor: '#c0caf5',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              overflow: 'auto',
              zIndex: 2,
            }}
          />
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div style={{
        background: BG_GUTTER, borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '3px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 9, color: TEXT_DIM }}>
          Ln {activeLine}, Col {
            (() => {
              const ta = taRef.current
              if (!ta) return 1
              const lineStart = content.slice(0, ta.selectionStart).lastIndexOf('\n')
              return ta.selectionStart - lineStart
            })()
          }
        </span>
        <span style={{ fontFamily: FONT, fontSize: 9, color: TEXT_DIM }}>{lines.length} lines</span>
        {node.ext && (
          <span style={{ fontFamily: FONT, fontSize: 9, color: '#565f89' }}>
            .{node.ext}
          </span>
        )}
        {isTruncated && (
          <span style={{ fontFamily: FONT, fontSize: 9, color: '#f7768e88', marginLeft: 'auto' }}>
            showing {MAX_LINES.toLocaleString()} of {rawLines.length.toLocaleString()} lines
          </span>
        )}
        {isDirty && !isTruncated && (
          <span style={{ fontFamily: FONT, fontSize: 9, color: '#ff9e6488', marginLeft: 'auto' }}>● unsaved</span>
        )}
      </div>
    </div>
  )
}
