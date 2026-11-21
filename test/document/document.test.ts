// Test plan block V (graphapi 1.0 document): structure, representation facts (C.x: the design analysis of 0.5.1), round trips, parity
import { buildFromIntrospection, buildFromSchema, fromIR, printSchema, toIR } from "../../src/index"
import type { GraphApiSchema } from "../../src/index"
import {
  build,
  buildIntrospected,
  canonical,
  collectRefs,
  introspectionOf,
  schemaOf,
  withoutCustomUsages,
} from "../helpers/schema"

// the result type of an operation or field: the flat type usage keys next to its args, description and directives
const output = (operation: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(operation).filter(
      ([key]) => key === "$ref" || key === "type" || key === "items" || key === "nonNull",
    ),
  )

const SDL = `
  directive @meta(s: String, i: Int) repeatable on FIELD_DEFINITION | OBJECT | SCHEMA | ENUM_VALUE
  "ISO date"
  scalar Date @specifiedBy(url: "https://example.com/date")
  interface Node { id: ID! }
  interface Named implements Node { id: ID!, name: String }
  type User implements Named & Node @meta(s: "u") @meta(s: "u2", i: 2) {
    id: ID!
    name: String
    born: Date
    friends(first: Int! = 10, after: ID): [User!]! @meta(s: "f") @deprecated(reason: "use connections")
  }
  type Post implements Node { id: ID!, author: User! }
  union Entity = User | Post
  enum Role { ADMIN "Regular user" USER @deprecated @meta(s: "v") }
  input Filter { role: Role = USER, ids: [ID!]!, q: String, limit: Int! = 5 }
  type Query { entity(id: ID!): Entity, users(filter: Filter!, limit: Int): [User], node: Node, date: Date }
  type Mutation { touch(id: ID!): Boolean! }
`

describe("V1 graphapi 1.0: document structure", () => {
  const doc: any = build(SDL)

  it("V1.1 carries the version and the root type names", () => {
    expect(doc.graphapi).toBe("1.0")
    expect(doc.queryTypeName).toBe("Query")
    expect(doc.mutationTypeName).toBe("Mutation")
    expect(doc.subscriptionTypeName).toBeUndefined()
    expect(Object.keys(doc)).toEqual([
      "graphapi",
      "queryTypeName",
      "mutationTypeName",
      "queries",
      "mutations",
      "components",
    ])
  })

  it("V1.2 operations have args and their result type written flat next to them", () => {
    expect(doc.queries.users).toEqual({
      args: {
        filter: { $ref: "#/components/inputObjects/Filter", nonNull: true },
        limit: { type: "Int" },
      },
      type: "list",
      items: { $ref: "#/components/objects/User" },
    })
    expect(output(doc.mutations.touch)).toEqual({ type: "Boolean", nonNull: true })
  })

  it("V1.3 definitions carry an explicit kind", () => {
    expect(doc.components.scalars.Date).toEqual({
      title: "Date",
      description: "ISO date",
      specifiedByURL: "https://example.com/date",
      type: "scalar",
    })
    expect(doc.components.objects.User.type).toBe("object")
    expect(doc.components.interfaces.Node.type).toBe("interface")
    expect(doc.components.unions.Entity).toEqual({
      title: "Entity",
      type: "union",
      oneOf: [{ $ref: "#/components/objects/User" }, { $ref: "#/components/objects/Post" }],
    })
    expect(doc.components.enums.Role.type).toBe("enum")
    expect(doc.components.inputObjects.Filter.type).toBe("input")
  })

  it("V1.4 fields are methods with the operation shape", () => {
    expect(doc.components.objects.User.methods.friends).toEqual({
      deprecation: { reason: "use connections" },
      directives: [
        { $ref: "#/components/directives/deprecated", meta: { reason: "use connections" } },
        { $ref: "#/components/directives/meta", meta: { s: "f" } },
      ],
      args: {
        first: { type: "Int", nonNull: true, default: 10 },
        after: { type: "ID" },
      },
      type: "list",
      items: { $ref: "#/components/objects/User", nonNull: true },
      nonNull: true,
    })
  })

  it("V1.5 enums list every value in a keyed map, with description, deprecation and directives", () => {
    expect(doc.components.enums.Role.values).toEqual({
      ADMIN: {},
      USER: {
        description: "Regular user",
        deprecation: { reason: "No longer supported" },
        directives: [
          { $ref: "#/components/directives/deprecated", meta: { reason: "No longer supported" } },
          { $ref: "#/components/directives/meta", meta: { s: "v" } },
        ],
      },
    })
  })

  it("V1.6 input fields have no title and model required-ness through nonNull and default", () => {
    expect(doc.components.inputObjects.Filter.properties).toEqual({
      role: { $ref: "#/components/enums/Role", default: "USER" },
      ids: {
        type: "list",
        items: { type: "ID", nonNull: true },
        nonNull: true,
      },
      q: { type: "String" },
      limit: { type: "Int", nonNull: true, default: 5 },
    })
  })

  it("V1.7 built-in directive definitions appear only when used (deprecated) or overridden, custom ones always", () => {
    expect(Object.keys(doc.components.directives).sort()).toEqual(["deprecated", "meta"])
    expect(doc.components.directives.meta).toEqual({
      title: "meta",
      locations: ["FIELD_DEFINITION", "OBJECT", "SCHEMA", "ENUM_VALUE"],
      args: { s: { type: "String" }, i: { type: "Int" } },
      repeatable: true,
    })
    const plain: any = build(`type Query { a: Int }`)
    expect(plain.components).toBeUndefined()
    const overridden: any = build(`
      directive @deprecated(reason: String = "x", since: String) on INPUT_OBJECT
      input I @deprecated(since: "1") { a: Int }
      type Query { f(i: I): Int }
    `)
    expect(overridden.components.directives.deprecated.locations).toEqual(["INPUT_OBJECT"])
    expect(overridden.components.inputObjects.I.directives).toEqual([
      { $ref: "#/components/directives/deprecated", meta: { since: "1" } },
    ])
  })

  it("V1.8 keeps the schema description, schema directives and root type metadata", () => {
    const g: any = build(`
      directive @meta(s: String) on SCHEMA | OBJECT
      "the schema"
      schema @meta(s: "schema") { query: RootQ }
      "the root"
      type RootQ @meta(s: "root") { a: Int }
    `)
    expect(g.description).toBe("the schema")
    expect(g.directives).toEqual([{ $ref: "#/components/directives/meta", meta: { s: "schema" } }])
    expect(g.queryTypeName).toBe("RootQ")
    expect(g.rootTypes).toEqual({
      query: {
        description: "the root",
        directives: [{ $ref: "#/components/directives/meta", meta: { s: "root" } }],
      },
    })
    expect(g.components.objects).toBeUndefined()
  })

  // ISSUE-GA-16 (fixed in 0.6.0): the interfaces implemented by root operation types were dropped
  it("V1.9 root types record the interfaces they implement under rootTypes; implementedBy lists components only", () => {
    const g: any = build(`
      interface Node { id: ID! }
      interface Named { name: String }
      type User implements Node { id: ID! }
      "the root"
      type Query implements Node & Named { id: ID!, name: String, user: User }
      type Mutation implements Node { id: ID! }
    `)
    expect(g.rootTypes).toEqual({
      query: {
        description: "the root",
        interfaces: [{ $ref: "#/components/interfaces/Node" }, { $ref: "#/components/interfaces/Named" }],
      },
      mutation: { interfaces: [{ $ref: "#/components/interfaces/Node" }] },
    })
    expect(g.components.interfaces.Node.implementedBy).toEqual([{ $ref: "#/components/objects/User" }])
    expect(g.components.interfaces.Named.implementedBy).toBeUndefined()
    for (const ref of collectRefs(g)) {
      expect(
        ref
          .slice(2)
          .split("/")
          .reduce<any>((node, segment) => node?.[segment], g),
      ).toBeDefined()
    }
    expect(build(`type Query { a: Int }`).rootTypes).toBeUndefined()
  })
})

describe("V2 graphapi 1.0: representation facts for a differ (docs/ANALYSIS.md section C)", () => {
  it("V2.1 (C.1) a field changing from String to a custom scalar changes the $ref of its usage", () => {
    const before: any = build(`type Query { a: String }`)
    const after: any = build(`scalar Date type Query { a: Date }`)
    expect(output(before.queries.a)).toEqual({ type: "String" })
    expect(output(after.queries.a)).toEqual({ $ref: "#/components/scalars/Date" })
    expect(new Set(collectRefs(after)).has("#/components/scalars/Date")).toBe(true)
  })

  it("V2.2 (C.1) Int and Float are plain kinds, without format", () => {
    const doc: any = build(`type Query { i: Int, f: Float }`)
    expect(output(doc.queries.i)).toEqual({ type: "Int" })
    expect(output(doc.queries.f)).toEqual({ type: "Float" })
    expect(JSON.stringify(doc)).not.toContain("format")
  })

  it("V2.3 (C.3) nullability has one encoding everywhere: nonNull: true on non-null positions, absent on nullable ones", () => {
    const doc: any = build(`
      type T { a: String, b: String!, c: [String], d: [String!]!, e(x: Int, y: Int!): Int }
      input I { a: String, b: String! }
      type Query { t: T, tt: T!, l: [T!] }
    `)
    const m = doc.components.objects.T.methods
    expect(output(m.a)).toEqual({ type: "String" })
    expect(output(m.b)).toEqual({ type: "String", nonNull: true })
    expect(output(m.c)).toEqual({
      type: "list",
      items: { type: "String" },
    })
    expect(output(m.d)).toEqual({
      type: "list",
      items: { type: "String", nonNull: true },
      nonNull: true,
    })
    expect(m.e.args).toEqual({
      x: { type: "Int" },
      y: { type: "Int", nonNull: true },
    })
    expect(doc.components.inputObjects.I.properties.a.nonNull).toBeUndefined()
    expect(doc.components.inputObjects.I.properties.b.nonNull).toBe(true)
    expect(doc.queries.t.nonNull).toBeUndefined()
    expect(doc.queries.tt.nonNull).toBe(true)
    expect(JSON.stringify(doc)).not.toContain('"required"')
    expect(JSON.stringify(doc)).not.toContain('"nullable"')
  })

  it("V2.4 (C.4) a non-null argument with a default is distinguishable from a required one", () => {
    const doc: any = build(`type Query { a(x: Int!, y: Int! = 7, z: Int): Int }`)
    const args = doc.queries.a.args
    const mustBeProvided = (arg: any) => arg.nonNull === true && arg.default === undefined
    expect(mustBeProvided(args.x)).toBe(true)
    expect(mustBeProvided(args.y)).toBe(false)
    expect(mustBeProvided(args.z)).toBe(false)
  })

  it("V2.5 (C.5) a result changing kind changes only the type usage keys", () => {
    const before: any = build(`"op" type Query { a: String @deprecated }`)
    const after: any = build(`"op" type T { x: Int } type Query { a: T @deprecated }`)
    const outBefore = output(before.queries.a)
    const outAfter = output(after.queries.a)
    const { $ref: _r1, type: _t1, ...restBefore } = before.queries.a
    const { $ref: _r2, type: _t2, ...restAfter } = after.queries.a
    expect(restBefore).toEqual(restAfter)
    expect(outBefore).toEqual({ type: "String" })
    expect(outAfter).toEqual({ $ref: "#/components/objects/T" })
  })

  it("V2.6 (C.6) enum values are a keyed map and interfaces record their implementations (sorted by name)", () => {
    const doc: any = build(SDL)
    expect(Object.keys(doc.components.enums.Role.values)).toEqual(["ADMIN", "USER"])
    expect(doc.components.interfaces.Node.implementedBy).toEqual([
      { $ref: "#/components/interfaces/Named" },
      { $ref: "#/components/objects/Post" },
      { $ref: "#/components/objects/User" },
    ])
    expect(doc.components.interfaces.Named.implementedBy).toEqual([{ $ref: "#/components/objects/User" }])
    expect(doc.components.objects.User.interfaces).toEqual([
      { $ref: "#/components/interfaces/Named" },
      { $ref: "#/components/interfaces/Node" },
    ])
  })

  it("V2.7 (C.7) deprecation is uniform: a resolved reason, with the default spelled out, plus the @deprecated usage", () => {
    const doc: any = build(`enum E { A @deprecated B @deprecated(reason: "b") } type Query { e: E @deprecated }`)
    expect(doc.components.enums.E.values.A.deprecation).toEqual({ reason: "No longer supported" })
    expect(doc.components.enums.E.values.B.deprecation).toEqual({ reason: "b" })
    expect(doc.queries.e.deprecation).toEqual({ reason: "No longer supported" })
    expect(doc.queries.e.directives).toEqual([
      { $ref: "#/components/directives/deprecated", meta: { reason: "No longer supported" } },
    ])
    expect(JSON.stringify(doc)).not.toContain('"deprecated":true')
  })

  it("V2.8 (C.8) directive usages are arrays with typed meta, one entry per usage of a repeatable directive", () => {
    const doc: any = build(SDL)
    expect(doc.components.objects.User.directives).toEqual([
      { $ref: "#/components/directives/meta", meta: { s: "u" } },
      { $ref: "#/components/directives/meta", meta: { s: "u2", i: 2 } },
    ])
  })

  it("V2.9 (C.10) renaming a type changes title and $ref only, input fields carry no title", () => {
    const a: any = build(`input T { x: Int } type Query { t(i: T): Int }`)
    const b: any = build(`input U { x: Int } type Query { t(i: U): Int }`)
    const { title: ta, ...restA } = a.components.inputObjects.T
    const { title: tb, ...restB } = b.components.inputObjects.U
    expect(restA).toEqual(restB)
    expect([ta, tb]).toEqual(["T", "U"])
    expect(JSON.stringify(restA)).not.toContain("title")
  })

  it("V2.10 every $ref resolves and every component is referenced", () => {
    const doc: any = build(SDL)
    const refs = collectRefs(doc)
    for (const ref of refs) {
      const target = ref
        .slice(2)
        .split("/")
        .reduce<any>((node, segment) => node?.[segment], doc)
      expect(target).toBeDefined()
    }
    const set = new Set(refs)
    for (const kind of ["scalars", "objects", "interfaces", "unions", "enums", "inputObjects", "directives"]) {
      for (const name of Object.keys(doc.components[kind])) {
        expect(set.has(`#/components/${kind}/${name}`)).toBe(true)
      }
    }
  })
})

describe("V3 graphapi 1.0: round trips", () => {
  it("V3.1 printSchema prints a 1.0 document to SDL equivalent to the source", () => {
    const source = schemaOf(SDL)
    const printed = printSchema(buildFromSchema(source))
    expect(canonical(schemaOf(printed))).toBe(canonical(source))
  })

  it("V3.3 toIR and fromIR are inverse", () => {
    const doc = buildFromSchema(schemaOf(SDL))
    expect(fromIR(toIR(doc))).toEqual(doc)
  })

  it("V3.4 build(print(build(sdl))) is a fixed point", () => {
    const doc = build(SDL)
    expect(build(printSchema(doc))).toEqual(doc)
  })

  it("V3.5 custom root names, collisions and root metadata survive the round trip", () => {
    const sdl = `
      "API"
      schema { query: Root }
      "the root"
      type Root { q: Query, m: Mutation }
      type Query { x: Int }
      type Mutation { y: Int }
    `
    const source = schemaOf(sdl)
    const printed = printSchema(buildFromSchema(source))
    expect(canonical(schemaOf(printed))).toBe(canonical(source))
    expect(printed).toContain('"""API"""\nschema {\n  query: Root\n}')
    expect(printed).toContain('"""the root"""\ntype Root {')
  })

  it("V3.6 lifting rejects unknown versions and malformed usages", () => {
    expect(() => printSchema({ graphapi: "2.0" } as any)).toThrow(/Unsupported graphapi version: 2.0/)
    expect(() => printSchema({ graphapi: "0.1.2" } as any)).toThrow(/Unsupported graphapi version: 0.1.2/)
    expect(() => printSchema({ graphapi: "1.0", queries: { a: { description: "no type" } } } as any)).toThrow(
      /Unexpected type/,
    )
    expect(printSchema({ graphapi: "1.0" })).toBe("")
    const query = (usage: object) => ({ graphapi: "1.0", queries: { a: usage } }) as any
    expect(() => printSchema(query({ type: "Date" }))).toThrow(/Unexpected type/)
    expect(() => printSchema(query({ type: "object" }))).toThrow(/Unexpected type/)
    expect(() => printSchema(query({ $ref: "#/components/scalars/D", type: "Int" }))).toThrow(/both \$ref and type/)
    expect(() => printSchema(query({ type: "list" }))).toThrow(/a list without items/)
    expect(() =>
      printSchema({ graphapi: "1.0", components: { objects: { U: { title: "U", type: "union", oneOf: [] } } } } as any),
    ).toThrow(/Unexpected definition: U has type "union" in the object section/)
  })

  it("V3.7 interfaces of root types survive printing, toIR/fromIR and the introspection build", () => {
    const sdl = `
      interface Node { id: ID! }
      schema { query: Root, subscription: Subscription }
      type Root implements Node { id: ID!, n: Node }
      type Subscription implements Node { id: ID! }
    `
    const source = schemaOf(sdl)
    const doc = buildFromSchema(source)
    const printed = printSchema(doc)
    expect(printed).toContain("type Root implements Node {")
    expect(canonical(schemaOf(printed))).toBe(canonical(source))
    expect(build(printed)).toEqual(doc)
    expect(fromIR(toIR(doc))).toEqual(doc)
    expect(buildFromIntrospection(introspectionOf(source))).toEqual(doc)
  })
})

describe("V4 graphapi 1.0: parity between the two builders", () => {
  it("V4.1 buildFromSchema and buildFromIntrospection agree apart from custom directive usages", () => {
    const fromSchema = withoutCustomUsages(build(SDL))
    const fromIntrospection = withoutCustomUsages(buildIntrospected(SDL))
    expect(fromIntrospection).toEqual(fromSchema)
  })

  it("V4.2 both builders produce graphapi 1.0 documents", () => {
    const schema = schemaOf(`type Query { a: Int }`)
    expect(buildFromIntrospection(introspectionOf(schema)).graphapi).toBe("1.0")
    const doc: GraphApiSchema = buildFromSchema(schema)
    expect(doc.graphapi).toBe("1.0")
    expect(output(doc.queries!.a)).toEqual({ type: "Int" })
  })
})
