import { useState } from 'react'
import { AvatarDot } from './AvatarDot'
import { openFolderDialog } from '../lib/tauri'

interface WelcomeModalProps {
  recentPaths: string[]
  onOpen: (path: string) => void
}

export function WelcomeModal({ recentPaths, onOpen }: WelcomeModalProps) {
  const [loading, setLoading] = useState(false)

  const handleBrowse = async () => {
    setLoading(true)
    try {
      const path = await openFolderDialog()
      if (path) onOpen(path)
    } finally {
      setLoading(false)
    }
  }

  const handleRecent = (path: string) => onOpen(path)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#0d0e17',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 0,
    }}>
      {/* Glow ring behind avatar */}
      <div style={{
        position: 'relative', width: 80, height: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        <div style={{
          position: 'absolute', inset: -18,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 70%)',
          animation: 'pulse 2.2s ease-in-out infinite',
        }} />
        <AvatarDot state={loading ? 'thinking' : 'idle'} />
      </div>

      {/* Title */}
      <h1 style={{
        margin: '0 0 8px',
        fontSize: 26,
        fontWeight: 700,
        color: '#e2e8f0',
        fontFamily: 'var(--ide-font-ui)',
        letterSpacing: '-0.02em',
      }}>
        Claude Avatar
      </h1>
      <p style={{
        margin: '0 0 36px',
        fontSize: 13,
        color: '#4b5563',
        fontFamily: 'var(--ide-font-ui)',
      }}>
        {loading ? 'Opening folder…' : 'Open a project folder to get started'}
      </p>

      {/* Open button */}
      <button
        onClick={handleBrowse}
        disabled={loading}
        style={{
          padding: '10px 28px',
          background: loading ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.18)',
          border: '1px solid rgba(99,102,241,0.55)',
          borderRadius: 8,
          color: loading ? '#818cf8' : '#a5b4fc',
          fontSize: 13,
          fontFamily: 'var(--ide-font-ui)',
          fontWeight: 600,
          cursor: loading ? 'default' : 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
          letterSpacing: '0.01em',
        }}
        onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(99,102,241,0.28)' }}
        onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'rgba(99,102,241,0.18)' }}
      >
        {loading ? '…' : '⊞  Open Project Folder'}
      </button>

      {/* Recent projects */}
      {recentPaths.length > 0 && (
        <div style={{ marginTop: 36, width: 360 }}>
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#374151',
            fontFamily: 'var(--ide-font-mono)', marginBottom: 8,
            textAlign: 'center',
          }}>
            Recent
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recentPaths.map(p => {
              const parts = p.split('/')
              const name = parts[parts.length - 1] || parts[parts.length - 2]
              const parent = parts.slice(0, -1).join('/')
              return (
                <button
                  key={p}
                  onClick={() => handleRecent(p)}
                  style={{
                    background: 'none',
                    border: '1px solid transparent',
                    borderRadius: 6,
                    padding: '7px 12px',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 2,
                    transition: 'background 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.borderColor = 'transparent'
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', fontFamily: 'var(--ide-font-mono)' }}>
                    {name}
                  </span>
                  <span style={{ fontSize: 10, color: '#374151', fontFamily: 'var(--ide-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 336 }}>
                    {parent}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
