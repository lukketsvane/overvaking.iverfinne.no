export type Metric = {
  id: string
  metrikkType?: string
  verdi?: number
  verdiTekst?: string
  eining?: string
  aar?: number
  kjeldeUrl?: string
  kjeldeTittel?: string
  merknad?: string
}

export type GraphNode = {
  id: string
  label: string
  type: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
  lag?: string
  color?: string
  sektor?: string
  orgType?: string
  status?: string
  kategori?: string
  kjeldeUrl?: string
  kjeldeTittel?: string
  skildring?: string
  merknad?: string
  heimel?: string
  geografi?: string
  prioritet?: string
  verdiTekst?: string
  metrics?: Metric[]
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  relasjonstype: string
  kind?: "tilgang" | "datadeling" | "sak" | "forsking"
  mekanisme?: string
  tilgangsniva?: number
  praksis?: string
  kjeldeUrl?: string
  kjeldeTittel?: string
  merknad?: string
  geografi?: string
  lag?: string
}

export type Graph = {
  meta?: {
    kjelde?: string
    nodar?: number
    kantar?: number
    malingar?: number
    foreldrelause?: number
    lagFargar?: Record<string, string>
    typeTal?: Record<string, number>
  }
  content?: {
    blocks: ContentBlock[]
  }
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type ContentBlock = {
  id: string
  section: string
  kind: "heading" | "paragraph" | "quote" | "list"
  title?: string
  body: string
  href?: string
  linkText?: string
  order: number
}
