# Claude Avatar — Visual Agent Debugger: Implementation Plan

## The Core Shift

Right now the app shows Claude touching **files**.
The goal is to show Claude **thinking through a codebase** —
following its reasoning from intent → symbol → dependency → change.

Code is not lines. It's structure, flow, relationships.
The visual should match that.

---

## Feature 1: Symbol-Level Activity Map

**What**: Individual functions/classes light up in the treemap and editor,
not entire files. Claude reads `validateToken()`, not `auth.ts`.

**Why first**: Highest impact, lowest effort. All the infrastructure exists —
`parseSymbols()` already extracts symbols + line numbers, tool_use events
carry `start_line`/`end_line` for Edit events.

### Data model

```typescript
// Add to store
interface SymbolHit {
  filePath: string
  symbolName: string
  symbolKind: 'function' | 'class' | 'variable' | 'type'
  line: number
  hitCount: number
  lastHitAt: number
}

// New store fields
symbolHits: Map<string, SymbolHit>   // key: `${filePath}::${symbolName}`
setSymbolHit: (hit: SymbolHit) => void
```

### Implementation

**`src/store/useStore.ts`**
- When a `tool_use` event arrives with `file_path` + `start_line`, call
  `parseSymbols(fileContent, ext)` and find which symbol contains `start_line`.
- Add it to `symbolHits` map, incrementing `hitCount`.

**`src/components/scene/TreemapScene.tsx`**
- File tiles: add small colored dots along the bottom edge, one per unique
  symbol touched. Color matches symbol kind (function=blue, class=purple, etc).
- Pulse animation on the tile if any of its symbols were touched in last 3s.

**`src/components/CodeEditorPanel.tsx`**
- Highlight the active symbol's range with a subtle left-border glow
  (already know the line range from `parseSymbols`).
- Symbol chips in header show hit counts: `ƒ validateToken ×3`

### Files to change
| File | Change |
|---|---|
| `src/store/useStore.ts` | Add `symbolHits`, `setSymbolHit`; update `addEvent` to resolve symbol on tool_use |
| `src/components/scene/TreemapScene.tsx` | Render symbol dots on file tiles |
| `src/components/CodeEditorPanel.tsx` | Highlight active symbol range; show hit counts on chips |
| `src/lib/symbolParser.ts` | Add `findSymbolAtLine(symbols, line)` utility |

---

## Feature 2: Dependency Blast Radius

**What**: When Claude edits a file, all files that import it glow amber in
the treemap — showing the "blast radius" before the change lands.

**Why**: Makes impact of changes immediately visible spatially.

### Data model

```typescript
interface DependencyGraph {
  imports: Record<string, string[]>     // file → files it directly imports
  importedBy: Record<string, string[]>  // file → files that import it (reverse)
}

// Store field
depGraph: DependencyGraph | null
buildDepGraph: () => void   // triggered after scan completes
```

### Implementation

**`src/lib/depGraph.ts`** (new file)

Parse imports with regex (good enough for JS/TS/Python):
```typescript
// JS/TS
/(?:import|from)\s+['"]([^'"]+)['"]/g
/require\(['"]([^'"]+)['"]\)/g

// Python
/^(?:import|from)\s+(\S+)/gm
```

Resolve relative paths to absolute using `projectRoot`.
Build both forward (`imports`) and reverse (`importedBy`) maps.

**Trigger**: After `loadPaths()` completes, read each file and parse its imports.
Run in a `setTimeout` chain to avoid blocking the UI thread (100 files at a time).

**`src/components/scene/TreemapScene.tsx`**
- When `activeFileId` changes (Claude is working on a file), look up
  `depGraph.importedBy[activeFileId]` → color those tiles amber with low
  emissive intensity (warning glow, not full active).
- Show count badge: "3 dependents" on the active file tile.

### Files to create/change
| File | Change |
|---|---|
| `src/lib/depGraph.ts` | **Create** — import parser + graph builder |
| `src/store/useStore.ts` | Add `depGraph`, `buildDepGraph` |
| `src/App.tsx` | Call `buildDepGraph()` after `loadPaths()` |
| `src/components/scene/TreemapScene.tsx` | Amber tint for dependent files |

---

## Feature 3: Live Reasoning Extraction

**What**: Parse Claude's `thinking` events in real time and extract structured
state — current goal, hypothesis, uncertainty, next action. Show as a live
panel, not raw text.

**Why**: This is the most emotionally resonant feature. Watching Claude's
reasoning structured in real time makes the agent feel transparent and
understandable. Raw thinking text is noise; extracted structure is signal.

### Extracted schema

```typescript
interface AgentReasoning {
  currentGoal: string | null       // "fix token expiry bug"
  approach: string | null          // "modify validateToken, not decode"
  uncertainty: string | null       // "not sure if this affects refresh flow"
  filesOfInterest: string[]        // files mentioned in thinking
  symbolsOfInterest: string[]      // function/class names mentioned
  confidence: 'high' | 'medium' | 'low'
  updatedAt: number
}
```

### Implementation

**`src/lib/reasoningParser.ts`** (new file)

Pattern matching on thinking text:
```typescript
// Goal detection
/(?:I need to|I should|The goal is|I want to|My task is)\s+(.+?)(?:\.|$)/i

// Approach detection
/(?:I'll|I will|I'm going to|The best approach is)\s+(.+?)(?:\.|$)/i

// Uncertainty detection
/(?:I'm not sure|unclear|I don't know|might|could be)\s+(.+?)(?:\.|$)/i

// Confidence: count hedging words vs confident words
```

File/symbol extraction: scan for known filePaths and CamelCase/snake_case
identifiers that match the project's symbol map.

**`src/components/ReasoningPanel.tsx`** (new file)

Compact panel (fits in the bottom strip or as a floating card):
```
┌─────────────────────────────────────────────┐
│ ● CLAUDE IS THINKING                        │
│                                             │
│ Goal        fix token expiry bug            │
│ Looking at  auth.ts → validateToken()       │
│ Hypothesis  expiry check uses wrong TZ      │
│ Uncertain   may affect refresh flow         │
│ Confidence  ████░░░░ medium                 │
└─────────────────────────────────────────────┘
```

### Files to create/change
| File | Change |
|---|---|
| `src/lib/reasoningParser.ts` | **Create** — pattern extraction |
| `src/components/ReasoningPanel.tsx` | **Create** — structured display |
| `src/App.tsx` | Feed `thinking` events into reasoning parser; show panel |
| `src/store/useStore.ts` | Add `agentReasoning: AgentReasoning \| null` |

---

## Feature 4: Session Timeline Scrubber

**What**: A horizontal timeline at the bottom of the screen showing every
agent action as a colored dot. Scrub to any point and the entire treemap
rewinds to that state.

**Why**: Turns a session into a story you can replay. Essential for understanding
what the agent did and why, post-hoc.

### Data model

No new data needed — `events[]` in the store already has everything with
timestamps. The scrubber is purely derived from events.

```typescript
// New UI state (local, not store)
const [scrubIndex, setScrubIndex] = useState<number | null>(null)

// Derived: if scrubIndex is set, compute treemap from events[0..scrubIndex]
const visibleEvents = scrubIndex !== null ? events.slice(0, scrubIndex) : events
```

### Implementation

**`src/components/SessionTimeline.tsx`** (new file)

```
[  ●  ·  ●●  ···  ●  ●●●  ·  ●  ●●  ··  ●  ]
 0s  10s  20s  30s  40s  50s  1m  1m10s
 ^drag to scrub
```

- Each dot = one event. Color by type:
  - Blue = tool_use (Read)
  - Orange = tool_use (Edit/Write)
  - Purple = thinking
  - Green = assistant_message
- Hover shows tooltip: "Edit auth.ts:47"
- Drag scrubs: treemap shows only events up to that point
- "Live" button jumps back to present

**Scrub integration**: When `scrubIndex` is set, pass filtered events to the
treemap layout so it only shows files touched up to that point. The editor
also shows the file content at that scrub point (from edit history).

### Files to create/change
| File | Change |
|---|---|
| `src/components/SessionTimeline.tsx` | **Create** — timeline scrubber |
| `src/App.tsx` | Add timeline to bottom strip; pass scrubIndex down |
| `src/components/scene/TreemapScene.tsx` | Accept filtered event set for scrubbed state |

---

## Feature 5: Call Graph 3D Scene (The Big One)

**What**: A third scene mode alongside treemap and spread-tree. Click a file
and the 3D space transforms into a force-directed graph of that file's
internal call relationships. Functions are nodes, calls between them are edges.
Claude's active symbol glows.

**Why**: This is the "treat code as structured flow, not lines" feature.
A function that calls 6 others is immediately legible as a hub node.
Deep call chains are visible as paths.

### Implementation

**`src/lib/callGraph.ts`** (new file)

Extract function calls from file content using regex (good enough for JS/TS):
```typescript
// Find all function definitions and their bodies
// Within each body, find function calls
// Build adjacency list: functionName → string[]
```

For accuracy: use simple heuristics — look for `functionName(` patterns inside
each function's line range (already known from `parseSymbols`).

**`src/components/scene/CallGraphScene.tsx`** (new file)

- Nodes: function/class boxes (same visual language as file tiles but smaller)
- Edges: curved lines between nodes (Three.js `TubeGeometry` along a QuadraticBezierCurve3)
- Layout: simple force simulation (repel nodes, attract connected ones) —
  run in a `useMemo` with a fixed number of iterations for performance
- Active symbol: glows, camera focuses on it
- Hover: shows function signature tooltip

**Scene mode integration**: Add `'callgraph'` to `sceneMode` in the store.
The toggle button cycles: `treemap → tree → callgraph → treemap`.
CallGraphScene renders when `activeFileId` is set and `sceneMode === 'callgraph'`.

### Files to create/change
| File | Change |
|---|---|
| `src/lib/callGraph.ts` | **Create** — call relationship extractor |
| `src/components/scene/CallGraphScene.tsx` | **Create** — force-directed 3D graph |
| `src/store/useStore.ts` | Add `'callgraph'` to sceneMode union |
| `src/App.tsx` | Add callgraph toggle; pass activeFile to CallGraphScene |

---

## Build Order

```
Phase 1 (build now, high signal-to-noise)
  └── Feature 1: Symbol-level activity map
  └── Feature 2: Dependency blast radius

Phase 2 (the emotionally resonant stuff)
  └── Feature 3: Live reasoning extraction
  └── Feature 4: Session timeline scrubber

Phase 3 (the show-stopper for demos)
  └── Feature 5: Call graph 3D scene
```

---

## What this makes Claude Avatar into

After Phase 3, the product is:

**A spatial debugger for AI agents** — the only tool where you can watch an
agent's reasoning, trace its file activity to the symbol level, understand
dependency impact before changes land, replay a session like a film, and
zoom from the whole codebase into a single function's call graph.

No other tool does this. Not Cursor, not Copilot, not Devin's dashboard.
This is the observability layer that the AI coding era needs.
