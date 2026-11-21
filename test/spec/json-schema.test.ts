// The published JSON Schema (schemas/ at the repository root) accepts every document gqlapi produces and rejects what the spec forbids
import Ajv2020 from "ajv/dist/2020"
import type { ValidateFunction } from "ajv"
import fs from "fs"
import { specifiedDirectives } from "graphql"
import path from "path"

import { fromIR, toIR } from "../../src/index"
import { build, buildIntrospected, fixtures, schemaOf } from "../helpers/schema"

const SCHEMAS = path.join(__dirname, "../../schemas")
const loadSchema = (file: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(SCHEMAS, file), "utf8")) as Record<string, unknown>

const schema = loadSchema("graphapi-1.0.schema.json")

const compile = (schema: Record<string, unknown>): ValidateFunction =>
  new Ajv2020({ strict: true, allErrors: true }).compile(schema)

const validate = compile(schema)

const errorsOf = (validate: ValidateFunction, doc: unknown): string[] =>
  validate(doc)
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message} ${JSON.stringify(e.params)}`)

const expectValid = (doc: unknown) => expect(errorsOf(validate, doc)).toEqual([])

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// Feature SDLs: together they cover every construct the specification maps
const FEATURES: Record<string, string> = {
  scalars: `
    "An ISO-8601 calendar date"
    scalar Date @specifiedBy(url: "https://tools.ietf.org/html/rfc3339")
    scalar JSON
    type Query { count: Int!, ratio: Float, name: String, active: Boolean!, id: ID!, today: Date, raw(value: JSON!): JSON }
  `,
  lists: `
    scalar Date
    type Query {
      a: [String], b: [String!], c: [String]!, d: [String!]!, matrix: [[Int!]], deep: [[[Date]!]]!
      filter(ids: [ID!]!, nested: [[Float]], dates: [Date!]): [Boolean]
    }
  `,
  objects: `
    interface Node { id: ID! }
    interface Named implements Node { id: ID!, name: String }
    type User implements Named & Node { id: ID!, name: String, friends(first: Int = 10, after: ID): [User!]!, best: User }
    type Bot implements Node { id: ID! }
    union Actor = User | Bot
    enum Size { SMALL MEDIUM LARGE }
    input Range { from: Int = 0, to: Int }
    input Filter { query: String!, size: Size = MEDIUM, range: Range, ids: [ID!] }
    type Query { node(id: ID!): Node, actors(filter: Filter): [Actor!]!, size: Size, named: [Named] }
  `,
  defaults: `
    enum Color { RED GREEN }
    input Point { x: Float = 0, y: Float = -1.5 }
    input Options {
      i: Int = 7, f: Float = 1.5, s: String = "hello", e: String = "", b: Boolean = false, t: Boolean = true, id: ID = "42"
      color: Color = RED, colors: [Color!] = [RED, GREEN], empty: [Int] = [], nul: Int = null
      point: Point = { x: 1, y: 2 }, points: [Point!] = [{ x: 1 }, { y: 3 }], required: Int! = 20, zero: Int = 0
    }
    directive @limit(max: Int = 100, labels: [String!] = ["a"], point: Point = { x: 0 }) on FIELD_DEFINITION
    type Query { run(options: Options = { i: 1, color: GREEN }, after: String = null, n: [[Int]] = [[1], [2, 3]]): Int @limit }
  `,
  descriptions: `
    """
    The *Library* API.
    """
    schema { query: Query, mutation: Mutation }
    "A book" type Book { "The title" title: String!, "Authors" authors("Max" first: Int): [String] }
    "A shelf" interface Shelf { "Books" books: [Book] }
    "Media" union Media = Book
    "Genre" enum Genre { "Fiction" FICTION, NONFICTION }
    "Search input" input Search { "Term" q: String }
    "A date" scalar Date
    "Marks" directive @mark("Label" label: String) on FIELD_DEFINITION
    "Entry point" type Query { "Find books" books("Full-text search" q: String, search: Search): [Book!]!, media: Media, shelf: Shelf, genre: Genre, date: Date }
    "Writes" type Mutation { "Add" add(title: String!): Book }
  `,
  deprecations: `
    enum Unit { METER, FOOT @deprecated, INCH @deprecated(reason: "Use METER"), YARD @deprecated(reason: "No longer supported") }
    input Options { unit: Unit, precise: Boolean @deprecated(reason: "Always precise now"), legacy: Int @deprecated, empty: Int @deprecated(reason: "") }
    interface Measured { size: Float @deprecated(reason: "Use length") }
    type Box implements Measured { size: Float @deprecated(reason: "Use length"), length(unit: Unit, old: Boolean @deprecated): Float }
    type Query { distance(options: Options, legacy: Boolean @deprecated): Float, length: Float @deprecated(reason: "Use distance"), box: Box @deprecated, measured: Measured }
    type Mutation { reset: Boolean @deprecated(reason: "Gone") }
  `,
  directives: `
    "Marks an element with a tag"
    directive @tag(name: String!) repeatable on SCHEMA | SCALAR | OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | INTERFACE | UNION | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
    directive @cost(weight: Int = 1, multipliers: [String!], meta: Meta) on FIELD_DEFINITION | ARGUMENT_DEFINITION
    directive @flag on OBJECT | ENUM_VALUE | FIELD_DEFINITION
    directive @unused(x: Int) on QUERY | MUTATION | SUBSCRIPTION | FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT | VARIABLE_DEFINITION
    input Meta { key: String, values: [Int] }
    schema @tag(name: "public") @tag(name: "v2") { query: Query }
    extend schema @tag(name: "extended")
    scalar Money @tag(name: "scalar")
    interface Priced @tag(name: "iface") { price: Money }
    type Product implements Priced @tag(name: "catalog") @tag(name: "v2") @flag {
      price(currency: String @cost(weight: 2) @tag(name: "arg")): Money @cost(weight: 5, multipliers: ["currency"], meta: { key: "k", values: [1, 2] }) @tag(name: "f") @tag(name: "g")
    }
    extend type Product @tag(name: "ext")
    union Item @tag(name: "union") = Product
    enum Currency @tag(name: "enum") { EUR @tag(name: "value") @flag, USD @flag, GBP }
    input Order @tag(name: "input") { currency: Currency @tag(name: "field"), amount: Int = 0 @tag(name: "amount") }
    type Query @tag(name: "root") @flag { product(order: Order @tag(name: "q")): Product @tag(name: "op"), item: Item, priced: Priced }
  `,
  overrides: `
    directive @deprecated(reason: String = "No longer supported", since: String) on INPUT_OBJECT | OBJECT | FIELD_DEFINITION | SCHEMA
    directive @skip(if: Boolean!, reason: String) on FIELD | OBJECT
    directive @specifiedBy(url: String!, note: String) on SCALAR
    schema @deprecated(since: "1.0") { query: Query }
    scalar UUID @specifiedBy(url: "https://example.com/uuid", note: "v4")
    input LegacyInput @deprecated(since: "2.0") { value: Int }
    type Legacy @deprecated(reason: "old") @skip(if: true) { id: UUID, old: Int @deprecated(reason: "Use id") }
    type Query { run(input: LegacyInput): Boolean, legacy: Legacy }
  `,
  oneOf: `
    "Exactly one way to identify a user"
    input UserBy @oneOf { id: ID, email: String }
    type Query { user(by: UserBy!): String }
  `,
  roots: `
    interface Node { id: ID! }
    interface Timestamped { at: String }
    directive @root(kind: String) on OBJECT
    schema { query: RootQuery, mutation: RootMutation, subscription: RootSubscription }
    "Entry point" type RootQuery implements Node & Timestamped @root(kind: "query") { id: ID!, at: String, query: Query, node: Node }
    type RootMutation implements Node { id: ID!, ping: Boolean }
    "Events" type RootSubscription @root { tick(every: Int! = 1): Int!, nodes: [Node!] }
    "An ordinary type that happens to be called Query" type Query implements Node { id: ID!, version: String }
    type Mutation { x: Int }
    type Subscription { y: Int }
  `,
  subscriptions: `
    type Event { id: ID!, payload: String }
    type Query { last: Event }
    type Mutation { emit(payload: String!): Event! }
    type Subscription { events(filter: String): Event!, count: Int }
  `,
  minimal: `type Query { hello: String }`,
  emptyArgs: `
    directive @plain on FIELD_DEFINITION
    type Query { hello: String @plain }
  `,
}

const SOURCES: [string, string][] = [
  ...fixtures().map(([name, sdl]): [string, string] => [`fixture ${name}`, sdl]),
  ...Object.entries(FEATURES)
    // `@oneOf` is a built-in directive of graphql@16.9 and later only
    .filter(([name]) => name !== "oneOf" || specifiedDirectives.some((directive) => directive.name === "oneOf"))
    .map(([name, sdl]): [string, string] => [`feature ${name}`, sdl]),
]

describe("JSON Schema: compile", () => {
  it("compiles with Ajv2020 in strict mode", () => {
    expect(typeof validate).toBe("function")
  })

  it("carry the published $id and the 2020-12 dialect", () => {
    expect(schema.$id).toBe("https://udamir.github.io/graphapi/schemas/graphapi-1.0.schema.json")
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
  })

  it("give every definition a title and a one-line description", () => {
    const defs = schema.$defs as Record<string, { title?: string; description?: string }>
    for (const [name, def] of Object.entries(defs)) {
      expect(def.title, name).toBeTypeOf("string")
      expect(def.description, name).toBeTypeOf("string")
      expect(def.description, name).not.toContain("\n")
    }
  })
})

describe("JSON Schema: documents built by gqlapi validate", () => {
  describe.each(SOURCES)("%s", (_, sdl) => {
    it("schema build", () => expectValid(build(sdl)))
    // graphql cannot execute an introspection query against a schema without a Query root
    if (schemaOf(sdl).getQueryType()) {
      it("introspection build", () => expectValid(buildIntrospected(sdl)))
    }
    it("round trip through the IR", () => expectValid(fromIR(toIR(build(sdl)))))
  })
})

// applies a mutation to a deep copy of a valid document and expects the schema to reject the result
const rejects = (validate: ValidateFunction, doc: object, mutate: (doc: any) => void) => {
  expect(validate(doc)).toBe(true)
  const broken = clone(doc)
  mutate(broken)
  expect(validate(broken)).toBe(false)
}

describe("JSON Schema: rejects what the spec forbids", () => {
  const doc = build(FEATURES.objects)
  const directives = build(FEATURES.directives)
  const deprecations = build(FEATURES.deprecations)
  const reject = (mutate: (doc: any) => void, base: object = doc) => rejects(validate, base, mutate)

  it("a graphapi value other than the string 1.0", () => {
    reject((d) => (d.graphapi = 1.0))
    reject((d) => (d.graphapi = "0.1.2"))
    reject((d) => delete d.graphapi)
  })
  it("an unknown root property, including $schema", () => {
    reject((d) => (d.info = {}))
    reject((d) => (d.$schema = "https://udamir.github.io/graphapi/schemas/graphapi-1.0.schema.json"))
  })
  it("operations without their *TypeName and the reverse, empty components", () => {
    reject((d) => delete d.queryTypeName)
    reject((d) => (d.mutationTypeName = "Mutation"))
    reject((d) => (d.components = {}))
    reject((d) => (d.components.unions = {}))
  })
  it("a type usage with neither or both of $ref and type, with nonNull: false or with JSON Schema keys", () => {
    reject((d) => delete d.queries.size.$ref)
    reject((d) => (d.queries.size.type = "String"))
    reject((d) => (d.components.inputObjects.Range.properties.to.$ref = "#/components/scalars/Date"))
    reject((d) => (d.queries.actors.items.type = "String"))
    reject((d) => (d.queries.size.nonNull = false))
    reject((d) => (d.queries.actors.items.nonNull = false))
    reject((d) => (d.queries.size.format = "Size"))
    reject((d) => (d.components.inputObjects.Range.properties.to.required = true))
    reject((d) => (d.queries.actors.items.description = "An actor"))
  })
  it("nonNull: false or a nullable key on a field, an argument, an input field or a list item", () => {
    const sites: ((d: any) => any)[] = [
      (d) => d.components.objects.User.methods.name,
      (d) => d.components.objects.User.methods.id,
      (d) => d.queries.node.args.id,
      (d) => d.components.inputObjects.Range.properties.to,
      (d) => d.queries.actors.items,
      (d) => d.components.inputObjects.Filter.properties.ids.items,
    ]
    for (const site of sites) {
      reject((d) => (site(d).nonNull = false))
      reject((d) => (site(d).nullable = true))
      reject((d) => (site(d).nullable = false))
    }
    reject((d) => (d.components.inputObjects.Range.properties.to.nonNull = "true"))
  })
  it("a type that is neither a built-in scalar nor list", () => {
    reject((d) => (d.components.inputObjects.Range.properties.to.type = "Date"))
    reject((d) => (d.components.inputObjects.Range.properties.to.type = "int"))
    reject((d) => (d.components.inputObjects.Range.properties.to.type = "integer"))
    reject((d) => (d.queries.actors.type = "array"))
    reject((d) => (d.queries.node.type = "object"))
  })
  it("items without type list, and a list without items", () => {
    reject((d) => (d.queries.size.items = { type: "String" }))
    reject((d) => (d.components.inputObjects.Range.properties.to.items = { type: "Int" }))
    reject((d) => delete d.queries.actors.items)
    reject((d) => (d.queries.actors.items = {}))
    reject((d) => delete d.components.inputObjects.Filter.properties.ids.items.type)
  })
  it("a $ref into a section that the position does not allow", () => {
    reject((d) => (d.queries.node.$ref = "#/components/inputObjects/Filter"))
    reject((d) => (d.queries.node.args.id = { $ref: "#/components/objects/User" }))
    reject((d) => (d.queries.actors.items.$ref = "#/components/inputObjects/Filter"))
    reject((d) => (d.components.inputObjects.Filter.properties.ids.items = { $ref: "#/components/unions/Actor" }))
    reject((d) => (d.queries.size.$ref = "#/components/directives/skip"))
  })
  it("the typeDef, output, type.kind and definition wrappers of the nested format", () => {
    reject((d) => (d.queries.size = { output: { typeDef: { $ref: "#/components/enums/Size" } } }))
    reject((d) => (d.queries.size.output = { typeDef: { $ref: "#/components/enums/Size" } }))
    reject((d) => (d.components.inputObjects.Range.properties.to = { typeDef: { type: { kind: "Int" } } }))
    reject((d) => (d.components.inputObjects.Range.properties.to.typeDef = { type: "Int" }))
    reject((d) => (d.components.inputObjects.Range.properties.to.type = { kind: "Int" }))
    reject((d) => (d.queries.actors.items = { typeDef: { $ref: "#/components/unions/Actor" } }))
    reject((d) => (d.queries.actors = { type: { kind: "list", items: { $ref: "#/components/unions/Actor" } } }))
    reject((d) => {
      const { methods, interfaces } = d.components.objects.User
      d.components.objects.User = { title: "User", type: { kind: "object", interfaces, methods } }
    })
    reject((d) => (d.directives[0] = { definition: { $ref: d.directives[0].$ref } }), directives)
    reject((d) => (d.directives[0].definition = { $ref: "#/components/directives/tag" }), directives)
  })
  it("a definition type that is unknown or does not match its section, and members of another kind", () => {
    reject((d) => (d.components.objects.User.type = "record"))
    reject((d) => (d.components.objects.User.type = "Object"))
    reject((d) => (d.components.interfaces.Node.type = "object"))
    reject((d) => delete d.components.enums.Size.type)
    reject((d) => (d.components.objects.Actor = d.components.unions.Actor))
    reject((d) => (d.components.enums.Range = d.components.inputObjects.Range))
    reject((d) => (d.components.objects.User.implementedBy = [{ $ref: "#/components/objects/Bot" }]))
    reject((d) => (d.components.objects.User.properties = {}))
    reject((d) => delete d.components.objects.User.methods)
    reject((d) => (d.components.inputObjects.Range.methods = {}))
    reject((d) => (d.components.unions.Actor.oneOf = [{ $ref: "#/components/interfaces/Node" }]))
    reject((d) => delete d.components.enums.Size.values)
    reject((d) => (d.components.enums.Size.values.SMALL = { label: "s" }))
    reject((d) => (d.components.enums.Size.specifiedByURL = "https://example.com"))
    reject((d) => (d.components.objects.User.extra = true))
  })
  it("operations and arguments with title or unknown keys", () => {
    reject((d) => (d.queries.node.title = "node"))
    reject((d) => (d.queries.node.args.id.title = "id"))
    reject((d) => (d.queries.node.default = null))
    reject((d) => (d.queries.node.args.id.args = { first: { type: "Int" } }))
    reject((d) => (d.queries.node.args = {}))
  })
  it("directive usages keyed by name, without $ref, with a foreign $ref or empty meta", () => {
    reject((d) => (d.directives = { tag: { $ref: "#/components/directives/tag" } }), directives)
    reject((d) => delete d.directives[0].$ref, directives)
    reject((d) => (d.directives[0].$ref = "#/components/objects/Product"), directives)
    reject((d) => (d.directives[0].meta = {}), directives)
    reject((d) => (d.directives[0].repeats = []), directives)
    reject((d) => (d.directives = []), directives)
  })
  it("a deprecation without its @deprecated usage, and the reverse", () => {
    reject((d) => delete d.queries.length.directives, deprecations)
    reject((d) => delete d.queries.length.deprecation, deprecations)
    reject((d) => delete d.queries.length.directives[0].meta, deprecations)
    reject((d) => (d.queries.length.deprecation = {}), deprecations)
    reject((d) => (d.queries.length.deprecation = { reason: "" }), deprecations)
    reject((d) => (d.queries.length.deprecated = true), deprecations)
  })
  it("malformed directive definitions and root types", () => {
    reject((d) => delete d.components.directives.tag.repeatable, directives)
    reject((d) => (d.components.directives.tag.args = { type: "object", properties: {} }), directives)
    reject((d) => (d.components.directives.tag.locations = ["NOWHERE"]), directives)
    reject((d) => (d.rootTypes.query = {}), directives)
    reject((d) => (d.rootTypes.query.interfaces = []), directives)
  })
})
