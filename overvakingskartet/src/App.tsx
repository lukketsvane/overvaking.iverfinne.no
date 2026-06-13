import { useEffect, useMemo, useRef, useState } from "react"
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d"
import type { Graph, GraphEdge, GraphNode } from "./types"

const minGraphZoom = 0.58

const fallbackNodePalette = new Map<string, string>([
  ["Kamera og sensorar", "#4f8cff"],
  ["Register og biometri", "#9b6cff"],
  ["Kommunikasjon og etterretning", "#ff5d73"],
  ["Justis og kontroll", "#ff9d3f"],
  ["Datainfrastruktur", "#9aa4b2"],
  ["Kapital og eigarskap", "#40b66b"],
  ["Politikk og styring", "#e8c341"],
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

      if (edge.mekanisme) normalized.mekanisme = edge.mekanisme
      if (typeof edge.tilgangsniva === "number") normalized.tilgangsniva = edge.tilgangsniva
      if (edge.praksis) normalized.praksis = edge.praksis

      return normalized
    })
    .filter((edge): edge is GraphEdge => edge !== null)

  return { meta: raw.meta, nodes, edges }
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

type EdgeWithNodes = GraphEdge & { source: string | GraphNode; target: string | GraphNode }

function edgeEndId(value: string | GraphNode): string {
  return typeof value === "string" ? value : value.id
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
    fetch("/data/graph.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Kunne ikkje lese data/graph.json (${res.status})`)
        return res.json() as Promise<RawGraph>
      })
      .then((data) => setGraph(normalizeGraph(data)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Ukjend feil"))
      .finally(() => setLoading(false))
  }, [])

  const types = useMemo(() => textSet(graph.nodes.map((node) => node.type)), [graph.nodes])
  const lags = useMemo(() => textSet(graph.nodes.map((node) => node.lag)), [graph.nodes])
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
      const typeOk = typeFilter === "Alle" || node.type === typeFilter
      const lagOk = lagFilter === "Alle" || node.lag === lagFilter
      return typeOk && lagOk
    })
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    return { nodes, edges }
  }, [graph, typeFilter, lagFilter])

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
    graphRef.current?.d3Force("charge")?.strength(-150)
    graphRef.current?.d3Force("link")?.distance(90)
  }, [visibleGraph])

  const stats = [
    { label: "Nodar", value: graph.nodes.length },
    { label: "Kantar", value: graph.edges.length },
    { label: "Synlege", value: visibleGraph.nodes.length },
  ]

  const handleZoom = (factor: number) => {
    const current = graphRef.current?.zoom() ?? 1
    graphRef.current?.zoom(Math.max(minGraphZoom, current * factor), 320)
  }

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Opendata · Noreg</p>
        <h1>Overvakingskartet</h1>
        <p className="lede">
          Eit ope, relasjonelt kart over statleg og kommersiell overvaking i Noreg. Prosjektet sporar kven som
          kan sjå, registrere og kople saman opplysningar om folk, og kor stor denne kapasiteten faktisk er.
        </p>
        <p className="scroll-hint">
          Scroll for å utforske
          <span className="arrow" aria-hidden="true">↓</span>
        </p>
      </header>

      <article className="article">
        <section>
          <div className="section-head">
            <h2>Føremål</h2>
            <div className="rule" />
          </div>
          <p>
            Norsk offentlegheit diskuterer overvaking stykkevis, eitt kamera eller eitt register om gongen. Her
            blir trådane samla i éin struktur, slik at det heilskaplege biletet, og maktforholda bak, blir
            mogleg å sjå.
          </p>
          <blockquote>
            <p>
              <strong>6 kamera:</strong> Politiforum skildra i 2013 at politiet hadde{" "}
              <a
                href="https://www.politiforum.no/nyheter/oslo-seks-politikameraer/112206"
                target="_blank"
                rel="noopener noreferrer"
              >
                "skarve seks kameraer"
              </a>{" "}
              ved Oslo S. Poenget her er ikkje talet i seg sjølv, men spranget frå eigarskap til tilgang:
              kontrollkapasiteten ligg i nettverket rundt kameraa.
            </p>
          </blockquote>

          <blockquote>
            <p>
              <strong>Opent budsjett:</strong> Etterretningstenesta låg på{" "}
              <a
                href="https://www.regjeringen.no/no/dokumenter/stprp-nr-1-2004-2005-/id297065/?ch=4"
                target="_blank"
                rel="noopener noreferrer"
              >
                691,845 mill. kroner i 2005
              </a>
              ; i statsbudsjettet for 2025 er kap. 1735 foreslått til{" "}
              <a
                href="https://www.regjeringen.no/no/dokumenter/prop.-1-s-20242025/id3057361/?ch=3"
                target="_blank"
                rel="noopener noreferrer"
              >
                4,299 mrd. kroner
              </a>
              .
            </p>
          </blockquote>

          <blockquote>
            <p>
              <strong>Berande tese:</strong> Makt over informasjon ligg ikkje først og fremst i kven som{" "}
              <em>eig</em> utstyret, men i kven som kan <em>mobilisere</em> det. Politiet eig få kamera sjølv,
              men har tilgang til titusenvis.
            </p>
          </blockquote>
          <ul className="lead-list">
            <li>
              <strong>Nodemodell:</strong> kvar eining (system, organisasjon, lovheimel, måling, datadeling,
              sak) er ein <em>node</em> i same database.
            </li>
            <li>
              <strong>Relasjonar:</strong> ein <em>sjølvrelasjon</em> bind nodane saman til éin samanhengande
              graf i staden for mange lausrivne tabellar.
            </li>
            <li>
              <strong>Fire gradar av kontroll:</strong> kvar tilgang er klassifisert som <em>eigd</em>,{" "}
              <em>drifta</em>, <em>tilgjengeleg</em> eller <em>regelmessig utlevert</em>.
            </li>
            <li>
              <strong>Fri dataflate:</strong> nodar, kantar, lag, fargar og filternamn blir lesne frå grafdata.
              Når Notion-synken oppdaterer fila, skal kartet følgje etter utan kodeendring.
            </li>
          </ul>
        </section>

        <section>
          <div className="section-head">
            <h2>Infrastrukturen for kontroll</h2>
            <div className="rule" />
          </div>
          <p>
            Overvaking i Noreg veks sjeldan gjennom store, opne vedtak. Han veks gjennom mange små, tekniske
            avgjerder som kvar for seg verkar uskuldige, men som til saman byggjer ein{" "}
            <strong>infrastruktur for kontroll</strong>. Eit kamera blir sett opp for å tryggje ein butikk. Eit
            register blir oppretta for å løyse ei konkret oppgåve. Ein heimel for utlevering blir vedteken for
            å hjelpe etterforsking. Først når desse banda blir sette saman, kjem mønsteret til syne.
          </p>
          <p>
            Det avgjerande er ikkje talet på kamera, men <em>rekkjevidda</em> til dei som kan be om opptaka.
            Politiet eig sjølv få kamera, men kan krevje utlevering frå titusenvis av private og kommunale
            kamera. Tolletaten og Statens vegvesen driv landsdekkjande <strong>ANPR</strong>, automatisk
            skiltattkjenning, som les og lagrar rørslene til kvar bil som passerer. Teleselskapa sit på
            lokasjons- og trafikkdata som kan hentast ut ved rettsordre. Saman utgjer dette ein kapasitet ingen
            einskild aktør har bygd med vilje, men som likevel finst.
          </p>
          <blockquote>
            <p>
              <strong>Infrastruktur for kontroll:</strong> summen av kamera, register og heimlar som gjer det
              mogleg å sjå, lagre og kople saman opplysningar om folk, uavhengig av kven som eig kvar einskild
              del.
            </p>
          </blockquote>
          <p>
            Påstanden er ikkje at Noreg er ein <em>overvakingsstat</em>. Påstanden er at sjølve{" "}
            <strong>kapasiteten</strong> alt er på plass, fordelt mellom mange hender, og at terskelen for å
            mobilisere han er låg og lite synleg. Demokratisk kontroll føreset at me kan sjå heile biletet,
            ikkje berre delane.
          </p>
        </section>
      </article>

      <section className="map-shell" aria-label="Overvakingskartet">
        <div className="map-intro">
          <h2>Kartet</h2>
          <p>
            Alt innhaldet ligg i Overvakingskartet nedanfor. Bruk <em>Type</em>-filteret for å sjå systema,
            aktørane, tilgangane eller målingane kvar for seg.
          </p>
        </div>

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
              <div className="state">Ingen grafdata enno. Køyr Notion-synken når GitHub secrets er sett.</div>
            )}
            {!loading && !error && visibleGraph.nodes.length > 0 && (
              <>
                <ForceGraph2D
                  ref={graphRef}
                  graphData={{ nodes: visibleGraph.nodes, links: visibleGraph.edges }}
                  backgroundColor="#fffdf8"
                  minZoom={minGraphZoom}
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
                      {selected.status && (
                        <div className="field">
                          <dt>Status</dt>
                          <dd>{selected.status}</dd>
                        </div>
                      )}
                    </dl>

                    {selectedConnections.length > 0 && (
                      <>
                        <div className="detail-rule" />
                        <p className="conn-title">Relasjonar</p>
                        {selectedConnections.map(({ edge, other }) => (
                          <button
                            type="button"
                            className="conn-row"
                            key={edge.id}
                            onClick={() => setSelected(other)}
                          >
                            <span className="conn-dot" style={{ background: edgeColor(edge) }} />
                            <span className="conn-name">{other.label}</span>
                            <span className="conn-rel">{edge.relasjonstype}</span>
                          </button>
                        ))}
                      </>
                    )}

                    {selected.kjeldeUrl && (
                      <a
                        className="detail-source"
                        href={selected.kjeldeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Opne kjelde ↗
                      </a>
                    )}
                  </aside>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <p>
          På lengre sikt skal same metode nyttast til å kartleggje korleis økonomisk og politisk makt er
          konsentrert i Noreg, etter mønster frå relasjonelle kartleggingar som <em>The Authoritarian Stack</em>.
        </p>
      </footer>
    </main>
  )
}
