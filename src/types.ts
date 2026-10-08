export type Mode = 'edit' | 'graph'

export interface Assignment { start: number; end: number }
export interface NodeData { id: string; assignments: Assignment[]; color: string; x?: number; y?: number; width?: number; height?: number }
export interface GraphView { x: number; y: number; scale?: number }
export type PathStyle = 'undirected-solid' | 'undirected-dash' | 'directed-way1' | 'directed-way2' | 'bidirectional'
export interface PathData { id: string; sourceNodeId: string; targetNodeId: string; style?: PathStyle }
export interface Workspace { text: string; nodes: NodeData[]; paths: PathData[]; view?: GraphView }
export interface SelectionRange { start: number; end: number }
