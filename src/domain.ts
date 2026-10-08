import type { Assignment, NodeData, PathData, PathStyle, SelectionRange, Workspace } from './types'

export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
export const overlaps = (a: Assignment, b: SelectionRange) => a.start < b.end && b.start < a.end
export const nodeColor = (index: number) => `hsl(${Math.round((index * 137.508) % 360)} 68% 62%)`
export const uniqueNodeColor = (existingColors: string[]) => {
  const used = new Set(existingColors)
  let index = existingColors.length
  let color = nodeColor(index)
  while (used.has(color)) color = nodeColor(++index)
  return color
}
export const pathStyles: PathStyle[] = ['undirected-solid', 'undirected-dash', 'directed-way1', 'directed-way2', 'bidirectional']

function trimAssignment(assignment: Assignment, range: SelectionRange): Assignment[] {
  if (!overlaps(assignment, range)) return [{ ...assignment }]
  const pieces: Assignment[] = []
  if (assignment.start < range.start) pieces.push({ start: assignment.start, end: range.start })
  if (assignment.end > range.end) pieces.push({ start: range.end, end: assignment.end })
  return pieces.filter(piece => piece.end > piece.start)
}

function normalize(assignments: Assignment[]): Assignment[] {
  return assignments
    .filter(a => a.end > a.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .reduce<Assignment[]>((result, assignment) => {
      const last = result[result.length - 1]
      if (last && assignment.start <= last.end) last.end = Math.max(last.end, assignment.end)
      else result.push({ ...assignment })
      return result
    }, [])
}

function removeEmptyNodes(workspace: Workspace): Workspace {
  const live = new Set(workspace.nodes.filter(node => node.assignments.length).map(node => node.id))
  return {
    ...workspace,
    nodes: workspace.nodes.filter(node => live.has(node.id)),
    paths: workspace.paths.filter(path => live.has(path.sourceNodeId) && live.has(path.targetNodeId)),
  }
}

export function addNode(workspace: Workspace, node: NodeData): Workspace {
  const withNode = { ...clone(workspace), nodes: [...workspace.nodes, { ...clone(node), assignments: [] }] }
  return node.assignments.reduce((current, range) => assignRange(current, node.id, range), withNode)
}

/** Assign the range to one node and take ownership away from every other node. */
export function assignRange(workspace: Workspace, nodeId: string, range: SelectionRange): Workspace {
  if (range.end <= range.start || !workspace.nodes.some(node => node.id === nodeId)) return clone(workspace)
  const next = clone(workspace)
  next.nodes = next.nodes.map(node => ({
    ...node,
    assignments: normalize(node.assignments.flatMap(assignment => trimAssignment(assignment, range))),
  }))
  const target = next.nodes.find(node => node.id === nodeId)
  if (target) target.assignments = normalize([...target.assignments, { ...range }])
  return removeEmptyNodes(next)
}

/** Remove ownership only from the selected characters, preserving assignment fragments outside it. */
export function removeRange(workspace: Workspace, range: SelectionRange): Workspace {
  if (range.end <= range.start) return clone(workspace)
  const next = clone(workspace)
  next.nodes = next.nodes.map(node => ({ ...node, assignments: normalize(node.assignments.flatMap(assignment => trimAssignment(assignment, range))) }))
  return removeEmptyNodes(next)
}

export function deleteNode(workspace: Workspace, nodeId: string): Workspace {
  const next = clone(workspace)
  next.nodes = next.nodes.filter(node => node.id !== nodeId)
  next.paths = next.paths.filter(path => path.sourceNodeId !== nodeId && path.targetNodeId !== nodeId)
  return next
}

export function createPath(workspace: Workspace, sourceNodeId: string, targetNodeId: string, pathId: string): Workspace {
  if (sourceNodeId === targetNodeId || !workspace.nodes.some(node => node.id === sourceNodeId) || !workspace.nodes.some(node => node.id === targetNodeId)) return clone(workspace)
  if (workspace.paths.some(path => path.sourceNodeId === sourceNodeId && path.targetNodeId === targetNodeId)) return clone(workspace)
  return { ...clone(workspace), paths: [...workspace.paths, { id: pathId, sourceNodeId, targetNodeId, style: 'directed-way1' }] }
}

export function setPathStyle(workspace: Workspace, pathId: string, style: PathStyle): Workspace {
  return { ...clone(workspace), paths: workspace.paths.map(path => path.id === pathId ? { ...path, style } : path) }
}

export function deletePath(workspace: Workspace, pathId: string): Workspace {
  return { ...clone(workspace), paths: workspace.paths.filter(path => path.id !== pathId) }
}

export function shiftAssignments(workspace: Workspace, oldText: string, nextText: string): Workspace {
  let prefix = 0
  while (prefix < oldText.length && prefix < nextText.length && oldText[prefix] === nextText[prefix]) prefix++
  let oldSuffix = oldText.length, nextSuffix = nextText.length
  while (oldSuffix > prefix && nextSuffix > prefix && oldText[oldSuffix - 1] === nextText[nextSuffix - 1]) { oldSuffix--; nextSuffix-- }
  const delta = (nextSuffix - prefix) - (oldSuffix - prefix)
  const result = clone(workspace)
  result.text = nextText
  result.nodes = result.nodes.map(node => ({ ...node, assignments: node.assignments.map(a => {
    if (a.end <= prefix) return a
    if (a.start >= oldSuffix) return { start: a.start + delta, end: a.end + delta }
    const start = a.start < prefix ? a.start : prefix
    const end = a.end > oldSuffix ? a.end + delta : prefix
    return { start, end }
  }).filter(a => a.end > a.start && a.start < nextText.length) }))
  return removeEmptyNodes(result)
}

export function validateWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Workspace>
  if (typeof candidate.text !== 'string' || !Array.isArray(candidate.nodes) || !Array.isArray(candidate.paths)) return false
  if (candidate.view !== undefined && (!candidate.view || typeof candidate.view.x !== 'number' || !Number.isFinite(candidate.view.x) || typeof candidate.view.y !== 'number' || !Number.isFinite(candidate.view.y) || (candidate.view.scale !== undefined && (typeof candidate.view.scale !== 'number' || !Number.isFinite(candidate.view.scale) || candidate.view.scale <= 0)))) return false
  const nodeIds = new Set<string>()
  for (const node of candidate.nodes) {
    if (!node || typeof node.id !== 'string' || nodeIds.has(node.id) || !Array.isArray(node.assignments)) return false
    nodeIds.add(node.id)
    for (const assignment of node.assignments) {
      if (!assignment || !Number.isInteger(assignment.start) || !Number.isInteger(assignment.end) || assignment.start < 0 || assignment.end <= assignment.start || assignment.end > candidate.text.length) return false
    }
  }
  const pathIds = new Set<string>()
  for (const path of candidate.paths) {
    if (!path || typeof path.id !== 'string' || pathIds.has(path.id) || typeof path.sourceNodeId !== 'string' || typeof path.targetNodeId !== 'string' || !nodeIds.has(path.sourceNodeId) || !nodeIds.has(path.targetNodeId) || (path.style !== undefined && !pathStyles.includes(path.style))) return false
    pathIds.add(path.id)
  }
  return true
}
