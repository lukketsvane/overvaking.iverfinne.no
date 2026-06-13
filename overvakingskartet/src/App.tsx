import { useEffect, useMemo, useRef, useState } from "react"
import { forceCollide, forceX, forceY } from "d3-force"
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d"
import type { ContentBlock, Graph, GraphEdge, GraphNode, Metric } from "./types"

const minGraphZoom = 0.58

const fallbackNodePalette = new Map<string, string>([
  ["Kamera og sensorar", "#4f8cff"],
  ["Register og biometri", "#9b6cff"],
  ["Kommunikasjon og etterretning", "#ff5d73"],
  ["Justis og kontroll", "#ff9d3f"],
  ["Datainfrastruktur", "#9aa4b2"],
  ["Kapital og eigarskap", "#40b66b"],
  ["Politikk og styring", "#e8c341"],
  ["Personar og roller", "#92400e"],
  ["Media", "#ff7bd5"],
])

const fallbackEdgePalette = new Map<string, string>([
  ["Eig", "#30a46c"],
  ["Driftar", "#3b82f6"],
  ["Direkte tilgang", "#e5484d"],
  ["Kan krevje utlevering", "#f59e0b"],
  ["Rettsordre", "#eab308"],
  ["Utleverer regelmessig", "#ec4899"],
  ["Finansierer", "#22c55e"],
  ["Leverandør / kontrakt", "#64748b"],
])

const emptyGraph: Graph = { nodes: [], edges: [] }

type RawGraph = {
  meta?: Graph["meta"]
  content?: Graph["content"]
  nodes?: Array<GraphNode & { layer?: string; name?: string }>
  edges?: Array<Partial<GraphEdge> & { from?: string; to?: string; label?: string; relation?: string }>
  links?: Array<Partial<GraphEdge> & { from?: string; to?: string; label?: string; relation?: string }>
}

function textSet(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "nn"))
}

function normalizeType(type: string | undefined) {
  if (!type) return "Ukjend"
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function normalizeGraph(raw: RawGraph): Graph {
  const nodes = (raw.nodes ?? []).map((node) => ({
    ...node,
    label: node.label ?? node.name ?? node.id,
    type: normalizeType(node.type),
    lag: node.lag ?? node.layer,
  }))

  const edgeInput = raw.edges ?? raw.links ?? []
  const edges = edgeInput
    .map((edge, index): GraphEdge | null => {
      const source = edge.source ?? edge.from
      const target = edge.target ?? edge.to
      if (!source || !target) return null

      const normalized: GraphEdge = {
        id: edge.id ?? `${source}-${target}-${index}`,
        source,
        target,
        relasjonstype: edge.relasjonstype ?? edge.relation ?? edge.label ?? "Relasjon",
      }

      if (edge.kind) normalized.kind = edge.kind
      if (edge.mekanisme) normalized.mekanisme = edge.mekanisme
      if (typeof edge.tilgangsniva === "number") normalized.tilgangsniva = edge.tilgangsniva
      if (edge.praksis) normalized.praksis = edge.praksis
      if (edge.kjeldeUrl) normalized.kjeldeUrl = edge.kjeldeUrl
      if (edge.kjeldeTittel) normalized.kjeldeTittel = edge.kjeldeTittel
      if (edge.merknad) normalized.merknad = edge.merknad
      if (edge.geografi) normalized.geografi = edge.geografi

      return normalized
    })
    .filter((edge): edge is GraphEdge => edge !== null)

  return { meta: raw.meta, content: raw.content, nodes, edges }
}

function normalizeContent(blocks: ContentBlock[] | undefined) {
  return (blocks ?? []).slice().sort((a, b) => a.order - b.order)
}

function blocksFor(blocks: ContentBlock[], section: string) {
  return blocks.filter((block) => block.section === section)
}

function headingFor(blocks: ContentBlock[]) {
  return blocks.find((block) => block.kind === "heading")?.body
}

function bodyBlocks(blocks: ContentBlock[]) {
  return blocks.filter((block) => block.kind !== "heading")
}

function layerClusterCenters(layers: string[]) {
  const centers = new Map<string, { x: number; y: number }>()
  const count = Math.max(layers.length, 1)
  const radius = count <= 1 ? 0 : Math.min(380, 150 + count * 24)

  layers.forEach((layer, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
    centers.set(layer, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
  })

  return centers
}

function layerCounts(nodes: GraphNode[]) {
  const counts = new Map<string, number>()
  nodes.forEach((node) => {
    const layer = node.lag ?? "Utan lag"
    counts.set(layer, (counts.get(layer) ?? 0) + 1)
  })
  return counts
}

function drawLayerClusters(
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  centers: Map<string, { x: number; y: number }>,
  counts: Map<string, number>,
  layerColors: Map<string, string>,
) {
  ctx.save()

  for (const [layer, center] of centers) {
    const count = counts.get(layer) ?? 0
    if (count === 0) continue

    const color = layerColors.get(layer) ?? colorFromText(layer)
    const radius = Math.max(92, Math.min(190, 54 + Math.sqrt(count) * 30))

    ctx.globalAlpha = 0.08
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 0.22
    ctx.strokeStyle = color
    ctx.lineWidth = 1.3 / globalScale
    ctx.stroke()

    ctx.globalAlpha = 0.72
    ctx.fillStyle = "#6f675b"
    ctx.font = `${12 / globalScale}px Inter, system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(layer, center.x, center.y - radius - 10 / globalScale)
  }

  ctx.restore()
}

function renderLinkedBody(block: ContentBlock) {
  if (!block.href) return block.body
  const linkText = block.linkText && block.body.includes(block.linkText) ? block.linkText : undefined

  if (!linkText) {
    return (
      <>
        {block.body}{" "}
        <a href={block.href} target="_blank" rel="noopener noreferrer">
          {block.linkText ?? "Kjelde"}
        </a>
      </>
    )
  }

  const [before, after] = block.body.split(linkText)
  return (
    <>
      {before}
      <a href={block.href} target="_blank" rel="noopener noreferrer">
        {linkText}
      </a>
      {after}
    </>
  )
}

function ContentParagraph({ block }: { block: ContentBlock }) {
  return (
    <p>
      {block.title && <strong>{block.title}: </strong>}
      {renderLinkedBody(block)}
    </p>
  )
}

function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  const prose = blocks.filter((block) => block.kind !== "list")
  const list = blocks.filter((block) => block.kind === "list")

  return (
    <>
      {prose.map((block) =>
        block.kind === "quote" ? (
          <blockquote key={block.id}>
            <ContentParagraph block={block} />
          </blockquote>
        ) : (
          <ContentParagraph block={block} key={block.id} />
        ),
      )}
      {list.length > 0 && (
        <ul className="lead-list">
          {list.map((block) => (
            <li key={block.id}>
              {block.title && <strong>{block.title}: </strong>}
              {renderLinkedBody(block)}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function colorFromText(value: string | undefined, fallback = "#8a8170") {
  if (!value) return fallback
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return `hsl(${hash} 58% 52%)`
}

function nodeColor(node: GraphNode, layerColors: Map<string, string>) {
  return node.color ?? layerColors.get(node.lag ?? "") ?? colorFromText(node.lag)
}

function edgeColor(edge: GraphEdge) {
  return fallbackEdgePalette.get(edge.relasjonstype ?? "") ?? colorFromText(edge.relasjonstype, "#837a6c")
}

function edgeWidth(edge: GraphEdge) {
  const level = edge.tilgangsniva ?? 1
  return Math.max(1, Math.min(5, level + 1))
}

const accessLabels: Record<number, string> = {
  0: "0 · ingen",
  1: "1 · rettsordre",
  2: "2 · kan krevje utlevering",
  3: "3 · direkte tilgang / drift",
  4: "4 · eigarskap",
}

function accessLabel(level: number | undefined) {
  if (typeof level !== "number") return undefined
  return accessLabels[level] ?? `${level}`
}

function metricText(metric: Metric) {
  if (metric.verdiTekst) return metric.verdiTekst
  if (typeof metric.verdi === "number") {
    return `${metric.verdi.toLocaleString("nn")}${metric.eining ? ` ${metric.eining}` : ""}`
  }
  return metric.eining ?? "—"
}

type EdgeWithNodes = GraphEdge & { source: string | GraphNode; target: string | GraphNode }

function edgeEndId(value: string | GraphNode): string {
  return typeof value === "string" ? value : value.id
}

async function fetchStaticFallback(): Promise<RawGraph> {
  const res = await fetch("/data/graph.json", { cache: "no-store" })
  if (!res.ok) throw new Error(`Kunne ikkje lese statisk fallback (${res.status})`)
  return (await res.json()) as RawGraph
}

async function fetchGraphData(): Promise<RawGraph> {
  // Primær: live frå Notion. Fell tilbake til statisk snapshot om API-et feilar.
  try {
    const res = await fetch("/api/graph", { cache: "no-store" })
    if (res.ok) return (await res.json()) as RawGraph
    const body = await res.json().catch(() => null)
    if (typeof body?.error === "string") throw new Error(body.error)
    throw new Error(`status ${res.status}`)
  } catch (liveError) {
    try {
      return await fetchStaticFallback()
    } catch {
      throw new Error(
        liveError instanceof Error
          ? `Kunne ikkje hente grafdata frå Notion: ${liveError.message}`
          : "Kunne ikkje hente grafdata frå Notion",
      )
    }
  }
}

export default function App() {
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphEdge> | undefined>(undefined)
  const [graph, setGraph] = useState<Graph>(emptyGraph)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState("Alle")
  const [lagFilter, setLagFilter] = useState("Alle")
  const [selected, setSelected] = useState<GraphNode | null>(null)

  useEffect(() => {
    fetchGraphData()
      .then((data) => setGraph(normalizeGraph(data)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Ukjend feil"))
      .finally(() => setLoading(false))
  }, [])

  const contentBlocks = useMemo(() => normalizeContent(graph.content?.blocks), [graph.content?.blocks])
  const heroBlocks = blocksFor(contentBlocks, "hero")
  const heroHeadings = heroBlocks.filter((block) => block.kind === "heading")
  const heroEyebrow =
    heroHeadings.find((block) => block.title?.toLowerCase() === "eyebrow")?.body ??
    heroBlocks.find((block) => block.id === "hero-eyebrow")?.body ??
    ""
  const heroTitle =
    heroHeadings.find((block) => block.title?.toLowerCase() === "title")?.body ??
    heroHeadings.find((block) => block.body !== heroEyebrow)?.body ??
    ""
  const heroLede = heroBlocks.find((block) => block.kind === "paragraph")?.body ?? ""
  const articleSections = useMemo(() => {
    const sectionOrder = new Map<string, number>()

    contentBlocks.forEach((block) => {
      if (["hero", "map", "footer"].includes(block.section)) return
      const current = sectionOrder.get(block.section)
      if (current === undefined || block.order < current) sectionOrder.set(block.section, block.order)
    })

    return Array.from(sectionOrder.keys())
      .sort((a, b) => (sectionOrder.get(a) ?? 0) - (sectionOrder.get(b) ?? 0))
      .map((section) => ({ section, blocks: blocksFor(contentBlocks, section) }))
  }, [contentBlocks])
  const mapBlocks = blocksFor(contentBlocks, "map")
  const footerBlocks = blocksFor(contentBlocks, "footer")
  const types = useMemo(() => textSet(graph.nodes.map((node) => node.type)), [graph.nodes])
  const lags = useMemo(() => textSet(graph.nodes.map((node) => node.lag ?? "Utan lag")), [graph.nodes])
  const clusterCenters = useMemo(() => layerClusterCenters(lags), [lags])
  const layerColors = useMemo(() => {
    const colors = new Map(fallbackNodePalette)
    for (const [lag, color] of Object.entries(graph.meta?.lagFargar ?? {})) colors.set(lag, color)
    for (const node of graph.nodes) {
      if (node.lag && node.color) colors.set(node.lag, node.color)
    }
    return colors
  }, [graph.meta?.lagFargar, graph.nodes])

  const visibleGraph = useMemo(() => {
    const nodes = graph.nodes.filter((node) => {
      const nodeLayer = node.lag ?? "Utan lag"
      const typeOk = typeFilter === "Alle" || node.type === typeFilter
      const lagOk = lagFilter === "Alle" || nodeLayer === lagFilter
      return typeOk && lagOk
    })
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    return { nodes, edges }
  }, [graph, typeFilter, lagFilter])
  const visibleLayerCounts = useMemo(() => layerCounts(visibleGraph.nodes), [visibleGraph.nodes])

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])

  const selectedConnections = useMemo(() => {
    if (!selected) return []
    return (graph.edges as EdgeWithNodes[])
      .map((edge) => {
        const sourceId = edgeEndId(edge.source)
        const targetId = edgeEndId(edge.target)
        if (sourceId !== selected.id && targetId !== selected.id) return null
        const otherId = sourceId === selected.id ? targetId : sourceId
        const other = nodeById.get(otherId)
        if (!other) return null
        return { edge, other }
      })
      .filter((value): value is { edge: GraphEdge; other: GraphNode } => value !== null)
  }, [selected, graph.edges, nodeById])

  useEffect(() => {
    const forceGraph = graphRef.current
    if (!forceGraph) return

    forceGraph.d3Force("charge")?.strength(-310)
    const linkForce = forceGraph.d3Force("link")
    linkForce?.distance?.(118)
    linkForce?.strength?.(0.32)
    forceGraph.d3Force("collide", forceCollide<GraphNode>().radius(24).strength(0.86))
    forceGraph.d3Force(
      "x",
      forceX<GraphNode>((node) => clusterCenters.get(node.lag ?? "Utan lag")?.x ?? 0).strength(0.16),
    )
    forceGraph.d3Force(
      "y",
      forceY<GraphNode>((node) => clusterCenters.get(node.lag ?? "Utan lag")?.y ?? 0).strength(0.16),
    )
    forceGraph.d3ReheatSimulation()
  }, [clusterCenters, visibleGraph])

  const stats = [
    { label: "Nodar", value: graph.nodes.length },
    { label: "Kantar", value: graph.edges.length },
    { label: "Synlege", value: visibleGraph.nodes.length },
    { label: "Kjelde", value: graph.meta?.kjelde ?? "Notion API" },
  ]

  const handleZoom = (factor: number) => {
    const current = graphRef.current?.zoom() ?? 1
    graphRef.current?.zoom(Math.max(minGraphZoom, current * factor), 320)
  }

  return (
    <main>
      <header className="hero">
        {heroEyebrow && <p className="eyebrow">{heroEyebrow}</p>}
        {heroTitle && <h1>{heroTitle}</h1>}
        {heroLede && <p className="lede">{heroLede}</p>}
        <p className="scroll-hint">
          Scroll for å utforske
          <span className="arrow" aria-hidden="true">↓</span>
        </p>
      </header>

      {articleSections.length > 0 && (
        <article className="article">
          {articleSections.map(({ section, blocks }) => (
            <section key={section}>
              <div className="section-head">
                <h2>{headingFor(blocks) ?? section}</h2>
                <div className="rule" />
              </div>
              <ContentBlocks blocks={bodyBlocks(blocks)} />
            </section>
          ))}
        </article>
      )}

      <section className="map-shell" aria-label="Overvakingskartet">
        {mapBlocks.length > 0 && (
          <div className="map-intro">
            {headingFor(mapBlocks) && <h2>{headingFor(mapBlocks)}</h2>}
            {bodyBlocks(mapBlocks).map((block) => (
              <ContentParagraph block={block} key={block.id} />
            ))}
          </div>
        )}

        <div className="graph-wrap">
          <div className="controls">
            <div className="stats">
              {stats.map((stat) => (
                <div className="stat" key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>

            <label>
              Type
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option>Alle</option>
                {types.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>

            <label>
              Lag
              <select value={lagFilter} onChange={(event) => setLagFilter(event.target.value)}>
                <option>Alle</option>
                {lags.map((lag) => (
                  <option key={lag}>{lag}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="graph-card">
            {loading && <div className="state">Lastar grafdata …</div>}
            {error && <div className="state error">{error}</div>}
            {!loading && !error && visibleGraph.nodes.length === 0 && (
              <div className="state">Ingen grafdata frå Notion enno. Sjekk Notion-tilgang og miljøvariablar.</div>
            )}
            {!loading && !error && visibleGraph.nodes.length > 0 && (
              <>
                <ForceGraph2D
                  ref={graphRef}
                  graphData={{ nodes: visibleGraph.nodes, links: visibleGraph.edges }}
                  backgroundColor="#fffdf8"
                  minZoom={minGraphZoom}
                  onRenderFramePre={(ctx, globalScale) =>
                    drawLayerClusters(ctx, globalScale, clusterCenters, visibleLayerCounts, layerColors)
                  }
                  nodeId="id"
                  nodeLabel={(node) => `${node.label} · ${node.type}${node.lag ? ` · ${node.lag}` : ""}`}
                  linkSource="source"
                  linkTarget="target"
                  linkLabel={(link) => link.relasjonstype}
                  linkColor={(link) => edgeColor(link)}
                  linkWidth={(link) => edgeWidth(link)}
                  linkDirectionalArrowLength={4}
                  linkDirectionalArrowRelPos={1}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.label
                    const isSelected = selected?.id === node.id
                    const radius = Math.max(5, Math.min(13, 9 / Math.sqrt(globalScale)))
                    ctx.beginPath()
                    ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
                    ctx.fillStyle = nodeColor(node, layerColors)
                    ctx.fill()
                    if (isSelected) {
                      ctx.lineWidth = 2 / globalScale
                      ctx.strokeStyle = "#1a1714"
                      ctx.stroke()
                    }
                    if (globalScale > 0.7) {
                      ctx.font = `${11 / globalScale}px Inter, system-ui, sans-serif`
                      ctx.textAlign = "center"
                      ctx.textBaseline = "top"
                      ctx.fillStyle = "#4a443c"
                      ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + radius + 3)
                    }
                  }}
                  onNodeClick={(node) => setSelected(node)}
                  onBackgroundClick={() => setSelected(null)}
                />

                <div className="legend" aria-hidden="true">
                  <h4>Lag</h4>
                  {lags
                    .map((key) => (
                      <div className="legend-row" key={key}>
                        <span className="legend-dot" style={{ background: layerColors.get(key) ?? colorFromText(key) }} />
                        {key}
                      </div>
                    ))}
                </div>

                <div className="zoom-controls">
                  <button type="button" aria-label="Zoom inn" onClick={() => handleZoom(1.4)}>
                    +
                  </button>
                  <button type="button" aria-label="Zoom ut" onClick={() => handleZoom(1 / 1.4)}>
                    −
                  </button>
                  <button
                    type="button"
                    aria-label="Tilbakestill"
                    onClick={() => graphRef.current?.zoomToFit(420, 60)}
                  >
                    ⟳
                  </button>
                </div>

                {selected && (
                  <aside className="detail" aria-label={`Detaljar for ${selected.label}`}>
                    <button
                      type="button"
                      className="detail-close"
                      aria-label="Lukk"
                      onClick={() => setSelected(null)}
                    >
                      ×
                    </button>
                    <span className="tag">{selected.type}</span>
                    <h3>{selected.label}</h3>

                    {selected.skildring && <p className="detail-skildring">{selected.skildring}</p>}

                    <div className="detail-rule" />

                    <dl>
                      {selected.lag && (
                        <div className="field">
                          <dt>Lag</dt>
                          <dd>{selected.lag}</dd>
                        </div>
                      )}
                      {selected.sektor && (
                        <div className="field">
                          <dt>Sektor</dt>
                          <dd>{selected.sektor}</dd>
                        </div>
                      )}
                      {selected.orgType && (
                        <div className="field">
                          <dt>Org-type</dt>
                          <dd>{selected.orgType}</dd>
                        </div>
                      )}
                      {selected.kategori && (
                        <div className="field">
                          <dt>Kategori</dt>
                          <dd>{selected.kategori}</dd>
                        </div>
                      )}
                      {selected.geografi && (
                        <div className="field">
                          <dt>Geografi</dt>
                          <dd>{selected.geografi}</dd>
                        </div>
                      )}
                      {selected.heimel && (
                        <div className="field">
                          <dt>Heimel</dt>
                          <dd>{selected.heimel}</dd>
                        </div>
                      )}
                      {selected.status && (
                        <div className="field">
                          <dt>Status</dt>
                          <dd>{selected.status}</dd>
                        </div>
                      )}
                      {selected.prioritet && (
                        <div className="field">
                          <dt>Prioritet</dt>
                          <dd>{selected.prioritet}</dd>
                        </div>
                      )}
                    </dl>

                    {selected.metrics && selected.metrics.length > 0 && (
                      <>
                        <div className="detail-rule" />
                        <p className="conn-title">Målingar</p>
                        {selected.metrics.map((metric: Metric) => (
                          <div className="metric-row" key={metric.id}>
                            <span className="metric-name">
                              {metric.metrikkType ?? "Måling"}
                              {metric.aar ? ` (${metric.aar})` : ""}
                            </span>
                            <span className="metric-value">{metricText(metric)}</span>
                            {metric.kjeldeUrl && (
                              <a
                                className="metric-source"
                                href={metric.kjeldeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {metric.kjeldeTittel ?? "kjelde"} ↗
                              </a>
                            )}
                          </div>
                        ))}
                      </>
                    )}

                    {selected.merknad && <p className="detail-merknad">{selected.merknad}</p>}

                    {selectedConnections.length > 0 && (
                      <>
                        <div className="detail-rule" />
                        <p className="conn-title">Relasjonar ({selectedConnections.length})</p>
                        {selectedConnections.map(({ edge, other }) => {
                          const outgoing = edgeEndId(edge.source) === selected.id
                          const meta = [edge.mekanisme, accessLabel(edge.tilgangsniva), edge.praksis]
                            .filter(Boolean)
                            .join(" · ")
                          return (
                            <div className="conn-item" key={edge.id}>
                              <button type="button" className="conn-row" onClick={() => setSelected(other)}>
                                <span className="conn-dot" style={{ background: edgeColor(edge) }} />
                                <span className="conn-name">
                                  <span className="conn-dir" aria-hidden="true">
                                    {outgoing ? "→" : "←"}
                                  </span>{" "}
                                  {other.label}
                                </span>
                                <span className="conn-rel">{edge.relasjonstype}</span>
                                {meta && <span className="conn-meta">{meta}</span>}
                              </button>
                              {edge.merknad && <p className="conn-note">{edge.merknad}</p>}
                              {edge.kjeldeUrl && (
                                <a
                                  className="conn-source"
                                  href={edge.kjeldeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {edge.kjeldeTittel ?? "kjelde"} ↗
                                </a>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )}

                    {selected.kjeldeUrl && (
                      <a
                        className="detail-source"
                        href={selected.kjeldeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {selected.kjeldeTittel ?? "Opne kjelde"} ↗
                      </a>
                    )}
                  </aside>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {footerBlocks.length > 0 && (
        <footer className="site-footer">
          {bodyBlocks(footerBlocks).map((block) => (
            <ContentParagraph block={block} key={block.id} />
          ))}
        </footer>
      )}
    </main>
  )
}
