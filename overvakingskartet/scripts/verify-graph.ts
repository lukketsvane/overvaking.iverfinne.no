// Verifiserer at byggjaren representerer Notion-fasiten tap-fritt.
// Køyrer mot live Notion, skriv ut statistikk, og lagrar eit rikt
// statisk snapshot til public/data/graph.json (frontend-fallback).
// Køyrer IKKJE deploy. Token blir lese frå miljøet, aldri skrive ut.

import { mkdirSync, writeFileSync } from "node:fs"
import { buildGraph, fetchAllRows, type GraphEdge, type GraphNode } from "../api/_graph.js"

const sourceId = process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID
if (!sourceId) throw new Error("Manglar NOTION_DATA_SOURCE_ID/NOTION_DB_ID")

const rows = await fetchAllRows(sourceId)
const g = buildGraph(rows)

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0)
const nodesWith = (f: (n: GraphNode) => unknown) => g.nodes.filter(f).length
const tilgang = g.edges.filter((e: GraphEdge) => e.kind === "tilgang")
const edgesWith = (list: GraphEdge[], f: (e: GraphEdge) => unknown) => list.filter(f).length

console.log("══ REPRESENTASJON ══")
console.log(`nodar ${g.meta.nodar} · kantar ${g.meta.kantar} · målingar ${g.meta.malingar} · foreldrelause kantar ${g.meta.foreldrelause}`)
console.log("typar:", JSON.stringify(g.meta.typeTal))
console.log("\n── nodar (fyllingsgrad) ──")
console.log(`skildring  ${nodesWith((n) => n.skildring)}/${g.nodes.length} (${pct(nodesWith((n) => n.skildring), g.nodes.length)}%)`)
console.log(`kjelde-URL ${nodesWith((n) => n.kjeldeUrl)}/${g.nodes.length} (${pct(nodesWith((n) => n.kjeldeUrl), g.nodes.length)}%)`)
console.log(`heimel     ${nodesWith((n) => n.heimel)}/${g.nodes.length}`)
console.log(`metrikkar  ${nodesWith((n) => n.metrics?.length)} nodar har minst éi måling`)
console.log("\n── Tilgang-kantar (kjernen) ──")
console.log(`tal        ${tilgang.length}`)
console.log(`tilgangsnivå ${edgesWith(tilgang, (e) => typeof e.tilgangsniva === "number")}/${tilgang.length}`)
console.log(`mekanisme    ${edgesWith(tilgang, (e) => e.mekanisme)}/${tilgang.length}`)
console.log(`praksis      ${edgesWith(tilgang, (e) => e.praksis)}/${tilgang.length}`)
console.log(`kjelde-URL   ${edgesWith(tilgang, (e) => e.kjeldeUrl)}/${tilgang.length}`)

const sample = g.nodes.find((n) => /DNA/i.test(n.label)) ?? g.nodes[0]
console.log("\n── døme-node ──")
console.log(JSON.stringify({ label: sample.label, type: sample.type, skildring: sample.skildring?.slice(0, 90), kjeldeUrl: sample.kjeldeUrl, metrics: sample.metrics?.length ?? 0 }, null, 2))

mkdirSync("public/data", { recursive: true })
writeFileSync("public/data/graph.json", `${JSON.stringify({ meta: g.meta, nodes: g.nodes, edges: g.edges }, null, 2)}\n`)
console.log("\nSkreiv rikt snapshot → public/data/graph.json (fallback)")
