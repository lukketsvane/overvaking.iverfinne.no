export type GraphNode = {
  id: string
  label: string
  type: string
  lag?: string
  sektor?: string
  orgType?: string
  status?: string
  kategori?: string
  kjeldeUrl?: string
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  relasjonstype: string
  mekanisme?: string
  tilgangsniva?: number
  praksis?: string
}

export type Graph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
