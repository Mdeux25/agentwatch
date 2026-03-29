# AgentWatch Demo Recording Script

## Setup (before recording)
- Open a **real, medium-sized project** (not a toy — something with 50–150 files). A Node/Express API or a React app works great.
- Make sure the project is NOT already loaded (start from the welcome screen).
- Have a good prompt ready to paste — something that causes Claude to touch 3–4 files.
- Disable notifications, hide the Dock, use full screen.
- Resolution: 1440p or 2560×1600 if possible.

---

## Scene 1 — The Welcome (0:00–0:15)
> *Goal: establish the aesthetic immediately*

- Show the welcome screen with the recent projects list
- Click **Open Folder** → pick the project folder
- Let the 3D treemap build itself — **don't cut this**, the animation is the hook
- Zoom in slowly on the treemap with scroll wheel to show label density appearing

---

## Scene 2 — The Map is Alive (0:15–0:35)
> *Goal: show the spatial awareness concept*

- Hover over a few file tiles to show the tooltips
- Click one file tile (e.g., a router or a main component) — watch the **FileSchemaCard** float up with symbols
- Switch to **Spread Tree** mode briefly to show the hierarchy view, then back to treemap
- Zoom back out to show the full codebase at once

---

## Scene 3 — Give Claude a Task (0:35–1:00)
> *Goal: the core loop — Claude works, you watch*

- Type a real, multi-file prompt into the chat input. Example:
  > *"Add input validation to the user registration endpoint and write a test for it"*
- Hit send — **keep camera on the 3D scene**
- Watch the **agent sphere** jump between files as Claude reads and edits
- Let the avatar dot pulse through thinking → working → speaking states
- Show the **live diff panel** streaming in as an edit happens — pause on it for 2 seconds

---

## Scene 4 — Mind Map (1:00–1:20)
> *Goal: the dependency graph as a second wow moment*

- Click the **Map tab**
- The file Claude just touched is already there as an expanded card with function names
- Click a black-box import card to expand it — watch it bloom into a full card
- Drag a few nodes around to show the force physics
- Click a function row to pop the **pseudo panel**

---

## Scene 5 — File Summary (1:20–1:35)
> *Goal: show the intelligence layer*

- Click on the file Claude just edited in the explorer
- Switch to the **Summary tab** — show the loading animation briefly
- When Claude's summary appears, slowly scroll through it
- Cut to the `.agentwatch/context/` folder briefly in Finder to show the files saved on disk

---

## Scene 6 — Usage Dashboard (1:35–1:45)
> *Goal: closing shot — you're in control*

- Click the coin icon to open the usage panel
- Show the task cost bar, the session total
- Close it

---

## Scene 7 — Pull Back (1:45–2:00)
> *Goal: end on the philosophy*

- Zoom the treemap all the way out
- The agent sphere is still hovering over the last file it touched
- Let the avatar dot idle/pulse for 3 seconds
- Fade to black with the tagline: **"Claude drives. You direct."**

---

## Recording Tips

| Thing | Recommendation |
|---|---|
| Tool | QuickTime (system audio) + ScreenStudio for overlays, or just QuickTime |
| Cursor | Use a cursor highlighter app (Cursor Pro or similar) |
| Speed | Don't rush — let the animations breathe |
| Audio | No voice-over for the first demo — let the visuals speak, add lofi music |
| Cuts | Hard cuts between scenes, no transitions — feels more confident |
| Length | Target **90–110 seconds** — anything longer loses attention |

---

## What NOT to show
- The settings or config screens
- Any errors or loading failures
- The chat log scrolling (it's not visually interesting) — keep focus on the 3D scene and map
