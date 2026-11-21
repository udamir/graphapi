// Test plan blocks G12 (schema definition and root types), G13 (extensions), G14 (recursive types),
// G15 (name collisions), G16 (reserved and special names), G17 (programmatic schemas)
import {
  GraphQLEnumType,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLInputObjectType,
  GraphQLInt,
} from "graphql"

import { buildFromSchema } from "../../src/index"
import { build } from "../helpers/schema"

describe("G12 build from SDL: schema definition and root types", () => {
  it("G12.1 keeps the schema description", () => {
    const graphapi: any = build(`
      "My API"
      schema { query: Query }
      type Query { a: Int }
    `)
    expect(graphapi.description).toBe("My API")
  })

  it("G12.2 maps custom root type names to queries, mutations and subscriptions and keeps them out of components", () => {
    const graphapi: any = build(`
      schema { query: RootQ, mutation: RootM, subscription: RootS }
      type RootQ { q: Int }
      type RootM { m: Int }
      type RootS { s: Int }
    `)
    expect(Object.keys(graphapi.queries)).toEqual(["q"])
    expect(Object.keys(graphapi.mutations)).toEqual(["m"])
    expect(Object.keys(graphapi.subscriptions)).toEqual(["s"])
    expect(graphapi.components?.objects).toBeUndefined()
  })

  it("G12.3 omits operation sections for root types that are not defined", () => {
    const graphapi: any = build(`
      schema { mutation: M }
      type M { m: Int }
    `)
    expect(graphapi.queries).toBeUndefined()
    expect(graphapi.subscriptions).toBeUndefined()
    expect(graphapi.queryTypeName).toBeUndefined()
    expect(graphapi.subscriptionTypeName).toBeUndefined()
    expect(Object.keys(graphapi.mutations)).toEqual(["m"])
  })

  it("G12.4 uses the default root names Query, Mutation and Subscription when no schema definition is given", () => {
    const graphapi: any = build(`
      type Query { q: Int }
      type Mutation { m: Int }
      type Subscription { s: Int }
    `)
    expect(Object.keys(graphapi.queries)).toEqual(["q"])
    expect(Object.keys(graphapi.mutations)).toEqual(["m"])
    expect(Object.keys(graphapi.subscriptions)).toEqual(["s"])
    expect(graphapi.queryTypeName).toBe("Query")
    expect(graphapi.mutationTypeName).toBe("Mutation")
    expect(graphapi.subscriptionTypeName).toBe("Subscription")
    expect(graphapi.components?.objects).toBeUndefined()
  })

  // ISSUE-GA-05 (fixed in 0.6.0): custom root type names are not recorded anywhere in the document, so they cannot be reproduced
  it("G12.5 records custom root type names so that the schema definition can be reproduced", () => {
    const graphapi: any = build(`
      schema { query: RootQ, mutation: RootM }
      type RootQ { q: Int }
      type RootM { m: Int }
    `)
    expect(graphapi.queryTypeName).toBe("RootQ")
    expect(graphapi.mutationTypeName).toBe("RootM")
    expect(graphapi.subscriptionTypeName).toBeUndefined()
  })

  // ISSUE-GA-13 (fixed in 0.6.0): the description of a root operation type is dropped (only its fields survive as operations)
  it("G12.6 keeps the description of root operation types", () => {
    const graphapi: any = build(`
      "The root query"
      type Query { a: Int }
    `)
    expect(graphapi.rootTypes.query.description).toBe("The root query")
  })
})

describe("G13 build from SDL: extensions", () => {
  it("G13.1 merges fields added by extend type into the object", () => {
    const graphapi: any = build(`
      type T { a: Int }
      extend type T { b: String! }
      type Query { t: T }
    `)
    expect(graphapi.components.objects.T.methods).toEqual({
      a: { type: "Int" },
      b: { type: "String", nonNull: true },
    })
  })

  it("G13.2 merges values, fields and members added by extend enum, extend input, extend interface and extend union", () => {
    const graphapi: any = build(`
      enum E { A }
      extend enum E { B }
      input I { a: Int }
      extend input I { b: Int }
      interface N { id: ID! }
      extend interface N { name: String }
      type A implements N { id: ID!, name: String }
      type B { b: Int }
      union U = A
      extend union U = B
      type Query { e: E, u: U, n: N, f(i: I): Int }
    `)
    expect(Object.keys(graphapi.components.enums.E.values)).toEqual(["A", "B"])
    expect(Object.keys(graphapi.components.inputObjects.I.properties)).toEqual(["a", "b"])
    expect(Object.keys(graphapi.components.interfaces.N.methods)).toEqual(["id", "name"])
    expect(graphapi.components.unions.U.oneOf).toEqual([
      { $ref: "#/components/objects/A" },
      { $ref: "#/components/objects/B" },
    ])
  })

  it("G13.3 extend schema adds root operation types", () => {
    const graphapi: any = build(`
      type Query { a: Int }
      extend schema { mutation: M }
      type M { m: Int }
    `)
    expect(Object.keys(graphapi.mutations)).toEqual(["m"])
  })

  it("G13.4 keeps directives on fields added through extensions", () => {
    const graphapi: any = build(`
      directive @d on FIELD_DEFINITION
      type T { a: Int }
      extend type T { b: Int @d }
      type Query { t: T }
    `)
    expect(graphapi.components.objects.T.methods.b.directives).toEqual([{ $ref: "#/components/directives/d" }])
  })

  // ISSUE-GA-12 (fixed in 0.6.0): only astNode.directives are read, directives on extensionASTNodes (extend type T @d) are lost
  it("G13.5 keeps directives applied through extend type", () => {
    const graphapi: any = build(`
      directive @d on OBJECT
      type T { a: Int }
      extend type T @d
      type Query { t: T }
    `)
    expect(graphapi.components.objects.T.directives).toEqual([{ $ref: "#/components/directives/d" }])
  })
})

describe("G14 build from SDL: recursive types", () => {
  it("G14.1 handles self references and mutual recursion through $ref without looping", () => {
    const graphapi: any = build(`
      type Node { id: ID!, parent: Node, children: [Node!]!, owner: User }
      type User { node: Node!, friends: [User] }
      input Tree { value: Int, children: [Tree!] }
      type Query { node(tree: Tree): Node }
    `)
    expect(graphapi.components.objects.Node.methods.parent).toEqual({ $ref: "#/components/objects/Node" })
    expect(graphapi.components.objects.Node.methods.children.items).toEqual({
      $ref: "#/components/objects/Node",
      nonNull: true,
    })
    expect(graphapi.components.objects.User.methods.node).toEqual({ $ref: "#/components/objects/Node", nonNull: true })
    expect(graphapi.components.objects.User.methods.friends.items).toEqual({ $ref: "#/components/objects/User" })
    expect(graphapi.components.inputObjects.Tree.properties.children.items).toEqual({
      $ref: "#/components/inputObjects/Tree",
      nonNull: true,
    })
  })
})

describe("G15 build from SDL: name collisions with default root names", () => {
  it("G15.1 keeps a non-root type named Query or Mutation as an ordinary component", () => {
    const graphapi: any = build(`
      schema { query: Root }
      type Root { a: Int, q: Query, m: Mutation, s: Subscription }
      type Query { x: Int }
      type Mutation { y: Int }
      type Subscription { z: Int }
    `)
    expect(Object.keys(graphapi.queries)).toEqual(["a", "q", "m", "s"])
    expect(graphapi.mutations).toBeUndefined()
    expect(graphapi.subscriptions).toBeUndefined()
    expect(graphapi.queryTypeName).toBe("Root")
    expect(graphapi.mutationTypeName).toBeUndefined()
    expect(graphapi.subscriptionTypeName).toBeUndefined()
    expect(graphapi.components.objects.Query.methods.x).toEqual({ type: "Int" })
    expect(graphapi.components.objects.Mutation.methods.y).toEqual({ type: "Int" })
    expect(graphapi.components.objects.Subscription.methods.z).toEqual({ type: "Int" })
    expect(graphapi.queries.q).toEqual({ $ref: "#/components/objects/Query" })
  })
})

describe("G16 build from SDL: reserved words and special names", () => {
  it("G16.1 accepts fields, args and types named like GraphQL keywords", () => {
    const graphapi: any = build(`
      type type { input: Int, enum: Int, on: Int, fragment: Int, schema: Int, query: Int, true_: Int, _: Int, __typename_like: Int }
      type Query { f(type: type, input: Int, on: Int): type }
    `)
    expect(Object.keys(graphapi.components.objects.type.methods)).toEqual([
      "input",
      "enum",
      "on",
      "fragment",
      "schema",
      "query",
      "true_",
      "_",
      "__typename_like",
    ])
    expect(Object.keys(graphapi.queries.f.args)).toEqual(["type", "input", "on"])
    expect(graphapi.queries.f.args.type).toEqual({ $ref: "#/components/objects/type" })
  })

  it("G16.2 keeps unicode and escape sequences in descriptions and default strings", () => {
    const graphapi: any = build(`
      type Query {
        "Ünïcödé — 日本語 \\\\ backslash \\t tab"
        f(s: String = "a\\"b\\\\c\\nd"): Int
      }
    `)
    expect(graphapi.queries.f.description).toBe("Ünïcödé — 日本語 \\ backslash \t tab")
    expect(graphapi.queries.f.args.s.default).toBe('a"b\\c\nd')
  })
})

describe("G17 build from programmatically constructed schemas", () => {
  const E = new GraphQLEnumType({ name: "E", values: { A: {}, B: {} } })
  const In = new GraphQLInputObjectType({ name: "In", fields: { a: { type: GraphQLInt } } })
  const T = new GraphQLObjectType({ name: "T", fields: { s: { type: GraphQLString }, e: { type: E } } })
  const Query = new GraphQLObjectType({ name: "Query", fields: { t: { type: T, args: { i: { type: In } } } } })

  // ISSUE-GA-04 (fixed in 0.6.0): type kind is derived from astNode.kind, types built with the GraphQL type classes have no astNode and are all classified as scalars
  it("G17.1 classifies object, enum and input types built without an AST by their GraphQL kind", () => {
    const graphapi: any = buildFromSchema(new GraphQLSchema({ query: Query }))
    expect(graphapi.components.scalars).toBeUndefined()
    expect(graphapi.components.objects.T).toMatchObject({ type: "object" })
    expect(graphapi.components.enums.E).toEqual({ title: "E", type: "enum", values: { A: {}, B: {} } })
    expect(graphapi.components.inputObjects.In).toMatchObject({ type: "input" })
    expect(graphapi.queries.t).toEqual({
      $ref: "#/components/objects/T",
      args: { i: { $ref: "#/components/inputObjects/In" } },
    })
  })

  // ISSUE-GA-04 (fixed in 0.6.0): interfaces built without an AST are classified as scalars too, so the implementation list is never produced
  it("G17.2 classifies interfaces built without an AST and records their implementations", () => {
    const N = new GraphQLInterfaceType({ name: "N", fields: { id: { type: GraphQLString } } })
    const Impl = new GraphQLObjectType({ name: "Impl", interfaces: [N], fields: { id: { type: GraphQLString } } })
    const Q = new GraphQLObjectType({ name: "Query", fields: { n: { type: Impl } } })
    const graphapi: any = buildFromSchema(new GraphQLSchema({ query: Q, types: [Impl] }))
    expect(graphapi.components.interfaces.N).toMatchObject({ type: "interface" })
    expect(graphapi.components.objects.Impl.interfaces).toEqual([{ $ref: "#/components/interfaces/N" }])
    expect(graphapi.components.interfaces.N.implementedBy).toEqual([{ $ref: "#/components/objects/Impl" }])
  })
})
