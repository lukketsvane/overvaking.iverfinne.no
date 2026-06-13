/// <reference types="node" />

// Delt, tap-fri kjerne for å byggje grafen frå Notion-fasiten.
// Filer med understrek-prefiks blir ikkje rute-eksponerte av Vercel,
// så denne kan importerast trygt frå api/graph.ts og frå verifiseringsskript.

import { Client } from "@notionhq/client"

export type NotionPage = {
  id: string
  archived?: boolean
  in_trash?: boolean
  properties?: Record<string, any>
}

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
  kind: "tilgang" | "datadeling" | "sak" | "forsking"
  mekanisme?: string
  tilgangsniva?: number
  praksis?: string
  kjeldeUrl?: string
  kjeldeTittel?: string
  merknad?: string
  geografi?: string
  lag?: string
}

export type GraphPayload = {
  meta: {
    kjelde: string
    nodar: number
    kantar: number
    malingar: number
    foreldrelause: number
    lagFargar: Record<string, string>
    typeTal: Record<string, number>
  }
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const defaultLayerColors: Record<string, string> = {
  "Kamera og sensorar": "#3b82f6",
  "Register og biometri": "#8b5cf6",
  "Kommunikasjon og etterretning": "#ef4444",
  "Justis og kontroll": "#1f2937",
  Datainfrastruktur: "#06b6d4",
  "Kapital og eigarskap": "#f59e0b",
  "Politikk og styring": "#10b981",
  Media: "#ec4899",
  "Personar og roller": "#92400e",
}

// Notion-typar som er nodar (entitetar) vs. kantar vs. metrikkar.
const ENTITY_TYPES = new Set(["system", "organisasjon", "lovheimel", "tilsyn", "sak", "person", "forsking", "stad"])
const EDGE_TYPES = new Set(["tilgang", "datadeling"])
const METRIC_TYPE = "måling"
// Sak/Forsking blir kopla til det dei gjeld via "Knytt til".
const KNYTT_EDGE_TYPES = new Set(["sak", "forsking"])

let notionClient: Client | undefined

export function getNotion() {
  if (!process.env.NOTION_TOKEN) throw new Error("Manglar NOTION_TOKEN")
  notionClient ??= new Client({ auth: process.env.NOTION_TOKEN, notionVersion: "2025-09-03" })
  return notionClient
}

export function property(properties: Record<string, any>, names: string[]) {
  for (const name of names) if (properties[name]) return properties[name]
  return undefined
}

export function richTextToPlain(parts: any[] | undefined): string | undefined {
  if (Array.isArray(parts)) {
    const text = parts.map((part: any) => part.plain_text ?? "").join("").trim()
    if (text) return text
  }
  return undefined
}

export function plainText(prop: any): string | undefined {
  const text = richTextToPlain(prop?.title ?? prop?.rich_text)
  if (text) return text
  const multi = prop?.multi_select?.map((item: any) => item.name).filter(Boolean).join(", ")
  if (multi) return multi
  return prop?.select?.name ?? prop?.status?.name ?? prop?.url ?? prop?.email ?? prop?.phone_number ?? undefined
}

export function selectName(prop: any): string | undefined {
  return prop?.select?.name ?? prop?.status?.name ?? undefined
}

export function numberValue(prop: any): number | undefined {
  return typeof prop?.number === "number" ? prop.number : undefined
}

export function urlValue(prop: any): string | undefined {
  return prop?.url ?? undefined
}

export function relationIds(prop: any): string[] {
  return prop?.relation?.map((item: any) => item.id).filter(Boolean) ?? []
}

const NAME_KEYS = ["Namn", "Navn", "Name", "Tittel", "Title"]
const SKILDRING_KEYS = ["Skildring", "Beskrivelse", "Description"]
const MERKNAD_KEYS = ["Uvisse/merknad", "Merknad", "Note"]
const KJELDE_URL_KEYS = ["Kjelde-URL", "Kjelde URL", "URL", "Lenkje", "Link"]
const KJELDE_TITTEL_KEYS = ["Kjelde-tittel", "Kjeldetittel", "Kjelde", "Kilde"]
const FROM_KEYS = ["Frå (kjelde)", "Fra (kjelde)", "Frå", "Fra", "Source", "Kjelde"]
const TO_KEYS = ["Til (mål)", "Til (mal)", "Til", "Target", "Mål", "Mal"]
const KNYTT_KEYS = ["Knytt til", "Knyttet til", "Relatert"]

export function mapNode(page: NotionPage): GraphNode {
  const p = page.properties ?? {}
  const lag = selectName(property(p, ["Lag", "Layer"]))
  const skildring = plainText(property(p, SKILDRING_KEYS))
  const merknad = plainText(property(p, MERKNAD_KEYS))

  return {
    id: page.id,
    label: plainText(property(p, NAME_KEYS)) ?? "Utan namn",
    type: selectName(property(p, ["Type"])) ?? "Ukjend",
    lag,
    color: plainText(property(p, ["Farge", "Color"])) ?? (lag ? defaultLayerColors[lag] : undefined),
    sektor: selectName(property(p, ["Sektor", "Sector"])),
    orgType: selectName(property(p, ["Org-type", "Org Type", "Organisasjonstype"])),
    status: selectName(property(p, ["Status"])),
    kategori: selectName(property(p, ["Kategori", "Category"])),
    kjeldeUrl: urlValue(property(p, KJELDE_URL_KEYS)),
    kjeldeTittel: plainText(property(p, KJELDE_TITTEL_KEYS)),
    skildring: skildring ?? merknad,
    merknad: merknad && merknad !== skildring ? merknad : undefined,
    heimel: plainText(property(p, ["Heimel", "Hjemmel"])),
    geografi: plainText(property(p, ["Geografi", "Geography"])),
    prioritet: selectName(property(p, ["Prioritet", "Priority"])),
    verdiTekst: plainText(property(p, ["Verdi (tekst)", "Verditekst"])),
  }
}

function mapEdge(page: NotionPage, kind: GraphEdge["kind"]): GraphEdge | null {
  const p = page.properties ?? {}
  const source = relationIds(property(p, FROM_KEYS))[0]
  const target = relationIds(property(p, TO_KEYS))[0]
  const relasjonstype =
    selectName(property(p, ["Relasjonstype", "Relation", "Relation type"])) ?? selectName(property(p, ["Mekanisme", "Mechanism"]))
  if (!source || !target || !relasjonstype) return null

  return {
    id: page.id,
    source,
    target,
    relasjonstype,
    kind,
    mekanisme: selectName(property(p, ["Mekanisme", "Mechanism"])),
    tilgangsniva: numberValue(property(p, ["Tilgangsnivå", "Tilgangsniva", "Access level"])),
    praksis: selectName(property(p, ["Praksis (utlevering)", "Praksis", "Practice"])),
    kjeldeUrl: urlValue(property(p, KJELDE_URL_KEYS)),
    kjeldeTittel: plainText(property(p, KJELDE_TITTEL_KEYS)),
    merknad: plainText(property(p, MERKNAD_KEYS)),
    geografi: plainText(property(p, ["Geografi", "Geography"])),
    lag: selectName(property(p, ["Lag", "Layer"])),
  }
}

function mapMetric(page: NotionPage): Metric {
  const p = page.properties ?? {}
  return {
    id: page.id,
    metrikkType: selectName(property(p, ["Metrikk-type", "Metrikktype", "Metric"])),
    verdi: numberValue(property(p, ["Verdi", "Value"])),
    verdiTekst: plainText(property(p, ["Verdi (tekst)", "Verditekst"])),
    eining: plainText(property(p, ["Eining", "Enhet", "Unit"])),
    aar: numberValue(property(p, ["År", "Aar", "Year"])),
    kjeldeUrl: urlValue(property(p, KJELDE_URL_KEYS)),
    kjeldeTittel: plainText(property(p, KJELDE_TITTEL_KEYS)),
    merknad: plainText(property(p, MERKNAD_KEYS)),
  }
}

// Rein funksjon: byggjer heile grafen frå rådene. Testbar utan nettverk.
export function buildGraph(rows: NotionPage[]): GraphPayload {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const layerColors: Record<string, string> = { ...defaultLayerColors }
  const typeTal: Record<string, number> = {}
  const metricsByNode = new Map<string, Metric[]>()
  let malingar = 0

  // Pass 1: nodar, kantar, metrikkar.
  for (const page of rows) {
    if (page.archived || page.in_trash) continue
    const rawType = selectName(property(page.properties ?? {}, ["Type"])) ?? ""
    const t = rawType.toLowerCase()
    typeTal[rawType || "Ukjend"] = (typeTal[rawType || "Ukjend"] ?? 0) + 1

    if (ENTITY_TYPES.has(t)) {
      const node = mapNode(page)
      nodes.push(node)
      if (node.lag && node.color) layerColors[node.lag] = node.color
      continue
    }
    if (EDGE_TYPES.has(t)) {
      const edge = mapEdge(page, t as GraphEdge["kind"])
      if (edge) edges.push(edge)
      continue
    }
    if (t === METRIC_TYPE) {
      const metric = mapMetric(page)
      for (const targetId of relationIds(property(page.properties ?? {}, KNYTT_KEYS))) {
        const list = metricsByNode.get(targetId) ?? []
        list.push(metric)
        metricsByNode.set(targetId, list)
      }
      malingar += 1
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id))

  // Pass 2: hekt metrikkar på nodane sine.
  for (const node of nodes) {
    const metrics = metricsByNode.get(node.id)
    if (metrics?.length) node.metrics = metrics
  }

  // Pass 3: kopl Sak/Forsking til det dei gjeld (Knytt til) som lette kantar.
  for (const page of rows) {
    if (page.archived || page.in_trash) continue
    const t = (selectName(property(page.properties ?? {}, ["Type"])) ?? "").toLowerCase()
    if (!KNYTT_EDGE_TYPES.has(t)) continue
    if (!nodeIds.has(page.id)) continue
    const targets = relationIds(property(page.properties ?? {}, KNYTT_KEYS))
    targets.forEach((targetId, index) => {
      if (!nodeIds.has(targetId)) return
      edges.push({
        id: `${page.id}-knytt-${index}`,
        source: page.id,
        target: targetId,
        relasjonstype: "Gjeld",
        kind: t as GraphEdge["kind"],
      })
    })
  }

  // Fjern foreldrelause kantar (endepunkt utan node), men tel dei.
  const total = edges.length
  const liveEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  const foreldrelause = total - liveEdges.length

  return {
    meta: {
      kjelde: "Notion (live)",
      nodar: nodes.length,
      kantar: liveEdges.length,
      malingar,
      foreldrelause,
      lagFargar: layerColors,
      typeTal,
    },
    nodes,
    edges: liveEdges,
  }
}

export async function fetchAllRows(sourceId: string): Promise<NotionPage[]> {
  const notion = getNotion()
  const out: NotionPage[] = []
  let cursor: string | undefined

  do {
    const args = { page_size: 100, start_cursor: cursor }
    let res: any
    try {
      res = await (notion as any).dataSources.query({ data_source_id: sourceId, ...args })
    } catch {
      res = await (notion as any).databases.query({ database_id: sourceId, ...args })
    }
    out.push(...((res.results ?? []) as NotionPage[]))
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)

  return out.filter((page) => !page.archived && !page.in_trash)
}
