// Test plan block D (document structure invariants useful to a differ)
import { build, collectRefs, resolveRef } from "../helpers/schema"

const SDL = `
  directive @meta(s: String) on FIELD_DEFINITION | OBJECT
  scalar Date
  interface Node { id: ID! }
  type User implements Node @meta(s: "u") { id: ID!, name: String, born: Date, friends(first: Int!, after: ID): [User!]! @meta(s: "f") }
  type Post implements Node { id: ID!, author: User! }
  union Entity = User | Post
  enum Role { ADMIN USER @deprecated }
  input Filter { role: Role = USER, ids: [ID!]!, q: String }
  type Query { entity(id: ID!): Entity, users(filter: Filter!, limit: Int): [User], node: Node, date: Date }
  type Mutation { touch(id: ID!): Boolean! }
`

describe("D1 invariants: references", () => {
  it("D1.1 every $ref of a custom directive or named type resolves to an existing component", () => {
    const graphapi = build(SDL)
    const refs = collectRefs(graphapi)
    expect(refs.length).toBeGreaterThan(5)
    for (const ref of refs) {
      expect(ref).toMatch(
        /^#\/components\/(scalars|objects|interfaces|unions|enums|inputObjects|directives)\/[A-Za-z_][A-Za-z0-9_]*$/,
      )
      expect(resolveRef(graphapi, ref)).toBeDefined()
    }
  })

  // ISSUE-GA-11 (fixed in 0.6.0): @specifiedBy usages reference #/components/directives/specifiedBy, which is never emitted into components
  it("D1.2 the $ref of a @specifiedBy usage resolves", () => {
    const graphapi = build(`scalar UUID @specifiedBy(url: "https://x") type Query { u: UUID }`)
    for (const ref of collectRefs(graphapi)) {
      expect(resolveRef(graphapi, ref)).toBeDefined()
    }
  })

  // ISSUE-GA-15 (fixed in 0.6.0 through graphapi 1.0): custom scalar usages were inlined as { type: "string", format: <name> },
  // usages now reference the scalar component (see D5.1)
  it("D1.3 every custom scalar component is referenced by at least one $ref", () => {
    const graphapi: any = build(SDL)
    const refs = new Set(collectRefs(graphapi))
    expect(Object.keys(graphapi.components.scalars)).toEqual(["Date"])
    for (const name of Object.keys(graphapi.components.scalars)) {
      expect(refs.has(`#/components/scalars/${name}`)).toBe(true)
    }
  })

  it("D1.4 every object, interface, union, enum and input component is referenced by at least one $ref", () => {
    const graphapi: any = build(SDL)
    const refs = new Set(collectRefs(graphapi))
    for (const kind of ["objects", "interfaces", "unions", "enums", "inputObjects"]) {
      for (const name of Object.keys(graphapi.components[kind])) {
        expect(refs.has(`#/components/${kind}/${name}`)).toBe(true)
      }
    }
  })
})

describe("D2 invariants: nullability", () => {
  const graphapi: any = build(SDL)

  // every type usage of the document: operations, fields, arguments, input fields and list items
  const usages = (node: any, result: any[] = []): any[] => {
    if (Array.isArray(node)) {
      node.forEach((item) => usages(item, result))
    } else if (node && typeof node === "object") {
      if ("nonNull" in node || node.type === "list" || (node.$ref && !node.$ref.includes("/directives/"))) {
        result.push(node)
      }
      Object.values(node).forEach((item) => usages(item, result))
    }
    return result
  }

  it("D2.1 fields, arguments and input fields never carry nullable or required (nonNull is the only source of truth)", () => {
    for (const kind of ["objects", "interfaces", "inputObjects"]) {
      for (const component of Object.values(graphapi.components[kind]) as any[]) {
        expect(component).not.toHaveProperty("required")
        for (const member of Object.values(component.methods ?? component.properties) as any[]) {
          expect(member).not.toHaveProperty("nullable")
          expect(member).not.toHaveProperty("required")
          for (const arg of Object.values(member.args ?? {}) as any[]) {
            expect(arg).not.toHaveProperty("nullable")
            expect(arg).not.toHaveProperty("required")
          }
        }
      }
    }
    expect(JSON.stringify(graphapi)).not.toMatch(/"(nullable|required)"/)
  })

  it("D2.2 nonNull only appears on type usages, next to a $ref or a type", () => {
    const nonNull = usages(graphapi).filter((usage) => "nonNull" in usage)
    expect(nonNull.length).toBeGreaterThan(5)
    for (const usage of nonNull) {
      expect(typeof usage.$ref === "string" || typeof usage.type === "string").toBe(true)
    }
    for (const kind of Object.keys(graphapi.components)) {
      for (const definition of Object.values(graphapi.components[kind]) as any[]) {
        expect(definition).not.toHaveProperty("nonNull")
      }
    }
  })

  it("D2.3 list items and operations use nonNull: true for non-null positions and omit it otherwise", () => {
    expect(graphapi.queries.users).toEqual({
      args: {
        filter: { $ref: "#/components/inputObjects/Filter", nonNull: true },
        limit: { type: "Int" },
      },
      type: "list",
      items: { $ref: "#/components/objects/User" },
    })
    expect(graphapi.mutations.touch).toEqual({
      args: { id: { type: "ID", nonNull: true } },
      type: "Boolean",
      nonNull: true,
    })
    expect(graphapi.components.objects.User.methods.friends.items.nonNull).toBe(true)
  })

  it("D2.4 nonNull is never false (absence means nullable)", () => {
    expect(JSON.stringify(graphapi)).not.toContain('"nonNull":false')
    for (const usage of usages(graphapi)) {
      expect(usage.nonNull === undefined || usage.nonNull === true).toBe(true)
    }
  })
})

describe("D3 invariants: stable ordering", () => {
  it("D3.1 building the same SDL twice yields byte-identical JSON", () => {
    expect(JSON.stringify(build(SDL))).toBe(JSON.stringify(build(SDL)))
  })

  it("D3.2 methods, args, input properties, enum values and oneOf keep declaration order", () => {
    const graphapi: any = build(SDL)
    expect(Object.keys(graphapi.components.objects.User.methods)).toEqual(["id", "name", "born", "friends"])
    expect(Object.keys(graphapi.components.objects.User.methods.friends.args)).toEqual(["first", "after"])
    expect(Object.keys(graphapi.components.inputObjects.Filter.properties)).toEqual(["role", "ids", "q"])
    expect(Object.keys(graphapi.components.enums.Role.values)).toEqual(["ADMIN", "USER"])
    expect(graphapi.components.unions.Entity.oneOf.map((m: any) => m.$ref)).toEqual([
      "#/components/objects/User",
      "#/components/objects/Post",
    ])
    expect(Object.keys(graphapi.queries)).toEqual(["entity", "users", "node", "date"])
  })

  it("D3.3 reordering definitions in the SDL yields an equal document", () => {
    const reordered = SDL.split("\n").filter(Boolean).reverse().join("\n")
    expect(build(reordered)).toEqual(build(SDL))
  })
})

describe("D4 invariants: document header", () => {
  it("D4.1 carries the graphapi version and lists built-in directive definitions only when used (README)", () => {
    const plain: any = build(`type Query { a: Int }`)
    expect(plain.graphapi).toBe("1.0")
    expect(plain.components).toBeUndefined()
    const graphapi: any = build(`type Query { a: Int @deprecated }`)
    expect(graphapi.graphapi).toBe("1.0")
    expect(Object.keys(graphapi.components.directives)).toEqual(["deprecated"])
    expect(graphapi.components.directives.deprecated).toMatchObject({
      title: "deprecated",
      locations: expect.arrayContaining([
        "FIELD_DEFINITION",
        "ARGUMENT_DEFINITION",
        "INPUT_FIELD_DEFINITION",
        "ENUM_VALUE",
      ]),
      repeatable: false,
    })
  })

  it("D4.2 only declared sections appear", () => {
    const graphapi: any = build(`type Query { a: Int }`)
    expect(Object.keys(graphapi)).toEqual(["graphapi", "queryTypeName", "queries"])
    const withComponents: any = build(`scalar S type Query { a: S }`)
    expect(Object.keys(withComponents)).toEqual(["graphapi", "queryTypeName", "queries", "components"])
    expect(Object.keys(withComponents.components)).toEqual(["scalars"])
  })
})

describe("D5 representation facts relevant to diffing (see docs/ANALYSIS.md)", () => {
  it("D5.1 changing a field from String to a custom scalar replaces its type with a $ref to the scalar", () => {
    const before: any = build(`type Query { a: String }`)
    const after: any = build(`scalar Date type Query { a: Date }`)
    expect(before.queries.a).toEqual({ type: "String" })
    expect(after.queries.a).toEqual({ $ref: "#/components/scalars/Date" })
  })

  it("D5.2 two structurally identical object types differ only by title and $ref text", () => {
    const a: any = build(`type T { x: Int } type Query { t: T }`)
    const b: any = build(`type U { x: Int } type Query { t: U }`)
    const { title: titleA, ...restA } = a.components.objects.T
    const { title: titleB, ...restB } = b.components.objects.U
    expect(restA).toEqual(restB)
    expect(titleA).toBe("T")
    expect(titleB).toBe("U")
    expect(a.queries.t.$ref).toBe("#/components/objects/T")
    expect(b.queries.t.$ref).toBe("#/components/objects/U")
  })

  it("D5.3 adding a required argument only adds an args entry marked nonNull", () => {
    const before: any = build(`type Query { a(x: Int): Int }`)
    const after: any = build(`type Query { a(x: Int, y: ID!): Int }`)
    expect(before.queries.a.args).toEqual({ x: { type: "Int" } })
    expect(after.queries.a.args).toEqual({ x: { type: "Int" }, y: { type: "ID", nonNull: true } })
  })

  it("D5.4 interface implementation is a list of $ref on the implementing type, mirrored by implementedBy on the interface", () => {
    const graphapi: any = build(SDL)
    expect(graphapi.components.objects.User.interfaces).toEqual([{ $ref: "#/components/interfaces/Node" }])
    expect(graphapi.components.objects.Post.interfaces).toEqual([{ $ref: "#/components/interfaces/Node" }])
    expect(graphapi.components.interfaces.Node.implementedBy).toEqual([
      { $ref: "#/components/objects/Post" },
      { $ref: "#/components/objects/User" },
    ])
  })
})
