import {
  buildSchema,
  getIntrospectionQuery,
  graphqlSync,
  printSchema as graphqlPrintSchema,
  lexicographicSortSchema,
  valueFromAST,
  GraphQLArgument,
  GraphQLInputField,
  GraphQLSchema,
  IntrospectionQuery,
} from "graphql"

import fs from "fs"
import path from "path"

import { buildFromIntrospection, buildFromSchema, printSchema } from "../../src/index"
import type { GraphApiSchema } from "../../src/index"

export const INTROSPECTION_OPTIONS = {
  inputValueDeprecation: true,
  schemaDescription: true,
  specifiedByUrl: true,
  directiveIsRepeatable: true,
} as const

export const schemaOf = (sdl: string): GraphQLSchema => buildSchema(sdl, { noLocation: true })

export const introspectionOf = (schema: GraphQLSchema): IntrospectionQuery => {
  const result = graphqlSync({ schema, source: getIntrospectionQuery(INTROSPECTION_OPTIONS) })
  if (result.errors) {
    throw new Error(result.errors.map((e) => e.message).join("\n"))
  }
  return result.data as unknown as IntrospectionQuery
}

// the default value of an argument or input field: graphql@16 coerces it into `defaultValue`, graphql@17 keeps `default`
export const defaultOf = (arg: GraphQLArgument | GraphQLInputField): unknown => {
  if (arg.defaultValue !== undefined) {
    return arg.defaultValue
  }
  const config = (arg as { default?: { value?: unknown; literal?: Parameters<typeof valueFromAST>[0] } }).default
  if (!config) {
    return undefined
  }
  return config.literal ? valueFromAST(config.literal, arg.type) : config.value
}

export const build = (sdl: string): GraphApiSchema => buildFromSchema(schemaOf(sdl))

export const buildIntrospected = (sdl: string): GraphApiSchema => buildFromIntrospection(introspectionOf(schemaOf(sdl)))

// canonical SDL of a schema, as graphql-js prints it after lexicographic sorting
export const canonical = (schema: GraphQLSchema): string => graphqlPrintSchema(lexicographicSortSchema(schema))

export const printAndReparse = (graphapi: GraphApiSchema): GraphQLSchema => schemaOf(printSchema(graphapi))

export const roundTrip = (
  sdl: string,
): {
  source: GraphQLSchema
  graphapi: GraphApiSchema
  printed: string
  reparsed: GraphQLSchema
  graphapi2: GraphApiSchema
} => {
  const source = schemaOf(sdl)
  const graphapi = buildFromSchema(source)
  const printed = printSchema(graphapi)
  const reparsed = schemaOf(printed)
  return { source, graphapi, printed, reparsed, graphapi2: buildFromSchema(reparsed) }
}

// collects every `$ref` string found anywhere inside a value
export const collectRefs = (value: unknown, refs: string[] = []): string[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, refs))
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "$ref" && typeof item === "string") {
        refs.push(item)
      } else {
        collectRefs(item, refs)
      }
    }
  }
  return refs
}

export const resolveRef = (graphapi: GraphApiSchema, ref: string): unknown => {
  if (!ref.startsWith("#/")) {
    return undefined
  }
  return ref
    .slice(2)
    .split("/")
    .reduce<any>((node, segment) => node?.[segment], graphapi)
}

/**
 * Removes custom directive usages, which introspection cannot carry, from a document: every `directives` key
 * except the definitions under `components.directives`; the `@deprecated` usages (derived from the deprecation)
 * are kept.
 */
export const withoutCustomUsages = <T extends GraphApiSchema>(doc: T): T => {
  const strip = (node: unknown, isComponents = false): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => strip(item))
    }
    if (!node || typeof node !== "object") {
      return node
    }
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "directives" && !isComponents) {
        if (Array.isArray(value)) {
          const kept = value.filter((usage) => usage?.$ref === "#/components/directives/deprecated")
          if (kept.length) {
            result[key] = kept
          }
        }
        continue
      }
      result[key] = strip(value, key === "components")
    }
    return result
  }
  return strip(doc) as T
}

/** Every `.graphql` fixture under test/resources, as [relative path, SDL] */
export const fixtures = (): [string, string][] => {
  const root = path.join(__dirname, "../resources")
  const result: [string, string][] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith(".graphql")) {
        result.push([path.relative(root, full), fs.readFileSync(full, "utf8")])
      }
    }
  }
  walk(root)
  return result.sort(([a], [b]) => a.localeCompare(b))
}
