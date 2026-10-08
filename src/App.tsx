import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { Download, FileUp, Moon, PanelLeft, Redo2, Sun, Undo2, X } from 'lucide-react'
import type { Mode, NodeData, SelectionRange, Workspace } from './types'
import { addNode, assignRange as assignWorkspaceRange, clone, createPath as createWorkspacePath, deleteNode as deleteWorkspaceNode, deletePath as deleteWorkspacePath, removeRange as removeWorkspaceRange, setPathStyle, shiftAssignments, uniqueNodeColor, validateWorkspace } from './domain'

const initialText = 'A good idea becomes useful when its shape is visible.\n\nSelect a phrase in graph mode, make it a node, then connect ideas to reveal the structure hiding in the text.'
const blankWorkspace: Workspace = { text: initialText, nodes: [], paths: [] }
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    try { return JSON.parse(localStorage.getItem('av-workspace') || '') } catch { return clone(blankWorkspace) }
  })
  const [mode, setMode] = useState<Mode>('graph')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [range, setRange] = useState<SelectionRange | null>(null)
  const [pathSource, setPathSource] = useState<string | null>(null)
  const [leftPanel, setLeftPanel] = useState<'text' | 'graph'>('text')
  const [divider, setDivider] = useState(47)
  const [history, setHistory] = useState<Workspace[]>([])
  const [future, setFuture] = useState<Workspace[]>([])
  const geometryEditStarted = useRef(false)
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('av-theme') === 'light' ? 'light' : 'dark')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  useEffect(() => { localStorage.setItem('av-workspace', JSON.stringify(workspace)) }, [workspace])
  useEffect(() => { localStorage.setItem('av-theme', theme) }, [theme])
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 2600); return () => clearTimeout(t) }, [notice])

  const update = (next: Workspace, record = true) => { if (record) { setHistory(h => [...h.slice(-39), clone(workspace)]); setFuture([]) }; setWorkspace(next) }
  const notify = (message: string) => setNotice(message)
  const selected = workspace.nodes.find(n => n.id === selectedNode)
  const orderedPanels = leftPanel === 'text' ? ['text', 'graph'] : ['graph', 'text']
  const highlightedNodes = useMemo(() => new Set([hoveredNode, selectedNode].filter(Boolean)), [hoveredNode, selectedNode])

  const createNode = (assignmentRange: SelectionRange) => {
    if (assignmentRange.start === assignmentRange.end) return notify('Select some text first.')
    const index = workspace.nodes.length
    const node: NodeData = { id: uid('node'), color: uniqueNodeColor(workspace.nodes.map(existing => existing.color)), assignments: [{ ...assignmentRange }], x: 4 + (index % 3) * 31, y: 6 + Math.floor(index / 3) * 26, width: 24, height: 24 }
    update(addNode(workspace, node)); setSelectedNode(node.id); setRange(null); notify('Node created.')
  }
  const assignRange = (assignmentRange: SelectionRange) => {
    if (!selectedNode) return notify('Select a node before assigning text.')
    if (!assignmentRange.start && !assignmentRange.end) return notify('Select some text first.')
    update(assignWorkspaceRange(workspace, selectedNode, assignmentRange)); setRange(null); notify('Text assigned.')
  }
  const removeRange = (assignmentRange: SelectionRange) => {
    const next = removeWorkspaceRange(workspace, assignmentRange); update(next); if (selectedNode && !next.nodes.some(node => node.id === selectedNode)) setSelectedNode(null); setRange(null); notify('Assignments removed.')
  }
  const deleteNode = (id: string) => { update(deleteWorkspaceNode(workspace, id)); setSelectedNode(null); notify('Node deleted.') }
  const handleTextChange = (value: string) => update(shiftAssignments(workspace, workspace.text, value))
  const beginGeometryEdit = () => { if (!geometryEditStarted.current) { setHistory(h => [...h.slice(-39), clone(workspace)]); setFuture([]); geometryEditStarted.current = true } }
  const updateNodeGeometry = (id: string, geometry: Partial<Pick<NodeData, 'x' | 'y' | 'width' | 'height'>>) => setWorkspace(current => ({ ...current, nodes: current.nodes.map(node => node.id === id ? { ...node, ...geometry } : node) }))
  const updateGraphView = (view: { x: number; y: number; scale?: number }) => setWorkspace(current => ({ ...current, view }))
  const focusGraphNode = (id: string) => window.dispatchEvent(new CustomEvent('av-focus-node', { detail: id }))
  const endGeometryEdit = () => { geometryEditStarted.current = false }
  const undo = () => { const previous = history[history.length - 1]; if (!previous) return; setFuture(f => [clone(workspace), ...f]); setHistory(h => h.slice(0, -1)); setWorkspace(previous) }
  const redo = () => { const next = future[0]; if (!next) return; setHistory(h => [...h, clone(workspace)]); setFuture(f => f.slice(1)); setWorkspace(next) }

  const captureSelection = () => {
    if (!surfaceRef.current) return
    const selection = window.getSelection(); if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return setRange(null)
    const r = selection.getRangeAt(0); if (!surfaceRef.current.contains(r.commonAncestorContainer)) return
    const walker = document.createTreeWalker(surfaceRef.current, NodeFilter.SHOW_TEXT); let node: Node | null; let start = -1, end = -1, offset = 0
    while ((node = walker.nextNode())) { if (node === r.startContainer) start = offset + r.startOffset; if (node === r.endContainer) end = offset + r.endOffset; offset += node.textContent?.length || 0 }
    if (start >= 0 && end >= 0) setRange({ start: Math.min(start, end), end: Math.max(start, end) })
  }
  const handleKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || key === 'y')) {
      event.preventDefault()
      if (key === 'z' && !event.shiftKey) undo()
      else redo()
      return
    }
    if (mode !== 'graph') return
    if (['n', 'a', 'x', 'p', 'escape', 'delete', 'backspace'].includes(key) || (selectedPath !== null && ['1', '2', '3', '4', '5'].includes(key))) event.preventDefault()
    if (key === 'n' && range) createNode(range)
    if (key === 'a' && range) assignRange(range)
    if (key === 'x' && range) removeRange(range)
    if (selectedPath && ['1', '2', '3', '4', '5'].includes(key)) {
      const styles = ['undirected-solid', 'undirected-dash', 'directed-way1', 'directed-way2', 'bidirectional'] as const
      update(setPathStyle(workspace, selectedPath, styles[Number(key) - 1])); notify(`Path style ${key} selected.`)
    }
    else if (key === 'p' && selectedNode) { setPathSource(selectedNode); notify('Path mode: choose a destination node.') }
    if (key === 'escape') { setPathSource(null); setRange(null); setSelectedPath(null); setSelectedNode(null) }
    if ((key === 'delete' || key === 'backspace') && selectedPath) { update(deleteWorkspacePath(workspace, selectedPath)); setSelectedPath(null); notify('Path deleted.') }
    else if ((key === 'delete' || key === 'backspace') && selectedNode) { deleteNode(selectedNode) }
  }

  const importJson = (file?: File) => { if (!file) return; file.text().then(raw => { try { const parsed: unknown = JSON.parse(raw); if (!validateWorkspace(parsed)) throw Error(); update(parsed); notify('Workspace imported.') } catch { notify('That file is not a valid AV workspace.') } }) }
  const exportJson = () => { const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'av-workspace.json'; a.click(); URL.revokeObjectURL(a.href) }

  return <div className={`app theme-${theme}`} onKeyDown={handleKey} tabIndex={0}>
    <header className="topbar">
      <div className="brand"><strong>AnnotationVisualized</strong></div>
      <div className="toolbar-group"><button title="Undo" onClick={undo} disabled={!history.length}><Undo2 size={16} /></button><button title="Redo" onClick={redo} disabled={!future.length}><Redo2 size={16} /></button></div>
      <div className="toolbar-group right"><label className="icon-button" title="Import JSON"><FileUp size={16} /><input type="file" accept="application/json" onChange={e => importJson(e.target.files?.[0])} /></label><button title="Export JSON" onClick={exportJson}><Download size={16} /></button><button className="theme-toggle" title={`Switch to Solarized ${theme === 'dark' ? 'Light' : 'Dark'}`} aria-label={`Switch to Solarized ${theme === 'dark' ? 'Light' : 'Dark'}`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button></div>
    </header>
    {notice && <div className="noticebar">{notice}</div>}
    <main className="workspace" style={{ gridTemplateColumns: `${divider}% 6px 1fr` }}>
      {orderedPanels.map((panel, index) => <div key={panel} className="panel-wrap">{panel === 'text' ? <TextPanel mode={mode} setMode={setMode} workspace={workspace} selectedNode={selectedNode} hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} setSelectedNode={setSelectedNode} setSelectedPath={setSelectedPath} focusGraphNode={focusGraphNode} surfaceRef={surfaceRef} textRef={textRef} onChange={handleTextChange} onSelect={captureSelection} /> : <GraphPanelInteractive workspace={workspace} selectedNode={selectedNode} selectedPath={selectedPath} pathSource={pathSource} highlightedNodes={highlightedNodes} setSelectedNode={setSelectedNode} setSelectedPath={setSelectedPath} setHoveredNode={setHoveredNode} createPath={(target) => { if (!pathSource || pathSource === target) return notify('Choose a different destination node.'); const next = createWorkspacePath(workspace, pathSource, target, uid('path')); if (next.paths.length === workspace.paths.length) return notify('That path already exists.'); update(next); setPathSource(null); notify('Path created.') }} deleteNode={deleteNode} beginGeometryEdit={beginGeometryEdit} updateNodeGeometry={updateNodeGeometry} endGeometryEdit={endGeometryEdit} updateGraphView={updateGraphView} />}</div>)}
      <div className="resize-handle" onPointerDown={event => { const startX = event.clientX, start = divider; const move = (e: PointerEvent) => setDivider(Math.max(25, Math.min(72, start + ((e.clientX - startX) / window.innerWidth) * 100))); const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up) }} />
    </main>
    <footer><span>{workspace.nodes.length} nodes</span><span>{workspace.paths.length} paths</span><span>{workspace.text.length} characters</span><button onClick={() => setLeftPanel(p => p === 'text' ? 'graph' : 'text')}><PanelLeft size={14} /> Swap panels</button></footer>
  </div>
}

function TextPanel({ mode, setMode, workspace, selectedNode, hoveredNode, setHoveredNode, setSelectedNode, setSelectedPath, focusGraphNode, surfaceRef, textRef, onChange, onSelect }: { mode: Mode; setMode: (mode: Mode) => void; workspace: Workspace; selectedNode: string | null; hoveredNode: string | null; setHoveredNode: (id: string | null) => void; setSelectedNode: (id: string | null) => void; setSelectedPath: (id: string | null) => void; focusGraphNode: (id: string) => void; surfaceRef: RefObject<HTMLDivElement | null>; textRef: RefObject<HTMLTextAreaElement | null>; onChange: (value: string) => void; onSelect: () => void }) {
  const boundaries = new Set([0, workspace.text.length]); workspace.nodes.forEach(n => n.assignments.forEach(a => { boundaries.add(a.start); boundaries.add(a.end) })); const points = [...boundaries].sort((a, b) => a - b)
  return <section className="panel text-panel"><div className="panel-heading"><div><h2>Text</h2></div><div className="mode-switch" aria-label="Text mode"><button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Edit</button><span>|</span><button className={mode === 'graph' ? 'active' : ''} onClick={() => setMode('graph')}>Annotate</button></div></div>{mode === 'edit' ? <textarea ref={textRef} className="editor edit-surface" value={workspace.text} onChange={e => onChange(e.target.value)} spellCheck /> : <div ref={surfaceRef} className="text-surface annotate-surface" onMouseUp={onSelect} onKeyUp={onSelect} tabIndex={0}>{points.slice(0, -1).map((start, i) => { const end = points[i + 1], ids = workspace.nodes.filter(n => n.assignments.some(a => a.start <= start && a.end >= end)).map(n => n.id), boxShadows = ids.map((id, index) => `inset 0 -${2 + index * 3}px 0 ${workspace.nodes.find(n => n.id === id)?.color}`).join(', '), active = ids.includes(selectedNode || '') || ids.includes(hoveredNode || ''); return <span key={`${start}-${end}`} className={`text-fragment ${ids.length ? 'marked' : ''} ${active ? 'active-assignment' : ''}`} style={{ '--marker-colors': workspace.nodes.find(n => n.id === ids[0])?.color, boxShadow: boxShadows || undefined } as CSSProperties} onMouseEnter={() => ids[0] && setHoveredNode(ids[0])} onMouseLeave={() => setHoveredNode(null)} onClick={() => { if (ids[0]) { setSelectedNode(ids[0]); setSelectedPath(null); focusGraphNode(ids[0]) } }}>{workspace.text.slice(start, end)}</span> })}</div>}<div className="text-hint">{mode === 'graph' ? <><kbd>N</kbd> new node <kbd>A</kbd> assign <kbd>X</kbd> remove</> : 'Switch to Annotate to mark up the document.'}</div></section>
}

function GraphPanelInteractive({ workspace, selectedNode, selectedPath, pathSource, highlightedNodes, setSelectedNode, setSelectedPath, setHoveredNode, createPath, deleteNode, beginGeometryEdit, updateNodeGeometry, endGeometryEdit, updateGraphView }: { workspace: Workspace; selectedNode: string | null; selectedPath: string | null; pathSource: string | null; highlightedNodes: Set<string | null>; setSelectedNode: (id: string | null) => void; setSelectedPath: (id: string | null) => void; setHoveredNode: (id: string | null) => void; createPath: (target: string) => void; deleteNode: (id: string) => void; beginGeometryEdit: () => void; updateNodeGeometry: (id: string, geometry: Partial<Pick<NodeData, 'x' | 'y' | 'width' | 'height'>>) => void; endGeometryEdit: () => void; updateGraphView: (view: { x: number; y: number; scale?: number }) => void }) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number; x: number; y: number } | null>(null)
  const [pan, setPan] = useState({ x: workspace.view?.x ?? 0, y: workspace.view?.y ?? 0 })
  const [scale, setScale] = useState(workspace.view?.scale ?? 1)
  useEffect(() => { if (!panRef.current) { setPan({ x: workspace.view?.x ?? 0, y: workspace.view?.y ?? 0 }); setScale(workspace.view?.scale ?? 1) } }, [workspace.view?.x, workspace.view?.y, workspace.view?.scale])
  const fallbackLayout = (index: number) => ({ x: 4 + (index % 3) * 31, y: 6 + Math.floor(index / 3) * 26, width: 24, height: 24 })
  const positions = workspace.nodes.map((node, index) => ({ node, ...(node.x === undefined ? fallbackLayout(index) : { x: node.x, y: node.y ?? fallbackLayout(index).y, width: node.width ?? 24, height: node.height ?? 24 }) }))
  const pos = new Map(positions.map(p => [p.node.id, p]))
  useEffect(() => {
    const svg = canvasRef.current?.querySelector<SVGSVGElement>('.edges')
    if (!svg) return
    let marker = svg.querySelector<SVGMarkerElement>('#av-arrow')
    if (!marker) {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
      marker.id = 'av-arrow'; marker.setAttribute('markerWidth', '4'); marker.setAttribute('markerHeight', '4'); marker.setAttribute('viewBox', '0 0 4 4'); marker.setAttribute('refX', '3.4'); marker.setAttribute('refY', '2'); marker.setAttribute('orient', 'auto-start-reverse'); marker.setAttribute('markerUnits', 'strokeWidth')
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path'); arrow.setAttribute('d', 'M 0 0 L 4 2 L 0 4 z'); marker.appendChild(arrow); svg.querySelector('defs')?.appendChild(marker)
    }
    const lines = canvasRef.current?.querySelectorAll<SVGPathElement>('.edge-line')
    const hits = canvasRef.current?.querySelectorAll<SVGPathElement>('.edge-hit')
    lines?.forEach((line, index) => {
      const style = workspace.paths[index]?.style ?? 'directed-way1'
      const path = workspace.paths[index], source = path && pos.get(path.sourceNodeId), target = path && pos.get(path.targetNodeId)
      if (!source || !target) return
      const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 }, targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
      const pointOnEdge = (from: typeof source, to: typeof target) => { const dx = (to.x + to.width / 2) - (from.x + from.width / 2), dy = (to.y + to.height / 2) - (from.y + from.height / 2), scale = 0.5 / Math.max(Math.abs(dx / from.width), Math.abs(dy / from.height)); return { x: from.x + from.width / 2 + dx * scale, y: from.y + from.height / 2 + dy * scale } }
      const start = pointOnEdge(source, target), end = pointOnEdge(target, source), midX = (sourceCenter.x + targetCenter.x) / 2, midY = (sourceCenter.y + targetCenter.y) / 2, d = `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`
      line.setAttribute('d', d); hits?.[index]?.setAttribute('d', d)
      line.removeAttribute('marker-start'); line.removeAttribute('marker-end'); line.removeAttribute('stroke-dasharray')
      if (style === 'directed-way1') line.setAttribute('marker-end', 'url(#av-arrow)')
      if (style === 'directed-way2') line.setAttribute('marker-start', 'url(#av-arrow)')
      if (style === 'bidirectional') { line.setAttribute('marker-start', 'url(#av-arrow)'); line.setAttribute('marker-end', 'url(#av-arrow)') }
      if (style === 'undirected-dash') line.setAttribute('stroke-dasharray', '2 1')
    })
  }, [workspace.paths, positions])
  useEffect(() => {
    const titles = canvasRef.current?.querySelectorAll<HTMLElement>('.node-title')
    titles?.forEach((title, index) => {
      const node = workspace.nodes[index]
      if (!node) return
      title.textContent = ''
      node.assignments.forEach((assignment, assignmentIndex) => {
        if (assignmentIndex > 0) {
          const divider = document.createElement('span')
          divider.className = 'node-assignment-divider'
          title.appendChild(divider)
        }
        const row = document.createElement('span')
        row.className = 'node-assignment'
        row.textContent = workspace.text.slice(assignment.start, assignment.end)
        title.appendChild(row)
      })
    })
  }, [workspace.nodes, workspace.text])
  useEffect(() => {
    const focusNode = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      const target = pos.get(id), rect = canvasRef.current?.getBoundingClientRect()
      if (!target || !rect) return
      const margin = 24, left = (target.x / 100) * rect.width * scale + pan.x, top = (target.y / 100) * rect.height * scale + pan.y, right = ((target.x + target.width) / 100) * rect.width * scale + pan.x, bottom = ((target.y + target.height) / 100) * rect.height * scale + pan.y
      const next = { ...pan }
      if (left + next.x < margin) next.x += margin - (left + next.x)
      else if (right + next.x > rect.width - margin) next.x -= right + next.x - (rect.width - margin)
      if (top + next.y < margin) next.y += margin - (top + next.y)
      else if (bottom + next.y > rect.height - margin) next.y -= bottom + next.y - (rect.height - margin)
      if (next.x !== pan.x || next.y !== pan.y) { setPan(next); updateGraphView({ ...next, scale }) }
    }
    window.addEventListener('av-focus-node', focusNode)
    return () => window.removeEventListener('av-focus-node', focusNode)
  }, [pan, pos, scale, updateGraphView])
  useLayoutEffect(() => {
    const layer = canvasRef.current?.querySelector<HTMLElement>('.graph-layer')
    if (layer) { layer.style.transformOrigin = '0 0'; layer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }
  }, [pan, scale])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const zoom = (event: WheelEvent) => {
      event.preventDefault()
      const nextScale = Math.max(.35, Math.min(3, scale * (event.deltaY > 0 ? .9 : 1.1)))
      if (nextScale !== scale) {
        const rect = canvas.getBoundingClientRect(), cursorX = event.clientX - rect.left, cursorY = event.clientY - rect.top
        const worldX = (cursorX - pan.x) / scale, worldY = (cursorY - pan.y) / scale
        const nextPan = { x: cursorX - worldX * nextScale, y: cursorY - worldY * nextScale }
        setScale(nextScale); setPan(nextPan); updateGraphView({ ...nextPan, scale: nextScale })
      }
    }
    canvas.addEventListener('wheel', zoom, { passive: false })
    return () => canvas.removeEventListener('wheel', zoom)
  }, [pan, scale, updateGraphView])

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as Element
    if (event.target !== event.currentTarget && !target.classList.contains('graph-layer') && target.tagName.toLowerCase() !== 'svg') return
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = { startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y, x: pan.x, y: pan.y }
  }
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => { if (panRef.current) { const next = { x: panRef.current.originX + event.clientX - panRef.current.startX, y: panRef.current.originY + event.clientY - panRef.current.startY }; setPan(next); panRef.current = { ...panRef.current, x: next.x, y: next.y } } }
  const endPan = () => { if (panRef.current) updateGraphView({ x: panRef.current.x, y: panRef.current.y, scale }); panRef.current = null }
  const startNodeGesture = (event: ReactPointerEvent<HTMLElement>, node: NodeData, resize: boolean) => {
    event.stopPropagation(); event.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return
    const current = pos.get(node.id); if (!current) return
    const startX = event.clientX, startY = event.clientY, initial = { x: current.x, y: current.y, width: current.width, height: current.height }
    beginGeometryEdit()
    const move = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / (rect.width * scale)) * 100, dy = ((moveEvent.clientY - startY) / (rect.height * scale)) * 100
      if (resize) updateNodeGeometry(node.id, { width: Math.max(5, initial.width + dx), height: Math.max(5, initial.height + dy) })
      else updateNodeGeometry(node.id, { x: initial.x + dx, y: initial.y + dy })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); endGeometryEdit() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  return <section className="panel graph-panel"><div className="panel-heading"><div><h2>Graph</h2></div>{pathSource ? <span className="path-pill">PATH MODE · CHOOSE DESTINATION</span> : <span className="node-count">{workspace.nodes.length} {workspace.nodes.length === 1 ? 'node' : 'nodes'}</span>}</div><div ref={canvasRef} className="graph-canvas" style={{ backgroundPosition: `${pan.x}px ${pan.y}px` }} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onClick={() => { setSelectedNode(null); setSelectedPath(null) }}><div className="graph-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}><svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none">{workspace.paths.map(path => { const s = pos.get(path.sourceNodeId), t = pos.get(path.targetNodeId); if (!s || !t) return null; const selected = selectedPath === path.id, sx = s.x + s.width / 2, sy = s.y + s.height / 2, tx = t.x + t.width / 2, ty = t.y + t.height / 2; return <g key={path.id} onClick={e => { e.stopPropagation(); setSelectedPath(path.id); setSelectedNode(null) }} className={selected ? 'edge-selected' : ''}><path className="edge-hit" d={`M ${sx} ${sy} C ${(sx + tx) / 2} ${sy}, ${(sx + tx) / 2} ${ty}, ${tx} ${ty}`} /><path className="edge-line" markerEnd="url(#arrow)" d={`M ${sx} ${sy} C ${(sx + tx) / 2} ${sy}, ${(sx + tx) / 2} ${ty}, ${tx} ${ty}`} /></g>})}<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="currentColor" /></marker></defs></svg>{positions.map(({ node, x, y, width, height }) => <div key={node.id} className={`node ${selectedNode === node.id ? 'selected' : ''} ${pathSource === node.id ? 'path-source' : ''} ${highlightedNodes.has(node.id) ? 'highlighted' : ''}`} style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%`, '--node-color': node.color } as CSSProperties} onPointerDown={event => startNodeGesture(event, node, false)} onClick={event => { event.stopPropagation(); if (pathSource) createPath(node.id); else { setSelectedNode(node.id); setSelectedPath(null) } }} onMouseEnter={() => setHoveredNode(node.id)} onMouseLeave={() => setHoveredNode(null)}><div className="node-title">{node.assignments.length ? node.assignments.map(a => workspace.text.slice(a.start, a.end)).join(' · ') : 'Unassigned node'}</div><span className="resize-grip" onPointerDown={event => startNodeGesture(event, node, true)} /><button className="node-delete" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); deleteNode(node.id) }}><X size={13} /></button></div>)}</div></div><div className="graph-hint">{selectedNode ? <><span className="selection-chip" style={{ background: workspace.nodes.find(n => n.id === selectedNode)?.color }} />Node selected · press <kbd>P</kbd> to connect</> : 'Drag nodes to move, use the corner grip to resize, or drag the grid to pan'}{selectedPath && <button className="delete-path" onClick={() => setSelectedPath(null)}>Path selected · press Delete</button>}</div></section>
}
