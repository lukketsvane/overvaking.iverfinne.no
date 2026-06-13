import { Client } from "@notionhq/client"
import { mkdirSync, writeFileSync } from "node:fs"

type GraphNode = {
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

type GraphEdge = {
  id: string
  source: string
  target: string
  relasjonstype: string
  mekanisme?: string
  tilgangsniva?: number
  praksis?: string
}

const notionToken = process.env.NOTION_TOKEN
const notionDbId = process.env.NOTION_DB_ID

if (!notionToken) throw new Error("Mangler NOTION_TOKEN")
if (!notionDbId) throw new Error("Mangler NOTION_DB_ID")

const notion = new Client({ auth: notionToken }) as any

const ENTITIES = new Set(["System", "Organisasjon", "Tilsyn", "Lovheimel", "Sak"])
const EDGES = new Set(["Tilgang", "Datadeling"])

const selectName = (property: any): string | undefined => property?.select?.name ?? undefined
const numberValue = (property: any): number | undefined => property?.number ?? undefined
const urlValue = (property: any): string | undefined => property?.url ?? undefined
const relationIds = (property: any): string[] => property?.relation?.map((item: any) => item.id).filter(Boolean) ?? []
const relationFirst = (property: any): string | undefined => relationIds(property)[0]

function textValue(property: any): string | undefined {
  const parts = property?.title ?? property?.rich_text ?? []
  const text = parts.map((part: any) => part.plain_text).join("").trim()
  return text || undefined
}

async function queryDatabase(startCursor?: string) {
  const args = {
    database_id: notionDbId,
    start_cursor: startCursor,
    page_size: 100,
  }

  try {
    return await notion.databases.query(args)
  } catch (error) {
    if (!notion.dataSources?.query) throw error
    return notion.dataSources.query({
      data_source_id: notionDbId,
      start_cursor: startCursor,
      page_size: 100,
    })
  }
}

async function run() {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  let cursor: string | undefined

  do {
    const res = await queryDatabase(cursor)

    for (const page of res.results ?? []) {
      if (page.archived || page.in_trash) continue

      const properties = page.properties ?? {}
      const type = selectName(properties["Type"])
      if (!type) continue

      if (ENTITIES.has(type)) {
        nodes.push({
          id: page.id,
          label: textValue(properties["Namn"]) ?? "Utan namn",
          type,
          lag: selectName(properties["Lag"]),
          sektor: selectName(properties["Sektor"]),
          orgType: selectName(properties["Org-type"]),
          status: selectName(properties["Status"]),
          kategori: selectName(properties["Kategori"]),
          kjeldeUrl: urlValue(properties["Kjelde-URL"]),
        })
        continue
      }

      if (EDGES.has(type)) {
        const source = relationFirst(properties["Frå (kjelde)"])
        const target = relationFirst(properties["Til (mål)"])
        const relasjonstype = selectName(properties["Relasjonstype"]) ?? selectName(properties["Mekanisme"])

        if (!source || !target || !relasjonstype) continue

        edges.push({
          id: page.id,
          source,
          target,
          relasjonstype,
          mekanisme: selectName(properties["Mekanisme"]),
          tilgangsniva: numberValue(properties["Tilgangsnivå"]),
          praksis: selectName(properties["Praksis (utlevering)"]),
        })
      }
    }

    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)

  const graph = { nodes, edges }
  mkdirSync("data", { recursive: true })
  writeFileSync("data/graph.json", `${JSON.stringify(graph, null, 2)}\n`)
  console.log(`Skreiv ${nodes.length} nodar og ${edges.length} kantar til data/graph.json.`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
