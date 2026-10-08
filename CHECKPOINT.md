# AnnotationVisualized Project Checkpoint

Date: 2026-10-08

## Project status

The application is a working MVP for annotating a document and viewing the annotations as an interactive graph. Browser functionality has been manually tested and is satisfactory for the current usage. The active implementation is TypeScript + React + Vite on the frontend, with a minimal FastAPI backend retained only for health checking.

## How to run

From the repository root:

```powershell
./av
```

The launcher starts:

- Vite at `http://localhost:5173`
- FastAPI/Uvicorn at `http://localhost:8000`

Ctrl+C stops both processes. On systems where the Bash launcher is not available, the repository also contains `av.ps1` and `av.cmd` launchers if present in the local checkout.

Useful development commands:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

The current verification baseline is 17 passing Vitest tests and a successful production build.

## Important files

- `src/App.tsx` — application state, panels, keyboard handling, persistence, import/export, graph interaction, and active UI components.
- `src/domain.ts` — pure workspace operations and import validation.
- `src/types.ts` — TypeScript workspace, node, assignment, path, and graph-view types.
- `src/domain.test.ts` — unit tests for workspace operations.
- `src/styles.css` — layout, themes, graph canvas, node/path visuals, hints, and editor styling.
- `index.html` — document shell and `AV Workspace` browser title.
- `backend/main.py` — FastAPI health endpoint only; it does not save workspace data.
- `idea.txt` — original product/MVP specification.

## Current data model

```ts
interface Workspace {
  text: string;
  nodes: NodeData[];
  paths: PathData[];
  view?: { x: number; y: number; scale?: number };
}

interface NodeData {
  id: string;
  assignments: { start: number; end: number }[];
  color: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface PathData {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  style?: PathStyle;
}
```

The document text is authoritative. Assignments store character offsets only; displayed node text is derived from `workspace.text`.

## Text and annotation behavior

The text panel has two modes:

- `Edit` — normal textarea editing. Graph shortcuts are disabled here.
- `Annotate` — text editing is disabled and browser text selection drives graph operations.

Annotate shortcuts:

- `N` — create a node from the selected range.
- `A` — assign the selected range to the selected node.
- `X` — remove assignments from the selected range.

Each character can belong to at most one node. Assigning a selected range removes overlapping ownership from all other nodes, preserves unaffected fragments, and deletes nodes that become empty. Removing the last assignment from a node also removes paths connected to that node.

Clicking assigned text selects its node and focuses the corresponding graph node. Hovering text or nodes highlights the counterpart. Multiple assignments displayed in a node use separate lines and horizontal dividers; long content wraps within the node and truncates only when it exceeds available space.

## Graph behavior

- Nodes have stable, distinguishable generated colors.
- Nodes use solid graph-surface backgrounds with colored borders.
- Nodes can be moved by dragging their body.
- Nodes can be resized from the bottom-right corner.
- Node size has no artificial maximum cap.
- The graph is an open-world canvas.
- Dragging empty grid space pans the graph.
- Wheel scrolling zooms around the pointer.
- Pan and zoom state persists in `workspace.view`.
- Clicking a node selects it and highlights its assigned text.
- Clicking empty graph space clears selection.
- `Delete` or `Backspace` deletes a selected node.
- `Escape` clears selection/path mode.

Path creation:

1. Select a node.
2. Press `P`.
3. Select a different destination node.

Duplicate paths and self-links are rejected. A selected path can be deleted with `Delete` or `Backspace`. Path style keys are:

1. Undirected solid
2. Undirected dashed
3. Directed way 1
4. Directed way 2
5. Bidirectional

The active graph hint explains path selection and these style keys. The old `P connect` text has been removed from the text panel tip.

## Persistence and file operations

- Current workspace is automatically saved to browser `localStorage` under `av-workspace`.
- Theme is saved under `av-theme`.
- Graph node geometry and viewport are part of the workspace and therefore persist locally and in JSON exports.
- JSON export downloads `av-workspace.json`.
- JSON import validates text, node IDs, assignment ranges, path IDs, node references, optional view data, and path styles.
- There is intentionally no backend workspace save/load feature or save button.

## UI and branding

- Product name: `AnnotationVisualized`.
- Browser title: `AV Workspace`.
- Solarized light/dark theme toggle is in the top-right toolbar beside JSON controls.
- The help button, graph logo, old panel headers, separate edit-mode buttons, and backend save UI were removed.
- Text edit and annotate switching lives inside the Text panel.
- Text and Graph panels can be swapped.
- The center divider is pointer-resizable.

## Undo and redo

Global `Ctrl+Z` / `Cmd+Z` undo and `Ctrl+Y` / `Cmd+Y` redo workspace changes. `Ctrl+Shift+Z` also redoes. Text-editor browser defaults are intercepted so workspace history remains consistent. Text edits, node operations, path operations, geometry edits, and graph viewport changes participate in the current history mechanism.

## Backend scope

`backend/main.py` exposes only:

```text
GET /api/health -> {"ok": true}
```

Do not reintroduce server-side workspace persistence unless the product direction changes. JSON files and browser-local persistence are the intended storage mechanisms.

## Known caveats and follow-up opportunities

1. Automated coverage is currently unit-level (`src/domain.test.ts`); there is no browser end-to-end test suite.
2. Runtime editing enforces exclusive character ownership, but `validateWorkspace` does not currently reject overlapping assignments in an imported JSON file. Add that check if imported files must be held to the same invariant.
3. Accessibility has not had a dedicated audit. Keyboard interaction works for the primary workflows, but future work could add stronger focus states, labels, and screen-reader semantics.
4. The current UI uses a DOM post-processing effect for multi-assignment node separators. If node rendering is substantially refactored, preserve the separate-line/divider behavior in the JSX rather than regressing to a dot-joined label.
5. The source is intentionally compact in places, with several components rendered as dense JSX expressions. Refactoring should preserve the active `GraphPanelInteractive` component and avoid reintroducing the removed legacy graph implementation.

## Safe handoff checklist

Before making changes:

1. Read `idea.txt`, this checkpoint, and the relevant sections of `src/App.tsx` and `src/domain.ts`.
2. Run `npm.cmd test` and `npm.cmd run build` to establish a baseline.
3. Keep workspace shape backward-compatible when possible; optional `view`, geometry, and path-style fields already support older JSON files.
4. Preserve the exclusive assignment invariant for all new assignment operations.
5. Verify both Solarized themes and both panel orders after UI changes.
6. Re-run tests and the production build before handing off.
