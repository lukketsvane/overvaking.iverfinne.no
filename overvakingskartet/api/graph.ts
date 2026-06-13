/// <reference types="node" />

// Live Notion-endepunkt. Kjernen (nodar/kantar/metrikkar) ligg i ./_graph.
// Her limer vi på artikkel-/innhaldsblokkene og serverer svaret med cache.

import {
  buildGraph,
  fetchAllRows,
  getNotion,
  numberValue,
  plainText,
  property,
  richTextToPlain,
  selectName,
  urlValue,
  type NotionPage,
} from "./_graph.js"

type ContentBlock = {
  id: string
  section: string
  kind: "heading" | "paragraph" | "quote" | "list"
  title?: string
  body: string
  href?: string
  linkText?: string
  order: number
}

const contentTypes = new Set(["tekst", "essay", "intro", "avsnitt", "sitat", "punkt", "overskrift", "innhald", "innhold"])
const knownSections = new Set(["hero", "purpose", "infrastructure", "map", "footer"])

function checkboxValue(prop: any): boolean | undefined {
  return typeof prop?.checkbox === "boolean" ? prop.checkbox : undefined
}

function normalizeKind(value: string | undefined): ContentBlock["kind"] {
  const n = value?.toLowerCase()
  if (n === "overskrift" || n === "heading" || n === "tittel") return "heading"
  if (n === "sitat" || n === "quote") return "quote"
  if (n === "punkt" || n === "list" || n === "liste" || n === "bulleted_list_item" || n === "numbered_list_item") return "list"
  return "paragraph"
}

function matchSection(value: string | undefined) {
  const n = value?.trim().toLowerCase()
  if (!n) return undefined
  if (["hero", "topp", "intro", "introduksjon"].includes(n)) return "hero"
  if (n.includes("føremål") || n.includes("formål") || n.includes("purpose")) return "purpose"
  if (n.includes("infrastruktur") || n.includes("kontroll") || n.includes("infrastructure")) return "infrastructure"
  if (n.includes("kart") || n.includes("map") || n.includes("graf")) return "map"
  if (["footer", "fot"].includes(n)) return "footer"
  return undefined
}

function normalizeSection(value: string | undefined) {
  return matchSection(value) ?? value?.trim().toLowerCase() ?? "intro"
}

function isSectionMarkerOnly(value: string) {
  return ["hero", "topp", "intro", "introduksjon", "footer", "fot"].includes(value.trim().toLowerCase())
}

async function queryChildBlocks(blockId: string) {
  const notion = getNotion()
  const out: any[] = []
  let cursor: string | undefined
  do {
    const res = await (notion as any).blocks.children.list({ block_id: blockId, page_size: 100, start_cursor: cursor })
    out.push(...(res.results ?? []))
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return out
}

async function queryContentPage(pageId: string) {
  const rows = await queryChildBlocks(pageId)
  const blocks: ContentBlock[] = []
  let section = "hero"
  let heroHeadingCount = 0

  rows.forEach((block, index) => {
    const type = block.type
    const body = richTextToPlain(block[type]?.rich_text)
    if (!body) return
    const matched = matchSection(body)
    const isHeading = type === "heading_1" || type === "heading_2" || type === "heading_3"
    if (isHeading && matched && knownSections.has(matched)) section = matched
    if (isHeading && isSectionMarkerOnly(body)) return

    const kind: ContentBlock["kind"] = isHeading
      ? "heading"
      : type === "quote"
        ? "quote"
        : type === "bulleted_list_item" || type === "numbered_list_item"
          ? "list"
          : "paragraph"

    const item: ContentBlock = { id: block.id, section, kind, body, order: index }
    if (section === "hero" && kind === "heading") {
      item.title = heroHeadingCount === 0 ? "title" : "eyebrow"
      heroHeadingCount += 1
    }
    blocks.push(item)
  })

  return blocks
}

function mapContent(page: NotionPage, index: number): ContentBlock | null {
  const p = page.properties ?? {}
  if (checkboxValue(property(p, ["Publiser", "Synleg", "Visible", "Public"])) === false) return null
  const title = plainText(property(p, ["Tittel", "Namn", "Navn", "Name", "Title"]))
  const body = plainText(property(p, ["Tekst", "Innhald", "Innhold", "Body", "Content", "Description", "Ingress"])) ?? title
  if (!body) return null

  return {
    id: page.id,
    section: normalizeSection(
      selectName(property(p, ["Seksjon", "Section", "Plassering"])) ?? plainText(property(p, ["Seksjon", "Section", "Plassering"])),
    ),
    kind: normalizeKind(selectName(property(p, ["Variant", "Blokk", "Blokktype", "Kind", "Teksttype"])) ?? selectName(property(p, ["Type"]))),
    title: title && title !== body ? title : undefined,
    body,
    href: urlValue(property(p, ["Kjelde-URL", "Kjelde URL", "URL", "Lenkje", "Link"])),
    linkText: plainText(property(p, ["Lenketekst", "Link text", "Kjelde", "Kilde"])),
    order: numberValue(property(p, ["Rekkefølgje", "Rekkefolge", "Sortering", "Order"])) ?? index,
  }
}

async function handleGraphRequest() {
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID
  const databaseId = process.env.NOTION_DB_ID
  const sourceId = dataSourceId ?? databaseId
  const contentPageId = process.env.NOTION_CONTENT_PAGE_ID ?? process.env.NOTION_INTRO_PAGE_ID

  if (!process.env.NOTION_TOKEN || !sourceId) {
    return Response.json({ error: "Manglar NOTION_TOKEN eller NOTION_DATA_SOURCE_ID/NOTION_DB_ID" }, { status: 500 })
  }

  try {
    const rows = await fetchAllRows(sourceId, dataSourceId ? "dataSource" : "database")
    const graph = buildGraph(rows)

    const blocks: ContentBlock[] = []
    rows.forEach((page, index) => {
      const type = (selectName(property(page.properties ?? {}, ["Type"])) ?? "").toLowerCase()
      const looksLikeContent =
        contentTypes.has(type) || plainText(property(page.properties ?? {}, ["Tekst", "Innhald", "Innhold", "Body", "Content"]))
      if (!looksLikeContent) return
      const content = mapContent(page, index)
      if (content) blocks.push(content)
    })
    if (contentPageId) blocks.push(...(await queryContentPage(contentPageId)))
    blocks.sort((a, b) => a.order - b.order)

    return Response.json(
      { meta: graph.meta, content: { blocks }, nodes: graph.nodes, edges: graph.edges },
      { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=3600" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjend Notion-feil"
    return Response.json({ error: message }, { status: 500 })
  }
}

export function GET() {
  return handleGraphRequest()
}

export default async function handler(_request: Request, response?: any) {
  const result = await handleGraphRequest()
  if (!response?.status) return result
  result.headers.forEach((value, key) => response.setHeader?.(key, value))
  const body = await result.text()
  response.status(result.status)
  if (result.headers.get("content-type")?.includes("application/json")) {
    response.json(JSON.parse(body))
    return
  }
  response.send(body)
}
