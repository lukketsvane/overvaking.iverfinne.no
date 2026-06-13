import { useEffect, useMemo, useRef, useState } from "react"
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d"
import type { Graph, GraphEdge, GraphNode } from "./types"

const nodePalette = new Map<string, string>([
  ["Kamera og sensorar", "#4f8cff"],
  ["Register og biometri", "#9b6cff"],
  ["Kommunikasjon og etterretning", "#ff5d73"],
  ["Justis og kontroll", "#ff9d3f"],
  ["Datainfrastruktur", "#9aa4b2"],
  ["Kapital og eigarskap", "#40b66b"],
  ["Politikk og styring", "#e8c341"],
  ["Media", "#ff7bd5"],
])

const edgePalette = new Map<string, string>([
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

function textSet(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "nn"))
}

function nodeColor(node: GraphNode) {
  return nodePalette.get(node.lag ?? "") ?? "#7c8798"
}

function edgeColor(edge: GraphEdge) {
  return edgePalette.get(edge.relasjonstype ?? "") ?? "rgba(148, 163, 184, 0.72)"
}

function edgeWidth(edge: GraphEdge) {
  const level = edge.tilgangsniva ?? 1
  return Math.max(1, Math.min(5, level + 1))
}

export default function App() {
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphEdge>>()
  const [graph, setGraph] = useState<Graph>(emptyGraph)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState("Alle")
  const [lagFilter, setLagFilter] = useState("Alle")

  useEffect(() => {
    fetch("/data/graph.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Kunne ikkje lese data/graph.json (${res.status})`)
        return res.json() as Promise<Graph>
      })
      .then((data) => setGraph(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Ukjend feil"))
      .finally(() => setLoading(false))
  }, [])

  const types = useMemo(() => textSet(graph.nodes.map((node) => node.type)), [graph.nodes])
  const lags = useMemo(() => textSet(graph.nodes.map((node) => node.lag)), [graph.nodes])

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

  useEffect(() => {
    graphRef.current?.d3Force("charge")?.strength(-130)
    graphRef.current?.d3Force("link")?.distance(85)
  }, [visibleGraph])

  const stats = [
    { label: "Nodar", value: graph.nodes.length },
    { label: "Kantar", value: graph.edges.length },
    { label: "Synlege", value: visibleGraph.nodes.length },
  ]

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">opendata · noreg</p>
        <h1>Overvakingskartet</h1>
        <p className="lede">
          Eit ope, kjeldeført kart over system, organisasjonar, lovheimlar og datatilgang i norsk overvakingsinfrastruktur.
        </p>
      </header>

      <section className="panel controls" aria-label="Filter">
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
      </section>

      <section className="graph-card">
        {loading && <div className="state">Lastar grafdata …</div>}
        {error && <div className="state error">{error}</div>}
        {!loading && !error && visibleGraph.nodes.length === 0 && (
          <div className="state">
            Ingen grafdata enno. Køyr Notion-synken når GitHub secrets er sett.
          </div>
        )}
        {!loading && !error && visibleGraph.nodes.length > 0 && (
          <ForceGraph2D
            ref={graphRef}
            graphData={visibleGraph}
            nodeId="id"
            nodeLabel={(node) => `${node.label} · ${node.type}${node.lag ? ` · ${node.lag}` : ""}`}
            linkSource="source"
            linkTarget="target"
            linkLabel={(link) => link.relasjonstype}
            linkColor={(link) => edgeColor(link)}
            linkWidth={(link) => edgeWidth(link)}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = node.label
              const radius = Math.max(5, Math.min(12, 8 / Math.sqrt(globalScale)))
              ctx.beginPath()
              ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
              ctx.fillStyle = nodeColor(node)
              ctx.fill()
              if (globalScale > 0.8) {
                ctx.font = `${12 / globalScale}px Inter, system-ui, sans-serif`
                ctx.textAlign = "center"
                ctx.textBaseline = "top"
                ctx.fillStyle = "#d7dde8"
                ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + radius + 3)
              }
            }}
            onNodeClick={(node) => {
              if (node.kjeldeUrl) window.open(node.kjeldeUrl, "_blank", "noopener,noreferrer")
            }}
          />
        )}
      </section>
    </main>
  )
}
