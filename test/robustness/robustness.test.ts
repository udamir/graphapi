// Test plan block X (robustness and performance)
import { performance } from "perf_hooks"
import { buildSchema, introspectionFromSchema } from "graphql"

import { buildFromIntrospection, buildFromSchema, lift, printSchema, toIR } from "../../src/index"
import { build, buildIntrospected, schemaOf } from "../helpers/schema"

vi.setConfig({ testTimeout: 120000 })

describe("X1 robustness: degenerate schemas", () => {
  it("X1.1 a schema with a single scalar and no operations", () => {
    const graphapi: any = build(`scalar X`)
    expect(graphapi.queries).toBeUndefined()
    expect(graphapi.components.scalars.X).toEqual({ title: "X", type: "scalar" })
    expect(printSchema(graphapi)).toBe("scalar X")
  })

  it("X1.2 a schema without a Query root", () => {
    const graphapi: any = build(`type Foo { a: Int }`)
    expect(graphapi.queries).toBeUndefined()
    expect(graphapi.components.objects.Foo.methods.a).toEqual({ type: "Int" })
    expect(printSchema(graphapi)).toBe("type Foo {\n  a: Int\n}")
  })

  it("X1.3 a document with nothing to print", () => {
    expect(printSchema({ graphapi: "1.0" })).toBe("")
    expect(printSchema({ graphapi: "1.0", components: {} })).toBe("")
  })

  it("X1.4 empty types produced by extend are tolerated", () => {
    const graphapi: any = build(`type Query { a: Int } enum E { A }`)
    graphapi.components.enums.E.values = {}
    expect(printSchema(graphapi)).toContain("enum E")
  })
})

describe("X2 robustness: invalid input", () => {
  it("X2.1 an empty SDL is rejected by graphql before reaching the builder", () => {
    expect(() => build("")).toThrow()
  })

  it("X2.2 buildFromSchema rejects a missing schema", () => {
    expect(() => buildFromSchema(null as any)).toThrow()
    expect(() => buildFromSchema(undefined as any)).toThrow()
  })

  it("X2.3 buildFromIntrospection rejects a missing or malformed introspection result", () => {
    expect(() => buildFromIntrospection({} as any)).toThrow()
    expect(() => buildFromIntrospection(null as any)).toThrow()
  })

  it("X2.4 buildFromIntrospection accepts an introspection without types or directives", () => {
    const graphapi = buildFromIntrospection({ __schema: { queryType: { name: "Query" }, types: [] } } as any)
    expect(graphapi).toEqual({ graphapi: "1.0", queryTypeName: "Query" })
  })

  it("X2.5 printSchema rejects an unexpected type schema", () => {
    expect(() => printSchema({ graphapi: "1.0", queries: { a: { type: "object" } } } as any)).toThrow(/Unexpected type/)
  })

  it("X2.6 printSchema, lift and toIR reject a document of another graphapi version or without graphapi", () => {
    const legacy = { graphapi: "0.1.2", queries: { a: { type: "integer", nullable: true } } } as any
    const unversioned = { queries: { a: { type: "Int" } } } as any
    for (const read of [printSchema, lift, toIR]) {
      expect(() => read(legacy)).toThrow("Unsupported graphapi version: 0.1.2")
      expect(() => read(unversioned)).toThrow("Unsupported graphapi version: undefined")
    }
  })
})

// generators for synthetic schemas

const wide = (types: number, fields: number, directives = false): string => {
  const parts: string[] = []
  if (directives) {
    parts.push(`directive @tag(name: String, n: Int = 1) repeatable on FIELD_DEFINITION | OBJECT | ARGUMENT_DEFINITION`)
  }
  parts.push(`enum Color { RED GREEN BLUE @deprecated(reason: "old") }`)
  parts.push(`input Filter { q: String, limit: Int = 10, color: Color = RED }`)
  for (let t = 0; t < types; t++) {
    const f: string[] = []
    for (let i = 0; i < fields; i++) {
      const target = i % 4 === 0 ? `T${(t + 1) % types}` : i % 4 === 1 ? "String" : i % 4 === 2 ? "[Int!]!" : "Color"
      const args = i % 3 === 0 ? `(filter: Filter, id: ID!${directives ? ' @tag(name: "arg")' : ""})` : ""
      const dir = directives && i % 2 === 0 ? ` @tag(name: "f${i}", n: ${i}) @deprecated(reason: "r${i}")` : ""
      f.push(`  "Field ${i} of type ${t}"\n  f${i}${args}: ${target}${dir}`)
    }
    parts.push(`"Type number ${t}"\ntype T${t}${directives ? ' @tag(name: "t")' : ""} {\n${f.join("\n")}\n}`)
  }
  parts.push(`type Query {\n${Array.from({ length: types }, (_, t) => `  t${t}(f: Filter): T${t}`).join("\n")}\n}`)
  return parts.join("\n\n")
}

const deep = (depth: number, width: number): string => {
  const parts: string[] = []
  for (let d = 0; d < depth; d++) {
    const f = Array.from({ length: width }, (_, i) => `  f${i}: ${d + 1 < depth ? `[[D${d + 1}!]!]` : "String"}`)
    parts.push(`type D${d} {\n${f.join("\n")}\n}`)
    parts.push(
      `input I${d} {\n${Array.from({ length: width }, (_, i) => `  f${i}: ${d + 1 < depth ? `[I${d + 1}!]` : "Int"}`).join("\n")}\n}`,
    )
  }
  parts.push(`type Query { root(i: I0): D0 }`)
  return parts.join("\n\n")
}

const bestOf = (runs: number, fn: () => unknown): number => {
  let best = Infinity
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

describe("X3 performance on generated schemas", () => {
  it("X3.1 1000 types x 10 fields: build, introspection build and print each complete well under a second", () => {
    const schema = buildSchema(wide(1000, 10), { noLocation: true })
    const introspection = introspectionFromSchema(schema)
    const graphapi = buildFromSchema(schema)
    expect(Object.keys(graphapi.components!.objects!).length).toBe(1000)
    expect(bestOf(3, () => buildFromSchema(schema))).toBeLessThan(1000)
    expect(bestOf(3, () => buildFromIntrospection(introspection))).toBeLessThan(1000)
    expect(bestOf(3, () => printSchema(graphapi))).toBeLessThan(1000)
  })

  it("X3.2 2000 types x 10 fields with directives on every other field: build and print under two seconds", () => {
    const schema = buildSchema(wide(2000, 10, true), { noLocation: true })
    const graphapi = buildFromSchema(schema)
    expect(bestOf(2, () => buildFromSchema(schema))).toBeLessThan(2000)
    expect(bestOf(2, () => printSchema(graphapi))).toBeLessThan(2000)
    expect(() => buildSchema(printSchema(graphapi), { noLocation: true })).not.toThrow()
  })

  it("X3.3 deep nesting (60 levels of list-of-list types) builds, prints and re-parses", () => {
    const sdl = deep(60, 10)
    const graphapi = build(sdl)
    expect(bestOf(3, () => build(sdl))).toBeLessThan(1000)
    expect(() => buildSchema(printSchema(graphapi), { noLocation: true })).not.toThrow()
    expect(buildIntrospected(sdl).components!.objects!.D59).toEqual(graphapi.components!.objects!.D59)
  })

  it("X3.4 a single type with 5000 fields builds and prints under a second", () => {
    const schema = schemaOf(wide(1, 5000))
    const graphapi = buildFromSchema(schema)
    expect(bestOf(3, () => buildFromSchema(schema))).toBeLessThan(1000)
    expect(bestOf(3, () => printSchema(graphapi))).toBeLessThan(1000)
  })

  // ISSUE-GA-14 (fixed in 0.6.0): buildFromIntrospection re-spreads the whole components.<kind> map for every type, which is O(n^2) in the number of types
  it("X3.5 buildFromIntrospection scales roughly linearly with the number of types (x4 types => less than x8 time)", () => {
    const small = introspectionFromSchema(buildSchema(wide(500, 10), { noLocation: true }))
    const large = introspectionFromSchema(buildSchema(wide(2000, 10), { noLocation: true }))
    const tSmall = bestOf(3, () => buildFromIntrospection(small))
    const tLarge = bestOf(3, () => buildFromIntrospection(large))
    expect(tLarge / tSmall).toBeLessThan(8)
  })
})
