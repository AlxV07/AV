import { describe, expect, it } from 'vitest'
import { addNode, assignRange, createPath, deleteNode, deletePath, nodeColor, removeRange, setPathStyle, shiftAssignments, uniqueNodeColor, validateWorkspace } from './domain'
import type { PathStyle } from './types'
import type { NodeData, Workspace } from './types'

const node = (id: string, assignments: { start: number; end: number }[]): NodeData => ({ id, color: '#000', assignments })
const workspace = (nodes: NodeData[] = [], paths: Workspace['paths'] = [], text = 'abcdefghij'): Workspace => ({ text, nodes, paths })

describe('node and assignment operations', () => {
  it('generates distinguishable colors without cycling through duplicates', () => {
    expect(new Set(Array.from({ length: 24 }, (_, index) => nodeColor(index))).size).toBe(24)
    expect(uniqueNodeColor([nodeColor(0), nodeColor(2)])).not.toBe(nodeColor(0))
  })

  it('creates a node and normalizes its assignment', () => {
    const result = addNode(workspace(), node('a', [{ start: 1, end: 3 }, { start: 3, end: 5 }]))
    expect(result.nodes).toEqual([node('a', [{ start: 1, end: 5 }])])
  })

  it('assigns selected characters to the target node and removes ownership from another node', () => {
    const initial = workspace([node('a', [{ start: 0, end: 6 }]), node('b', [{ start: 6, end: 8 }])])
    const result = assignRange(initial, 'b', { start: 2, end: 8 })
    expect(result.nodes).toEqual([node('a', [{ start: 0, end: 2 }]), node('b', [{ start: 2, end: 8 }])])
    expect(result.nodes.flatMap(n => n.assignments).some(a => a.start < 8 && a.end > 2)).toBe(true)
  })

  it('deletes a previous node when an override removes its final characters', () => {
    const initial = workspace([node('a', [{ start: 0, end: 3 }]), node('b', [{ start: 3, end: 5 }])], [{ id: 'p', sourceNodeId: 'a', targetNodeId: 'b' }])
    const result = assignRange(initial, 'b', { start: 0, end: 3 })
    expect(result.nodes.map(n => n.id)).toEqual(['b'])
    expect(result.paths).toEqual([])
  })

  it('removes only selected characters and preserves both sides of an assignment', () => {
    const result = removeRange(workspace([node('a', [{ start: 1, end: 8 }])]), { start: 3, end: 5 })
    expect(result.nodes[0].assignments).toEqual([{ start: 1, end: 3 }, { start: 5, end: 8 }])
  })

  it('deletes empty nodes and their connected paths after removal', () => {
    const initial = workspace([node('a', [{ start: 1, end: 3 }]), node('b', [{ start: 4, end: 6 }])], [{ id: 'p', sourceNodeId: 'a', targetNodeId: 'b' }])
    const result = removeRange(initial, { start: 1, end: 3 })
    expect(result.nodes.map(n => n.id)).toEqual(['b'])
    expect(result.paths).toEqual([])
  })

  it('deletes a node and every path connected to it', () => {
    const initial = workspace([node('a', [{ start: 0, end: 1 }]), node('b', [{ start: 2, end: 3 }]), node('c', [{ start: 4, end: 5 }])], [
      { id: 'ab', sourceNodeId: 'a', targetNodeId: 'b' },
      { id: 'bc', sourceNodeId: 'b', targetNodeId: 'c' },
    ])
    const result = deleteNode(initial, 'b')
    expect(result.nodes.map(n => n.id)).toEqual(['a', 'c'])
    expect(result.paths).toEqual([])
  })
})

describe('text and path operations', () => {
  it('shifts assignments after an insertion before them', () => {
    const result = shiftAssignments(workspace([node('a', [{ start: 5, end: 8 }])]), 'abcdefghij', 'abcXXdefghij')
    expect(result.nodes[0].assignments).toEqual([{ start: 7, end: 10 }])
  })

  it('trims assignments across deleted text and removes empty nodes', () => {
    const result = shiftAssignments(workspace([node('a', [{ start: 2, end: 7 }])]), 'abcdefghij', 'abij')
    expect(result.nodes).toEqual([])
  })

  it('creates directed paths, rejects duplicates and self-links', () => {
    const initial = workspace([node('a', [{ start: 0, end: 1 }]), node('b', [{ start: 2, end: 3 }])])
    const first = createPath(initial, 'a', 'b', 'p1')
    expect(first.paths).toHaveLength(1)
    expect(createPath(first, 'a', 'b', 'p2').paths).toHaveLength(1)
    expect(createPath(first, 'a', 'a', 'p3').paths).toHaveLength(1)
  })

  it('deletes a selected path', () => {
    const initial = workspace([node('a', [{ start: 0, end: 1 }]), node('b', [{ start: 2, end: 3 }])], [{ id: 'p', sourceNodeId: 'a', targetNodeId: 'b' }])
    expect(deletePath(initial, 'p').paths).toEqual([])
  })

  it('sets each supported path style', () => {
    const initial = workspace([node('a', [{ start: 0, end: 1 }]), node('b', [{ start: 2, end: 3 }])], [{ id: 'p', sourceNodeId: 'a', targetNodeId: 'b' }])
    const styles: PathStyle[] = ['undirected-solid', 'undirected-dash', 'directed-way1', 'directed-way2', 'bidirectional']
    expect(styles.map(style => setPathStyle(initial, 'p', style).paths[0].style)).toEqual(styles)
  })
})

describe('JSON validation', () => {
  it('accepts a valid workspace', () => {
    expect(validateWorkspace({ ...workspace([node('a', [{ start: 0, end: 2 }])]), view: { x: -120, y: 40 } })).toBe(true)
  })

  it.each([
    ['duplicate node ids', workspace([node('a', []), node('a', [])])],
    ['out of bounds assignment', workspace([node('a', [{ start: 0, end: 99 }])])],
    ['missing path node', workspace([node('a', [{ start: 0, end: 1 }])], [{ id: 'p', sourceNodeId: 'a', targetNodeId: 'missing' }])],
    ['invalid graph view', { ...workspace(), view: { x: Number.NaN, y: 0 } }],
  ])('rejects %s', (_label, value) => {
    expect(validateWorkspace(value)).toBe(false)
  })
})
