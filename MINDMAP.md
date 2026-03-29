# Code Mind Map Tab — Implementation Plan

## Context
When the user opens a file in AgentWatch, a visual mind map shows the code's structure and dependencies as an interactive node graph. Files are nodes containing their symbols (functions, classes); import edges connect files. Unexplored dependencies appear as "black box" nodes that expand when opened. The map grows iteratively as more files are explored and is saved to `.agentwatch/mindmap.json` inside the project for persistence across sessions.

---

## Data Model

**New file `src/types/mindMap.ts`:**

```typescript
interface MapNode {
  id: string            // filePath for file nodes, package name for externals
  kind: 'file' | 'external'
  label: string         // display name (filename or npm package)
  filePath: string
  isBlackBox: boolean   // not yet explored — grayed out
  symbols: FileSymbol[] // from parseSymbols() — empty if blackBox
  x: number             // force layout position (saved)
  y: number
}

interface MapEdge {
  id: string
  source: string        // node id
  target: string        // node id
  kind: 'imports'
}

interface MindMapData {
  nodes: Record<string, MapNode>
  edges: MapEdge[]
}
```

---

## Files to Create

### `src/types/mindMap.ts`
MapNode, MapEdge, MindMapData interfaces.

### `src/lib/mindMapBuilder.ts`

Core logic — pure functions:

```typescript
export function buildFileMapDelta(
  filePath: string,
  content: string,
  ext: string,
  projectRoot: string,
  existingNodes: Record<string, MapNode>
): { nodes: MapNode[], edges: MapEdge[] }
```

**Logic:**
1. Call `parseSymbols(content, ext)` from `src/lib/symbolParser.ts` → `FileSymbol[]`
2. Parse imports via regex:
   - JS/TS: `/(?:import|from)\s+['"]([^'"]+)['"]/g` + `/require\(['"]([^'"]+)['"]\)/g`
   - Python: `/^(?:import|from)\s+(\S+)/gm`
3. Resolve relative paths (e.g. `./utils`) → absolute using `projectRoot` + current file's dir
4. For each import:
   - Relative path → file node (`isBlackBox: true` if not in `existingNodes`)
   - npm package → external node (`kind: 'external'`, `isBlackBox: true`)
   - Already in `existingNodes` → just add edge, no new node
5. Current file's node: `isBlackBox: false`, `symbols` populated, expand its black box if it existed
6. New nodes get random position near canvas center if not yet positioned
7. Return `{ nodes, edges }` to merge into store

### `src/lib/mindMapStorage.ts`

```typescript
const MAP_SUBPATH = '.agentwatch/mindmap.json'

export async function loadMindMap(projectRoot: string): Promise<MindMapData | null>
// readFileFull(projectRoot + '/' + MAP_SUBPATH) → JSON.parse → MindMapData
// returns null on error (file not found)

export async function saveMindMap(projectRoot: string, data: MindMapData): Promise<void>
// JSON.stringify(data, null, 2) → writeFile(path, content)
// writeFile creates parent dirs (see Rust change below)
```

### `src/components/MindMapPanel.tsx`

Container panel:

```
┌─────────────────────────────────────────────────┐
│  [⟳ Reset layout]  [⊕]  [⊖]  [🗑 Clear map]    │  ← toolbar
├─────────────────────────────────────────────────┤
│                                                 │
│           <ForceCanvas />                       │
│                                                 │
│   (empty state: "Open a file to start mapping") │
└─────────────────────────────────────────────────┘
```

Reads `mindMapData` from store. Passes node drag callbacks to `ForceCanvas` (updates node x/y in store → triggers debounced save).

### `src/components/mindmap/ForceCanvas.tsx`

SVG viewport with:
- **Pan/zoom:** `viewBox` adjusted on mouse wheel + drag on SVG background
- **Force sim:** `requestAnimationFrame` loop, runs for up to 300 frames after nodes added, stops when settled

```typescript
// Simple Verlet-style simulation
function tick(nodes, edges, velocities) {
  const REPULSION = 8000    // node-node repulsion
  const SPRING_K  = 0.04   // edge spring attraction
  const IDEAL_DIST = 200   // target edge length px
  const DAMPING   = 0.8

  // O(n²) repulsion — fine for <150 nodes
  // Spring attraction along each edge
  // Apply velocities × DAMPING, clamp max movement
}
```

- **Node drag:** `onPointerDown` on node → delta tracking → update position in store
- **Edges:** SVG `<path>` quadratic bezier curves with arrowhead `<marker>`

### `src/components/mindmap/MapNodeEl.tsx`

SVG group per file node:

```
Explored:                          Black box (unexplored):
┌──────────────────────┐           ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│ ▐ auth.ts            │             ░ utils.ts
│──────────────────────│           └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
│  ƒ validateToken     │           onClick → setActiveFileId()
│  ƒ decodeJWT         │
│  © AuthService       │
└──────────────────────┘
  left border = EXT_COLOR[ext]
  symbol colors = SYMBOL_COLORS
```

- Width: 160px. Height: 36px header + 20px per symbol (max 6 shown + "+N more")
- Active file: accent glow border using `--ide-accent`
- Black box click → `setActiveFileId(filePath)` → file loads → node expands

---

## Files to Modify

### `src/store/useStore.ts`

```typescript
mindMapData: MindMapData | null
setMindMapData: (data: MindMapData | null) => void
addFileToMindMap: (filePath: string, content: string, ext: string, projectRoot: string) => void
```

`mindMapData` is NOT reset by `clearSession()` — map persists across chat clears.

### `src/App.tsx`

1. **State:** `const [editorTab, setEditorTab] = useState<'code' | 'mindmap'>('code')`
2. **Tab button** after the file tab:
   ```tsx
   <button className={`ide-tab ${editorTab === 'mindmap' ? 'active' : ''}`}
     onClick={() => setEditorTab('mindmap')}>
     ◈ Mind Map
   </button>
   ```
3. **Hook into file load** (after `setActiveFileContent(content)`):
   ```typescript
   if (projectRoot) addFileToMindMap(node.id, content, node.ext, projectRoot)
   ```
4. **Panel render:**
   ```tsx
   {editorTab === 'code'    && <CodeEditorPanel />}
   {editorTab === 'mindmap' && <MindMapPanel />}
   ```
5. **Load on project open** (in `openProject` after `loadPaths`):
   ```typescript
   const saved = await loadMindMap(path)
   if (saved) setMindMapData(saved)
   ```
6. **Auto-save** (debounced 2s on `mindMapData` change):
   ```typescript
   useEffect(() => {
     if (!mindMapData || !projectRoot) return
     const t = setTimeout(() => saveMindMap(projectRoot, mindMapData), 2000)
     return () => clearTimeout(t)
   }, [mindMapData])
   ```

### `src-tauri/src/lib.rs`

Modify `write_file` to create parent directories:

```rust
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
  let p = std::path::Path::new(&path);
  if let Some(parent) = p.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  std::fs::write(&path, content).map_err(|e| e.to_string())
}
```

---

## Visual Design

| Element | Style |
|---|---|
| Canvas bg | `#1e1e1e` (`--ide-bg`) |
| Explored node fill | `rgba(255,255,255,0.04)`, left border = `EXT_COLOR[ext]` |
| Black box fill | `#111`, dashed border `#3e3e42` |
| Symbol chip | Colored dot + label (`SYMBOL_COLORS` from symbolParser.ts) |
| Edge | `rgba(255,255,255,0.18)` line + arrowhead |
| Active file node | `--ide-accent` glow border |
| Node hover | `rgba(255,255,255,0.08)` fill |

---

## Reusing Existing Code

| What | From |
|---|---|
| `parseSymbols(content, ext)` | `src/lib/symbolParser.ts` |
| `SYMBOL_COLORS` | `src/lib/symbolParser.ts` |
| `readFileFull()` / `writeFile()` | `src/lib/tauri.ts` |
| `EXT_COLOR` map | `src/App.tsx` (copy to mindMapBuilder) |
| `activeFileContent` + `activeFileId` | Already loaded in App.tsx — just hook into that effect |

---

## All Files

| File | Action |
|---|---|
| `src/types/mindMap.ts` | **Create** — MapNode, MapEdge, MindMapData |
| `src/lib/mindMapBuilder.ts` | **Create** — buildFileMapDelta() |
| `src/lib/mindMapStorage.ts` | **Create** — loadMindMap(), saveMindMap() |
| `src/components/MindMapPanel.tsx` | **Create** — panel container + toolbar |
| `src/components/mindmap/ForceCanvas.tsx` | **Create** — SVG force layout, pan/zoom |
| `src/components/mindmap/MapNodeEl.tsx` | **Create** — file node SVG element |
| `src/store/useStore.ts` | **Modify** — mindMapData state + addFileToMindMap |
| `src/App.tsx` | **Modify** — editorTab, tab button, file load hook, load/save |
| `src-tauri/src/lib.rs` | **Modify** — write_file: add create_dir_all |

---

## Feature: Pseudo-Code Expand Panel

Validated visually in `mindmap-preview.html`. Clicking a symbol row (▸) in an explored node opens a floating panel with color-coded pseudo-code derived from the real function body.

### Trigger & UX
- Each symbol row has a transparent hit-rect + `▸` indicator (when pseudo-code exists)
- Click → positioned floating panel appears to the right of the symbol row
- Dismiss on outside click or × button

### Panel Layout
```
┌────────────────────────────────────┐
│ [async] fetchNews              ×   │
│ ─────────────────────────────────  │
│ // reset pagination on filter...   │  comment (dark green italic)
│ if resetPage → page = 1            │  keyword (indigo)
│ isLoading = true                   │  assign (gray)
│ params = { topic, language, ... }  │  param (amber)
│ GET /api/news?params               │  call (cyan)
│ → articles = paginate or append    │  arrow (orange)
└────────────────────────────────────┘
```

### Positioning
```typescript
// Convert SVG world coords to screen coords for panel placement
function svgToScreen(wx: number, wy: number) {
  return { x: wx * vpScale + vpOffsetX, y: wy * vpScale + vpOffsetY }
}
// Clamp to window bounds before positioning
```

### Pseudo-Code Generation
In `src/lib/symbolParser.ts` — add `extractPseudo(lines, startLine, endLine)`:
1. Extract raw lines for the symbol using `startLine`/`endLine` from `parseSymbols()`
2. Simplify to 4–8 steps, classifying each line:
   - Guards/early returns → `keyword`
   - State mutations → `assign`
   - Async calls / HTTP → `call`
   - Result assignments from calls → `arrow`
   - Key comments → `comment`
   - Multi-line params → `param`
3. Store as `symbol.pseudo: PseudoLine[]`

### New Types (add to `src/types/mindMap.ts`)
```typescript
interface PseudoLine {
  t: 'comment' | 'keyword' | 'assign' | 'call' | 'arrow' | 'param'
  l: string
}
// FileSymbol in symbolParser.ts gets: pseudo?: PseudoLine[]
```

### Files for This Feature
| File | Change |
|---|---|
| `src/types/mindMap.ts` | Add `PseudoLine` interface |
| `src/lib/symbolParser.ts` | Add `pseudo?: PseudoLine[]` to `FileSymbol`; add `extractPseudo()` |
| `src/lib/mindMapBuilder.ts` | Call `extractPseudo()` when building explored node symbols |
| `src/components/mindmap/MapNodeEl.tsx` | Render `▸` indicator + click handler |
| `src/components/mindmap/PseudoPanel.tsx` | **Create** — floating panel with color-coded lines |
| `src/components/mindmap/ForceCanvas.tsx` | Pass current SVG transform to `PseudoPanel` for coord conversion |

---

## Verification

1. `npm run tauri dev` → open a TypeScript project
2. Click a `.ts` file → switch to **◈ Mind Map** tab → file node with symbol chips appears
3. Click a black box dependency → opens in editor → node expands, edge connects them
4. Click a `▸` symbol row → pseudo-code panel appears next to the row
5. Drag nodes to new positions → positions persist
6. Close and reopen project → map loads from `.agentwatch/mindmap.json`
7. Open 5+ files → graph grows with all import edges
8. Click "Reset layout" → force sim re-runs, nodes rearrange
