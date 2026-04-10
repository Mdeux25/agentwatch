import { useState, useEffect } from 'react'
import { checkClaudeInstalled, checkCodexInstalled } from '../lib/tauri'
import type { AgentProvider } from '../types/provider'

// ── Platform detection ────────────────────────────────────────────────────────

type Platform = 'mac' | 'windows' | 'linux'

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win'))    return 'windows'
  if (ua.includes('mac'))    return 'mac'
  return 'linux'
}

const CLAUDE_INSTALL_CMDS: Record<Platform, { label: string; cmd: string }[]> = {
  mac: [
    { label: 'curl (recommended)', cmd: 'curl -fsSL https://claude.ai/install.sh | bash' },
    { label: 'Homebrew',           cmd: 'brew install --cask claude-code' },
  ],
  windows: [
    { label: 'PowerShell',  cmd: 'irm https://claude.ai/install.ps1 | iex' },
    { label: 'WinGet',      cmd: 'winget install Anthropic.ClaudeCode' },
  ],
  linux: [
    { label: 'curl',        cmd: 'curl -fsSL https://claude.ai/install.sh | bash' },
  ],
}

const CODEX_INSTALL_CMDS: Record<Platform, { label: string; cmd: string }[]> = {
  mac:     [{ label: 'npm', cmd: 'npm install -g @openai/codex' }],
  windows: [{ label: 'npm', cmd: 'npm install -g @openai/codex' }],
  linux:   [{ label: 'npm', cmd: 'npm install -g @openai/codex' }],
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepDot({ n, state }: { n: number; state: 'done' | 'active' | 'pending' }) {
  const bg =
    state === 'done'   ? '#22c55e' :
    state === 'active' ? '#f97316' : 'transparent'
  const border =
    state === 'done'   ? '#22c55e' :
    state === 'active' ? '#f97316' : 'rgba(255,255,255,0.2)'
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      border: `2px solid ${border}`,
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, color: state === 'pending' ? 'rgba(255,255,255,0.3)' : '#fff',
      flexShrink: 0, transition: 'all 0.3s',
    }}>
      {state === 'done' ? '✓' : n}
    </div>
  )
}

function CmdBlock({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{
      background: '#0a0a12', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, padding: '10px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12,
    }}>
      <code style={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 13, color: '#e2e8f0', flex: 1,
        wordBreak: 'break-all', lineHeight: 1.5,
      }}>
        {cmd}
      </code>
      <button
        onClick={copy}
        style={{
          flexShrink: 0, padding: '4px 10px',
          background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 5, cursor: 'pointer',
          fontSize: 11, fontFamily: 'inherit',
          color: copied ? '#4ade80' : 'rgba(255,255,255,0.6)',
          transition: 'all 0.2s',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

function ProviderToggle({ selected, onChange }: { selected: AgentProvider; onChange: (p: AgentProvider) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
      {(['claude', 'codex'] as AgentProvider[]).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
          background: selected === p ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${selected === p ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.1)'}`,
          color: selected === p ? '#f97316' : 'rgba(255,255,255,0.4)',
          fontSize: 14, fontWeight: 600,
          transition: 'all 0.15s',
        }}>
          {p === 'claude' ? 'Claude Code' : 'OpenAI Codex'}
        </button>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { onDone: (provider?: AgentProvider) => void }

type CheckState = 'checking' | 'found' | 'not-found'

export function SetupGuide({ onDone }: Props) {
  const platform = detectPlatform()

  const [selectedProvider, setSelectedProvider] = useState<AgentProvider>('claude')
  const [claudeState, setClaudeState]     = useState<CheckState>('checking')
  const [codexState, setCodexState]       = useState<CheckState>('checking')
  const [claudeVersion, setClaudeVersion] = useState('')
  const [codexVersion, setCodexVersion]   = useState('')
  const [step, setStep]                   = useState(0)   // 0=check, 1=install, 2=auth, 3=done
  const [cmdIdx, setCmdIdx]               = useState(0)
  const [rechecking, setRechecking]       = useState(false)

  const cmds = selectedProvider === 'claude' ? CLAUDE_INSTALL_CMDS[platform] : CODEX_INSTALL_CMDS[platform]
  const currentState = selectedProvider === 'claude' ? claudeState : codexState
  // Auto-detect both on mount
  useEffect(() => {
    Promise.all([checkClaudeInstalled(), checkCodexInstalled()]).then(([cv, xv]) => {
      if (cv) { setClaudeVersion(cv); setClaudeState('found') }
      else    { setClaudeState('not-found') }
      if (xv) { setCodexVersion(xv); setCodexState('found') }
      else    { setCodexState('not-found') }

      // Auto-advance: if any is found, jump to done
      if (cv || xv) {
        setStep(3)
        if (cv) setSelectedProvider('claude')
        else if (xv) setSelectedProvider('codex')
      } else {
        setStep(1)
      }
    })
  }, [])

  const recheck = async () => {
    setRechecking(true)
    const [cv, xv] = await Promise.all([checkClaudeInstalled(), checkCodexInstalled()])
    setRechecking(false)
    if (cv) { setClaudeVersion(cv); setClaudeState('found') }
    else    { setClaudeState('not-found') }
    if (xv) { setCodexVersion(xv); setCodexState('found') }
    else    { setCodexState('not-found') }

    if ((selectedProvider === 'claude' && cv) || (selectedProvider === 'codex' && xv)) {
      setStep(3)
    }
  }

  const STEPS = ['Detect', 'Install', 'Authenticate', 'Ready']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(8,8,16,0.97)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--ide-font-ui, system-ui, sans-serif)',
    }}>
      <div style={{
        width: '100%', maxWidth: 560,
        background: '#111118',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: '36px 40px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f1f5', letterSpacing: '-0.3px' }}>
            Set up an AI Agent
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>
            AgentWatch needs at least one agent CLI installed.
          </p>
        </div>

        {/* Provider toggle */}
        <ProviderToggle selected={selectedProvider} onChange={(p) => { setSelectedProvider(p); setCmdIdx(0) }} />

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'pending'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <StepDot n={i + 1} state={state} />
                  <span style={{ fontSize: 10, color: state === 'pending' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 1, margin: '0 8px', marginBottom: 20,
                    background: i < step ? '#22c55e' : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.3s',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── Step content ── */}

        {/* Step 0: Checking */}
        {step === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Checking for installed agents...</p>
          </div>
        )}

        {/* Step 1: Install */}
        {step === 1 && (
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#f1f1f5' }}>
              Install {selectedProvider === 'claude' ? 'Claude Code' : 'OpenAI Codex CLI'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
              Open your terminal and run one of these commands.
              {selectedProvider === 'claude' && ' The native installer is recommended — it auto-updates in the background.'}
            </p>

            {/* Method tabs */}
            {cmds.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {cmds.map((c, i) => (
                  <button key={i} onClick={() => setCmdIdx(i)} style={{
                    padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                    fontSize: 12, fontWeight: 500,
                    background: cmdIdx === i ? 'rgba(249,115,22,0.15)' : 'transparent',
                    border: `1px solid ${cmdIdx === i ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.12)'}`,
                    color: cmdIdx === i ? '#f97316' : 'rgba(255,255,255,0.45)',
                    transition: 'all 0.15s',
                  }}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <CmdBlock cmd={cmds[cmdIdx].cmd} />

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={recheck}
                disabled={rechecking}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, cursor: rechecking ? 'default' : 'pointer',
                  background: rechecking ? 'rgba(255,255,255,0.05)' : 'rgba(249,115,22,0.12)',
                  border: '1px solid rgba(249,115,22,0.3)',
                  color: rechecking ? 'rgba(255,255,255,0.3)' : '#f97316',
                  fontSize: 14, fontWeight: 500,
                  transition: 'all 0.15s',
                }}
              >
                {rechecking ? 'Checking...' : 'I installed it — re-check'}
              </button>
              <button
                onClick={() => setStep(2)}
                style={{
                  padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 13,
                }}
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Authenticate */}
        {step === 2 && (
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#f1f1f5' }}>
              {selectedProvider === 'claude' ? 'Log in to Claude' : 'Set up Codex'}
            </h3>
            {selectedProvider === 'claude' ? (
              <>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                  Run <code style={{ background: '#0a0a12', padding: '1px 6px', borderRadius: 4, fontSize: 12, color: '#f97316' }}>claude</code> in your terminal.
                  A browser window will open — log in with your Anthropic account.
                </p>
                <CmdBlock cmd="claude" />
                <div style={{
                  marginTop: 16, padding: '12px 14px',
                  background: 'rgba(59,130,246,0.08)', borderRadius: 8,
                  border: '1px solid rgba(59,130,246,0.2)',
                  fontSize: 13, color: 'rgba(180,200,240,0.8)', lineHeight: 1.6,
                }}>
                  You need a <strong style={{ color: '#93c5fd' }}>Claude Pro, Max, Team, or Enterprise</strong> subscription.
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                  Run <code style={{ background: '#0a0a12', padding: '1px 6px', borderRadius: 4, fontSize: 12, color: '#f97316' }}>codex</code> in your terminal, or set your API key:
                </p>
                <CmdBlock cmd="export OPENAI_API_KEY=sk-..." />
                <div style={{
                  marginTop: 16, padding: '12px 14px',
                  background: 'rgba(59,130,246,0.08)', borderRadius: 8,
                  border: '1px solid rgba(59,130,246,0.2)',
                  fontSize: 13, color: 'rgba(180,200,240,0.8)', lineHeight: 1.6,
                }}>
                  You need an <strong style={{ color: '#93c5fd' }}>OpenAI API key</strong> with access to Codex models.
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={recheck}
                disabled={rechecking}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, cursor: rechecking ? 'default' : 'pointer',
                  background: rechecking ? 'rgba(255,255,255,0.05)' : 'rgba(249,115,22,0.12)',
                  border: '1px solid rgba(249,115,22,0.3)',
                  color: rechecking ? 'rgba(255,255,255,0.3)' : '#f97316',
                  fontSize: 14, fontWeight: 500,
                }}
              >
                {rechecking ? 'Checking...' : 'Done, re-check'}
              </button>
              <button onClick={() => onDone(selectedProvider)} style={{
                padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 13,
              }}>
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Ready */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#f1f1f5' }}>
              {currentState === 'found' ? `${selectedProvider === 'claude' ? 'Claude Code' : 'Codex CLI'} is ready` : 'Agent ready'}
            </h3>

            {/* Show status of both agents */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
              <div style={{
                padding: '8px 16px', borderRadius: 8,
                background: claudeState === 'found' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${claudeState === 'found' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: claudeState === 'found' ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>
                  Claude Code {claudeState === 'found' ? '✓' : '✗'}
                </div>
                {claudeVersion && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{claudeVersion}</div>}
              </div>
              <div style={{
                padding: '8px 16px', borderRadius: 8,
                background: codexState === 'found' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${codexState === 'found' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: codexState === 'found' ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>
                  Codex CLI {codexState === 'found' ? '✓' : '✗'}
                </div>
                {codexVersion && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{codexVersion}</div>}
              </div>
            </div>

            <p style={{ margin: '0 0 28px', fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
              Open a project folder and start working. You can switch agents anytime from the header.
            </p>
            <button
              onClick={() => onDone(selectedProvider)}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 8, cursor: 'pointer',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                border: 'none', color: '#fff',
                fontSize: 15, fontWeight: 600, letterSpacing: '0.2px',
                boxShadow: '0 4px 20px rgba(249,115,22,0.35)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Open a Project
            </button>
          </div>
        )}

      </div>

      {/* Dismiss link at bottom */}
      {step !== 3 && (
        <button
          onClick={() => onDone(selectedProvider)}
          style={{
            marginTop: 20, background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.25)', fontSize: 13,
            cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Skip setup guide
        </button>
      )}
    </div>
  )
}
