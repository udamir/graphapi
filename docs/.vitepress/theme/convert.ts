/**
 * Every conversion the documentation shows, between GraphQL SDL, introspection results and GraphAPI documents.
 * Shared by the online demo (browser) and the examples data loader (build time), so both produce the same output.
 */
import { buildSchema, introspectionFromSchema, specifiedDirectives, type IntrospectionQuery } from "graphql"
import { dump, load } from "js-yaml"

import { buildFromIntrospection, buildFromSchema, fromIR, printSchema, toIR } from "../../../src/index"
import type { GraphApiSchema } from "../../../src/index"

export type SourceKind = "sdl" | "introspection" | "graphapi"
export type TargetKind = "graphapi" | "sdl" | "introspection"
export type TextFormat = "yaml" | "json"
export type Language = "graphql" | "json" | "yaml"

export const SOURCES: { id: SourceKind; label: string; language: Language }[] = [
  { id: "sdl", label: "GraphQL SDL", language: "graphql" },
  { id: "introspection", label: "Introspection", language: "json" },
  { id: "graphapi", label: "GraphAPI", language: "yaml" },
]

export const TARGETS: { id: TargetKind; label: string }[] = [
  { id: "graphapi", label: "GraphAPI" },
  { id: "sdl", label: "GraphQL SDL" },
  { id: "introspection", label: "Introspection" },
]

/** Asks for every optional introspection field, so the introspection build is as complete as the schema build */
export const INTROSPECTION_OPTIONS = {
  descriptions: true,
  inputValueDeprecation: true,
  schemaDescription: true,
  specifiedByUrl: true,
  directiveIsRepeatable: true,
  oneOf: true,
} as const

const INTROSPECTION_OPTIONS_CODE =
  "{ inputValueDeprecation: true, schemaDescription: true, specifiedByUrl: true, directiveIsRepeatable: true }"

export interface Conversion {
  output: string
  language: Language
  /** the gqlapi / graphql-js calls that perform the conversion */
  code: string
  /** what the conversion cannot carry over */
  notes: string[]
}

export const serialize = (value: unknown, format: TextFormat): string =>
  format === "yaml" ? dump(value, { noRefs: true, lineWidth: 120 }) : JSON.stringify(value, null, 2) + "\n"

/** Accepts a bare introspection result (`{ __schema }`) and a full GraphQL response (`{ data: { __schema } }`) */
export const parseIntrospection = (text: string): IntrospectionQuery => {
  const parsed = JSON.parse(text) as { data?: IntrospectionQuery } & Partial<IntrospectionQuery>
  const introspection = parsed.data ?? parsed
  if (!introspection || typeof introspection !== "object" || !("__schema" in introspection)) {
    throw new Error('Expected an introspection result: { "__schema": { ... } } or { "data": { "__schema": ... } }')
  }
  return introspection as IntrospectionQuery
}

/** Parses a GraphAPI document written as YAML or JSON (JSON is valid YAML) */
export const parseGraphApi = (text: string): GraphApiSchema => {
  const doc = load(text)
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("Expected a GraphAPI document (a YAML or JSON object)")
  }
  return doc as GraphApiSchema
}

const LOST_IN_INTROSPECTION =
  "Introspection does not expose directive usages, so custom directive usages are not carried over."

export const convert = (source: SourceKind, text: string, target: TargetKind, format: TextFormat): Conversion => {
  switch (source) {
    case "sdl": {
      const schema = buildSchema(text)
      if (target === "graphapi") {
        return {
          output: serialize(buildFromSchema(schema), format),
          language: format,
          code: "const graphapi = buildFromSchema(buildSchema(sdl))",
          notes: [],
        }
      }
      if (target === "sdl") {
        return {
          output: printSchema(buildFromSchema(schema)),
          language: "graphql",
          code: "const printed = printSchema(buildFromSchema(buildSchema(sdl)))",
          notes: [
            "The SDL went through a GraphAPI document and back: a lossless round trip prints an equivalent schema.",
          ],
        }
      }
      return {
        output: serialize(introspectionFromSchema(schema, INTROSPECTION_OPTIONS), "json"),
        language: "json",
        code: `const introspection = introspectionFromSchema(buildSchema(sdl), ${INTROSPECTION_OPTIONS_CODE})`,
        notes: [LOST_IN_INTROSPECTION],
      }
    }

    case "introspection": {
      const introspection = parseIntrospection(text)
      if (target === "graphapi") {
        return {
          output: serialize(buildFromIntrospection(introspection), format),
          language: format,
          code: "const graphapi = buildFromIntrospection(introspection)",
          notes: [LOST_IN_INTROSPECTION],
        }
      }
      if (target === "sdl") {
        return {
          output: printSchema(buildFromIntrospection(introspection)),
          language: "graphql",
          code: "const sdl = printSchema(buildFromIntrospection(introspection))",
          notes: [LOST_IN_INTROSPECTION],
        }
      }
      return {
        output: serialize(introspection, "json"),
        language: "json",
        code: "// nothing to convert: the input already is an introspection result",
        notes: [],
      }
    }

    case "graphapi": {
      const doc = parseGraphApi(text)
      if (target === "graphapi") {
        return {
          output: serialize(fromIR(toIR(doc)), format),
          language: format,
          code: "const normalized = fromIR(toIR(graphapi))",
          notes: ["The document is normalized through the intermediate representation."],
        }
      }
      if (target === "sdl") {
        return { output: printSchema(doc), language: "graphql", code: "const sdl = printSchema(graphapi)", notes: [] }
      }
      return {
        output: serialize(introspectionFromSchema(buildSchema(printSchema(doc)), INTROSPECTION_OPTIONS), "json"),
        language: "json",
        code: `const introspection = introspectionFromSchema(buildSchema(printSchema(graphapi)), ${INTROSPECTION_OPTIONS_CODE})`,
        notes: [LOST_IN_INTROSPECTION],
      }
    }
  }
}

const SPECIFIED_DIRECTIVES = new Set(specifiedDirectives.map((directive) => directive.name))
const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"])

/** The introspection result without the introspection types, built-in scalars and specified directives, for display */
export const userIntrospection = (introspection: IntrospectionQuery): IntrospectionQuery => ({
  __schema: {
    ...introspection.__schema,
    types: introspection.__schema.types.filter(
      (type) => !type.name.startsWith("__") && !BUILTIN_SCALARS.has(type.name),
    ),
    directives: introspection.__schema.directives.filter((directive) => !SPECIFIED_DIRECTIVES.has(directive.name)),
  },
})

/** Encodes the demo state into a URL hash and back (base64url of UTF-8 JSON) */
export interface DemoState {
  source: SourceKind
  target: TargetKind
  format: TextFormat
  text: string
}

export const encodeState = (state: DemoState): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(state))
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export const decodeState = (hash: string): DemoState | undefined => {
  try {
    const binary = atob(hash.replace(/-/g, "+").replace(/_/g, "/"))
    const state = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))),
    ) as DemoState
    const valid =
      SOURCES.some((item) => item.id === state.source) &&
      TARGETS.some((item) => item.id === state.target) &&
      (state.format === "yaml" || state.format === "json") &&
      typeof state.text === "string"
    return valid ? state : undefined
  } catch {
    return undefined
  }
}
