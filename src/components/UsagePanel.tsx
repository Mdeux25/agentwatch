import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { loadAllUsageRecords } from '../lib/usageStorage'
import {
  aggregate,
  groupByDay,
  groupByProject,
  formatTokens,
  formatCost,
  todayRecords,
  currentMonthRecords,
} from '../lib/usageCalc'
import type { UsageRecord, UsageAggregate } from '../types/usage'

type Tab = 'session' | 'project' | 'all'

const DONUT_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899']

// ── SVG arc helper ────────────────────────────────────────────────────────────

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutArc(cx: number, cy: number, R: number, r: number, start: number, end: number) {
  const os = polarToXY(cx, cy, R, start)
  const oe = polarToXY(cx, cy, R, end)
  const is = polarToXY(cx, cy, r, start)
  const ie = polarToXY(cx, cy, r, end)
  const large = end - start > 180 ? 1 : 0
  return `M ${os.x} ${os.y} A ${R} ${R} 0 ${large} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${r} ${r} 0 ${large} 0 ${is.x} ${is.y} Z`
}

// ── 7-day cost bar chart ──────────────────────────────────────────────────────

function CostBarChart({ records }: { records: UsageRecord[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const today = new Date().toLocaleDateString('en-CA')

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return d.toLocaleDateString('en-CA')
    })
  }, [])

  const byDay = useMemo(() => groupByDay(records), [records])

  const costs = useMemo(() =>
    days.map(d => aggregate(byDay[d] ?? []).costUsd),
    [days, byDay]
  )

  const maxCost = Math.max(...costs, 0.01)
  const W = 276
  const barW = 30
  const gap = (W - 7 * barW) / 6
  const chartH = 36
  const labelY = 48

  const dayLetters = days.map(d => {
    const letter = ['S','M','T','W','T','F','S'][new Date(d + 'T12:00').getDay()]
    return letter
  })

  return (
    <div style={{ padding: '8px 10px 4px', flexShrink: 0 }}>
      <svg width={W} height={52} style={{ display: 'block', overflow: 'visible' }}>
        {/* Ceiling line */}
        <line x1={0} y1={0} x2={W} y2={0} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />

        {days.map((d, i) => {
          const x = i * (barW + gap)
          const cost = costs[i]
          const barH = Math.max(cost > 0 ? 2 : 0, (cost / maxCost) * chartH)
          const barY = chartH - barH
          const isToday = d === today
          const isHovered = hovered === i
          const fill = isHovered
            ? 'rgba(129,140,248,1)'
            : isToday
              ? '#818cf8'
              : 'rgba(99,102,241,0.75)'

          return (
            <g key={d}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}
            >
              {/* Background slot */}
              <rect x={x} y={0} width={barW} height={chartH} rx={3} fill="rgba(255,255,255,0.03)" />

              {/* Value bar */}
              {cost > 0 && (
                <rect x={x} y={barY} width={barW} height={barH} rx={3} fill={fill} />
              )}

              {/* Zero stub */}
              {cost === 0 && (
                <rect x={x} y={chartH - 2} width={barW} height={2} rx={1} fill="rgba(99,102,241,0.15)" />
              )}

              {/* Highlight cap on today */}
              {isToday && cost > 0 && (
                <rect x={x} y={barY} width={barW} height={1} rx={1} fill="rgba(255,255,255,0.35)" />
              )}

              {/* Hover cost label */}
              {isHovered && (
                <text
                  x={x + barW / 2} y={barY - 4}
                  textAnchor="middle"
                  fontSize={8}
                  fill="rgba(255,255,255,0.8)"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {formatCost(cost)}
                </text>
              )}

              {/* Day letter */}
              <text
                x={x + barW / 2} y={labelY}
                textAnchor="middle"
                fontSize={8}
                fill={isToday ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)'}
                fontFamily="'JetBrains Mono', monospace"
              >
                {dayLetters[i]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Token split bar ───────────────────────────────────────────────────────────

function TokenSplitBar({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) {
  const total = inputTokens + outputTokens
  if (total === 0) return null
  const W = 256
  const inW = Math.round((inputTokens / total) * W)
  const outW = W - inW
  const id = `clip-${inputTokens}-${outputTokens}`

  return (
    <div style={{ margin: '5px 0 3px' }}>
      <svg width={W} height={3} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id={id}>
            <rect x={0} y={0} width={W} height={3} rx={1.5} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id})`}>
          <rect x={0} y={0} width={W} height={3} fill="rgba(255,255,255,0.06)" />
          {inW > 0 && <rect x={0} y={0} width={inW} height={3} fill="rgba(99,102,241,0.7)" />}
          {outW > 0 && <rect x={inW} y={0} width={outW} height={3} fill="rgba(139,92,246,0.85)" />}
        </g>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 8, color: 'rgba(99,102,241,0.7)' }}>↑ {formatTokens(inputTokens)} in</span>
        <span style={{ fontSize: 8, color: 'rgba(139,92,246,0.85)' }}>{formatTokens(outputTokens)} out ↓</span>
      </div>
    </div>
  )
}

// ── Project donut ─────────────────────────────────────────────────────────────

function ProjectDonut({ byProject }: { byProject: Record<string, UsageRecord[]> }) {
  const [hoveredProject, setHoveredProject] = useState<string | null>(null)

  const projects = useMemo(() => {
    const entries = Object.entries(byProject)
      .map(([name, recs]) => ({ name, agg: aggregate(recs) }))
      .sort((a, b) => b.agg.costUsd - a.agg.costUsd)

    // Cap at 5 named slices + "Other"
    const top = entries.slice(0, 5)
    const rest = entries.slice(5)
    if (rest.length > 0) {
      const otherAgg = aggregate(rest.flatMap(e => byProject[e.name]))
      top.push({ name: 'Other', agg: otherAgg })
    }
    return top
  }, [byProject])

  const totalCost = projects.reduce((s, p) => s + p.agg.costUsd, 0)
  if (totalCost === 0) return null

  const cx = 138, cy = 58, R = 48, r = 34
  const GAP = 2 // degrees gap between arcs

  let angle = 0
  const arcs = projects.map((p, i) => {
    const sweep = (p.agg.costUsd / totalCost) * 360
    const start = angle + GAP / 2
    const end = angle + sweep - GAP / 2
    angle += sweep
    return { ...p, start, end, color: DONUT_COLORS[i] ?? 'rgba(255,255,255,0.15)' }
  })

  return (
    <div style={{ padding: '8px 10px 0', flexShrink: 0 }}>
      <svg width={276} height={116} style={{ display: 'block' }}>
        {arcs.map((arc, i) => {
          if (arc.end <= arc.start) return null
          const isHov = hoveredProject === arc.name
          return (
            <motion.path
              key={arc.name}
              d={donutArc(cx, cy, isHov ? R + 3 : R, r, arc.start, arc.end)}
              fill={arc.color}
              opacity={hoveredProject && !isHov ? 0.35 : 0.9}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: hoveredProject && !isHov ? 0.35 : 0.9 }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredProject(arc.name)}
              onMouseLeave={() => setHoveredProject(null)}
            />
          )
        })}

        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="'JetBrains Mono', monospace">
          {hoveredProject ?? 'total'}
        </text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={14} fontWeight={700} fill="rgba(255,255,255,0.9)" fontFamily="'JetBrains Mono', monospace">
          {formatCost(hoveredProject ? (projects.find(p => p.name === hoveredProject)?.agg.costUsd ?? 0) : totalCost)}
        </text>

        {/* Legend */}
        {arcs.map((arc, i) => {
          const col = i % 2
          const row = Math.floor(i / 2)
          const lx = col === 0 ? 10 : 148
          const ly = 86 + row * 14
          return (
            <g key={arc.name}
              onMouseEnter={() => setHoveredProject(arc.name)}
              onMouseLeave={() => setHoveredProject(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={lx} y={ly - 5} width={6} height={6} rx={1} fill={arc.color} opacity={hoveredProject && hoveredProject !== arc.name ? 0.35 : 0.9} />
              <text x={lx + 10} y={ly} fontSize={8} fill={hoveredProject && hoveredProject !== arc.name ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)'} fontFamily="'JetBrains Mono', monospace">
                {arc.name.slice(0, 12)}
              </text>
              <text x={col === 0 ? 138 : 276} y={ly} textAnchor="end" fontSize={8} fill={hoveredProject && hoveredProject !== arc.name ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)'} fontFamily="'JetBrains Mono', monospace">
                {formatCost(arc.agg.costUsd)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Row components ────────────────────────────────────────────────────────────

function TokenLine({ label, agg }: { label: string; agg: UsageAggregate }) {
  const total = agg.inputTokens + agg.outputTokens
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 10px' }}>
      <span style={{ color: '#6b7280', fontSize: 9 }}>{label}</span>
      <span style={{ color: '#d1d5db', fontSize: 9 }}>
        {formatCost(agg.costUsd)}
        <span style={{ color: '#4b5563', margin: '0 4px' }}>·</span>
        {formatTokens(total)} tok
      </span>
    </div>
  )
}

function TaskRow({ record, index }: { record: UsageRecord; index: number }) {
  const time = new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ padding: '6px 10px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#9ca3af', fontSize: 9, fontWeight: 600 }}>Task #{index + 1}</span>
        <span style={{ color: '#6366f1', fontSize: 9, fontWeight: 700 }}>{formatCost(record.costUsd)} <span style={{ color: '#374151', fontWeight: 400 }}>· {time}</span></span>
      </div>
      <div style={{ color: '#4b5563', fontSize: 9, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {record.taskPrompt || '(no prompt)'}
      </div>
      <TokenSplitBar inputTokens={record.inputTokens} outputTokens={record.outputTokens} />
    </div>
  )
}

function DayGroup({ date, records }: { date: string; records: UsageRecord[] }) {
  const agg = aggregate(records)
  const today = new Date().toLocaleDateString('en-CA')
  const label = date === today ? 'Today' : date
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '5px 10px 3px',
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ color: '#6b7280', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ color: '#9ca3af', fontSize: 8 }}>
          {formatCost(agg.costUsd)} · {formatTokens(agg.inputTokens + agg.outputTokens)} tok · {agg.taskCount} task{agg.taskCount !== 1 ? 's' : ''}
        </span>
      </div>
      {[...records].reverse().map((r, i) => <TaskRow key={r.id} record={r} index={records.length - 1 - i} />)}
    </div>
  )
}

function ProjectGroup({ name, records }: { name: string; records: UsageRecord[] }) {
  const agg = aggregate(records)
  const byDay = groupByDay(records)
  const sortedDays = Object.keys(byDay).sort().reverse()
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '6px 10px',
        background: 'rgba(99,102,241,0.07)',
        borderBottom: '1px solid rgba(99,102,241,0.15)',
      }}>
        <span style={{ color: '#818cf8', fontSize: 9, fontWeight: 700 }}>{name}</span>
        <span style={{ color: '#6b7280', fontSize: 9 }}>
          {formatCost(agg.costUsd)} · {agg.taskCount} tasks
        </span>
      </div>
      {sortedDays.map(d => (
        <DayGroup key={d} date={d} records={byDay[d]} />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function UsagePanel() {
  const { usagePanelOpen, toggleUsagePanel, sessionUsageRecords, projectRoot } = useStore()
  const [tab, setTab] = useState<Tab>('session')
  const [allRecords, setAllRecords] = useState<UsageRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!usagePanelOpen) return
    if (tab === 'session') return
    setLoading(true)
    loadAllUsageRecords()
      .then(setAllRecords)
      .catch(() => setAllRecords([]))
      .finally(() => setLoading(false))
  }, [tab, usagePanelOpen])

  // Reload summary on panel open or new session record
  useEffect(() => {
    if (!usagePanelOpen) return
    loadAllUsageRecords()
      .then(setAllRecords)
      .catch(() => {})
  }, [usagePanelOpen, sessionUsageRecords.length])

  const summaryAll   = useMemo(() => aggregate(allRecords), [allRecords])
  const summaryToday = useMemo(() => aggregate(todayRecords(allRecords)), [allRecords])
  const summaryMonth = useMemo(() => aggregate(currentMonthRecords(allRecords)), [allRecords])

  const sessionContent = useMemo(() => [...sessionUsageRecords].reverse(), [sessionUsageRecords])

  const projectRecords = useMemo(() => {
    if (!projectRoot) return []
    return allRecords.filter(r => r.projectRoot === projectRoot)
  }, [allRecords, projectRoot])
  const projectByDay  = useMemo(() => groupByDay(projectRecords), [projectRecords])
  const projectDays   = useMemo(() => Object.keys(projectByDay).sort().reverse(), [projectByDay])

  const allByProject  = useMemo(() => groupByProject(allRecords), [allRecords])
  const allProjects   = useMemo(() => Object.keys(allByProject).sort(), [allByProject])

  const tabStyle = (t: Tab): React.CSSProperties => ({
    fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '2px 6px', borderRadius: 3, cursor: 'pointer', border: 'none',
    background: tab === t ? 'rgba(99,102,241,0.25)' : 'transparent',
    color: tab === t ? '#818cf8' : '#4b5563',
  })

  return (
    <AnimatePresence>
      {usagePanelOpen && (
        <motion.div
          key="usage-panel"
          initial={{ opacity: 0, x: -10, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -10, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'absolute',
            top: 36, left: 12, zIndex: 20,
            width: 296,
            maxHeight: 'calc(100% - 56px)',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(4, 7, 16, 0.93)',
            border: '1px solid rgba(99, 102, 241, 0.22)',
            borderRadius: 8,
            overflow: 'hidden',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '6px 10px',
            borderBottom: '1px solid rgba(99, 102, 241, 0.13)',
            background: 'rgba(8, 12, 26, 0.85)',
            gap: 6, flexShrink: 0,
          }}>
            <span style={{ color: '#6366f1', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>USAGE</span>
            <button style={tabStyle('session')} onClick={() => setTab('session')}>Session</button>
            <button style={tabStyle('project')} onClick={() => setTab('project')}>Project</button>
            <button style={tabStyle('all')} onClick={() => setTab('all')}>All Time</button>
            <div style={{ flex: 1 }} />
            <button onClick={toggleUsagePanel}
              style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 2 }}
            >×</button>
          </div>

          {/* Summary strip */}
          <div style={{
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
            background: 'rgba(0,0,0,0.2)',
          }}>
            <div style={{ padding: '4px 0 0' }}>
              <TokenLine label="Today"      agg={summaryToday} />
              <TokenLine label="This month" agg={summaryMonth} />
              <TokenLine label="All time"   agg={summaryAll} />
            </div>
            {/* 7-day bar chart */}
            <CostBarChart records={allRecords} />
          </div>

          {/* Tab content */}
          <div style={{ overflowY: 'auto', flex: 1 }} className="custom-scrollbar">

            {/* Session tab */}
            {tab === 'session' && (
              sessionContent.length === 0
                ? <div style={{ color: '#374151', fontSize: 9, padding: '20px 10px', textAlign: 'center' }}>No tasks this session yet.</div>
                : sessionContent.map((r, i) => <TaskRow key={r.id} record={r} index={sessionContent.length - 1 - i} />)
            )}

            {/* Project tab */}
            {tab === 'project' && !loading && (
              projectDays.length === 0
                ? <div style={{ color: '#374151', fontSize: 9, padding: '20px 10px', textAlign: 'center' }}>No usage for this project yet.</div>
                : projectDays.map(d => <DayGroup key={d} date={d} records={projectByDay[d]} />)
            )}

            {/* All Time tab */}
            {tab === 'all' && !loading && (
              allProjects.length === 0
                ? <div style={{ color: '#374151', fontSize: 9, padding: '20px 10px', textAlign: 'center' }}>No usage recorded yet.</div>
                : <>
                    <ProjectDonut byProject={allByProject} />
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
                      {allProjects.map(name => (
                        <ProjectGroup key={name} name={name} records={allByProject[name]} />
                      ))}
                    </div>
                  </>
            )}

            {loading && (
              <div style={{ color: '#374151', fontSize: 9, padding: '20px 10px', textAlign: 'center' }}>Loading…</div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
