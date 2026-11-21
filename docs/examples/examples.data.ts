/**
 * Renders every example schema through every conversion at build time, so the examples page always shows the
 * output of the current sources.
 */
import { buildSchema, introspectionFromSchema, lexicographicSortSchema, printSchema as printGraphQL } from "graphql"
import { createMarkdownRenderer, defineLoader } from "vitepress"

import { buildFromIntrospection, buildFromSchema, printSchema } from "../../src/index"
import { CASES } from "../.vitepress/theme/cases"
import { INTROSPECTION_OPTIONS, encodeState, serialize, userIntrospection } from "../.vitepress/theme/convert"
import { validateDocument } from "../.vitepress/theme/validate"

export interface ExamplePanel {
  id: "sdl" | "introspection" | "graphapi" | "printed"
  label: string
  /** highlighted HTML of the code block */
  html: string
  note?: string
}

export interface Example {
  id: string
  title: string
  spec: string
  demo: string
  panels: ExamplePanel[]
  /** print(build(sdl)) is equivalent to sdl */
  lossless: boolean
  /** the introspection build equals the schema build */
  introspectionIdentical: boolean
  /** the document validates against the published JSON Schema */
  valid: boolean
}

declare const data: Record<string, Example>
export { data }

const canonical = (sdl: string): string => printGraphQL(lexicographicSortSchema(buildSchema(sdl)))

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export default defineLoader({
  watch: ["../.vitepress/theme/*.ts", "../../schemas/*.json", "../../src/**/*.ts"],
  async load(): Promise<Record<string, Example>> {
    const md = await createMarkdownRenderer(process.cwd())
    // VitePress highlights code asynchronously, so `render` would leave the blocks unhighlighted
    const code = (language: string, text: string): Promise<string> =>
      md.renderAsync("```" + language + "\n" + text.trimEnd() + "\n```\n")

    const result: Record<string, Example> = {}
    for (const item of CASES) {
      const schema = buildSchema(item.sdl)
      const introspection = introspectionFromSchema(schema, INTROSPECTION_OPTIONS)
      const doc = buildFromSchema(schema)
      const printed = printSchema(doc)

      result[item.id] = {
        id: item.id,
        title: item.title,
        spec: item.spec,
        demo: encodeState({ source: "sdl", target: "graphapi", format: "yaml", text: item.sdl }),
        lossless: canonical(printed) === canonical(item.sdl),
        introspectionIdentical: same(buildFromIntrospection(introspection), doc),
        valid: validateDocument(doc).valid,
        panels: [
          { id: "sdl", label: "GraphQL SDL", html: await code("graphql", item.sdl) },
          {
            id: "introspection",
            label: "Introspection",
            html: await code("json", serialize(userIntrospection(introspection), "json")),
            note: "introspectionFromSchema(schema) — introspection types, built-in scalars and specified directives left out",
          },
          {
            id: "graphapi",
            label: "GraphAPI",
            html: await code("yaml", serialize(doc, "yaml")),
            note: "buildFromSchema(schema)",
          },
          {
            id: "printed",
            label: "Back to SDL",
            html: await code("graphql", printed),
            note: "printSchema(graphapi)",
          },
        ],
      }
    }
    return result
  },
})
