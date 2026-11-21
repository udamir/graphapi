/** Example schemas: the conversion examples page renders each one, and the online demo offers them as presets */
export interface ExampleCase {
  id: string
  title: string
  /** anchor of the specification section that defines the mapping */
  spec: string
  sdl: string
}

export const CASES: ExampleCase[] = [
  {
    id: "todo",
    title: "Todo app",
    spec: "_9-complete-example",
    sdl: `"A to-do list API"
schema {
  query: Query
  mutation: Mutation
}

"Cache hint, kept in the document as typed meta"
directive @cache(maxAge: Int!, scope: String = "public") on OBJECT | FIELD_DEFINITION

type Todo @cache(maxAge: 60) {
  id: ID!
  name: String!
  completed: Boolean
  color: Color

  "A field that requires an argument"
  colors(filter: [Color!]!): [Color!]!
}

enum Color {
  "Red color"
  RED

  "Green color"
  GREEN
}

input TodoInputType {
  name: String!
  completed: Boolean @deprecated(reason: "not used")
  color: Color = RED
}

type Query {
  "A Query with 1 required argument and 1 optional argument"
  todo(
    id: ID!

    "A default value of false"
    isCompleted: Boolean = false
  ): Todo

  "Returns a list (or null) that can contain null values"
  todos(
    "Required argument that is a list that cannot contain null values"
    ids: [String!]!
  ): [Todo]
}

type Mutation {
  "A Mutation with 1 required argument"
  create_todo(todo: TodoInputType!): Todo!
}
`,
  },
  {
    id: "scalars",
    title: "Scalars",
    spec: "_7-2-scalars",
    sdl: `"An RFC 3339 date-time string"
scalar DateTime @specifiedBy(url: "https://www.rfc-editor.org/rfc/rfc3339")

scalar JSON

type Event {
  id: ID!
  title: String!
  attendees: Int
  rating: Float
  public: Boolean!
  startsAt: DateTime!
  payload: JSON
}

type Query {
  event(id: ID!): Event
}
`,
  },
  {
    id: "lists-nullability",
    title: "Lists and nullability",
    spec: "_7-3-lists-and-non-null",
    sdl: `type Query {
  nullableInt: Int
  requiredInt: Int!
  list: [Int]
  listOfRequired: [Int!]
  requiredList: [Int]!
  requiredListOfRequired: [Int!]!
  matrix: [[Float!]!]
}
`,
  },
  {
    id: "objects-arguments",
    title: "Objects, fields and arguments",
    spec: "_7-4-objects-fields-and-arguments",
    sdl: `type User {
  id: ID!
  name: String!
  "Paginated friends of the user"
  friends(first: Int = 10, after: String): [User!]!
  avatar(size: Int! = 64, format: String = "png"): String
}

type Query {
  me: User
  user(id: ID!): User
}
`,
  },
  {
    id: "interfaces-unions",
    title: "Interfaces and unions",
    spec: "_7-5-interfaces-and-unions",
    sdl: `interface Node {
  id: ID!
}

interface Named {
  name: String!
}

type Author implements Node & Named {
  id: ID!
  name: String!
}

type Book implements Node {
  id: ID!
  title: String!
  author: Author!
}

union SearchResult = Author | Book

type Query {
  node(id: ID!): Node
  search(text: String!): [SearchResult!]!
}
`,
  },
  {
    id: "enums",
    title: "Enums",
    spec: "_7-6-enums",
    sdl: `"Workflow state of an order"
enum OrderStatus {
  "Created, not yet paid"
  PENDING
  PAID
  SHIPPED
  CANCELLED @deprecated(reason: "Use REFUNDED")
  REFUNDED
}

type Order {
  id: ID!
  status: OrderStatus!
}

type Query {
  orders(status: OrderStatus = PENDING): [Order!]!
}
`,
  },
  {
    id: "input-defaults",
    title: "Input objects and default values",
    spec: "_7-7-input-objects-and-default-values",
    sdl: `enum Sort {
  ASC
  DESC
}

input Range {
  from: Int = 0
  to: Int
}

input Filter {
  text: String = ""
  tags: [String!] = ["new", "popular"]
  sort: Sort = DESC
  range: Range = { from: 1, to: 10 }
  limit: Int! = 20
  cursor: String = null
}

type Query {
  items(filter: Filter = { text: "all" }): [String!]!
}
`,
  },
  {
    id: "descriptions",
    title: "Descriptions",
    spec: "_7-8-descriptions",
    sdl: `"""
The catalog API.
Supports **Markdown**.
"""
schema {
  query: Query
}

"A product"
type Product {
  "Stock keeping unit"
  sku: ID!

  """
  Price in cents,
  never negative
  """
  price(
    "ISO 4217 currency code"
    currency: String = "EUR"
  ): Int!
}

type Query {
  "Look a product up by SKU"
  product(sku: ID!): Product
}
`,
  },
  {
    id: "deprecation",
    title: "Deprecation",
    spec: "_7-9-deprecation",
    sdl: `enum Unit {
  METRIC
  IMPERIAL @deprecated(reason: "Use METRIC")
}

input Options {
  unit: Unit = METRIC
  legacy: Boolean @deprecated
}

type Weather {
  temperature(unit: Unit = METRIC, kelvin: Boolean @deprecated(reason: "Use unit")): Float
  humidity: Float @deprecated(reason: "Moved to Details.humidity")
}

type Query {
  weather(city: String!, options: Options): Weather
}
`,
  },
  {
    id: "custom-directives",
    title: "Custom directives",
    spec: "_7-10-custom-directives",
    sdl: `"Access control"
directive @auth(requires: [Role!]! = [USER]) on OBJECT | FIELD_DEFINITION

"Free-form tags; may be applied more than once"
directive @tag(name: String!) repeatable on OBJECT | FIELD_DEFINITION | ENUM_VALUE | SCHEMA

directive @limits(rate: Float, window: Int = 60, keys: [String] = ["ip"]) on FIELD_DEFINITION

schema @tag(name: "public") {
  query: Query
}

enum Role {
  USER
  ADMIN @tag(name: "internal")
}

type Account @auth(requires: [ADMIN]) @tag(name: "billing") @tag(name: "pii") {
  id: ID!
  balance: Float! @limits(rate: 2.5)
}

type Query {
  account(id: ID!): Account @auth
}
`,
  },
  {
    id: "conventional-directives",
    title: "Example values, tags and API kinds",
    spec: "_7-10-custom-directives",
    sdl: `scalar JSON

"A sample value; may be given more than once"
directive @example(value: JSON!) repeatable on FIELD_DEFINITION | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION | SCALAR

"Tags of an operation, for API catalogs"
directive @tags(tags: [String!]!) on FIELD_DEFINITION | OBJECT

"The compatibility kind of an operation"
directive @apiKind(kind: String!) on FIELD_DEFINITION | OBJECT

scalar Date @example(value: "2024-01-31")

input OrderFilter {
  status: String @example(value: "OPEN")
  limit: Int = 10 @example(value: 25)
}

type Order @tags(tags: ["orders"]) {
  id: ID! @example(value: "ord-1")
  total: Float @example(value: 12.5)
  placedAt: Date
}

type Query {
  order(id: ID! @example(value: "ord-1")): Order @tags(tags: ["orders", "read"]) @apiKind(kind: "bwc")
  orders(filter: OrderFilter @example(value: {status: "OPEN", limit: 5})): [Order!]! @tags(tags: ["orders"]) @apiKind(kind: "no-bwc")
}
`,
  },
  {
    id: "root-types",
    title: "Schema definition and root types",
    spec: "_7-13-schema-definition-and-root-operation-types",
    sdl: `"Root types with custom names"
schema {
  query: RootQuery
  mutation: RootMutation
  subscription: RootSubscription
}

interface Node {
  id: ID!
}

"The entry point for reads"
type RootQuery implements Node {
  id: ID!
  ping: String
}

type RootMutation {
  touch: Boolean!
}

type RootSubscription {
  ticks(interval: Int = 1000): Int!
}

"A non-root type that happens to be named Query"
type Query {
  text: String
}
`,
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    spec: "_3-1-graphapi-object",
    sdl: `type Message {
  id: ID!
  body: String!
}

type Query {
  messages(channel: ID!): [Message!]!
}

type Mutation {
  post(channel: ID!, body: String!): Message!
}

type Subscription {
  "New messages of a channel"
  messageAdded(channel: ID!): Message!
}
`,
  },
  {
    id: "one-of",
    title: "One-of input objects",
    spec: "_7-11-built-in-directives",
    sdl: `"Exactly one field must be set"
input UserBy @oneOf {
  id: ID
  email: String
  username: String
}

type User {
  id: ID!
  email: String!
}

type Query {
  user(by: UserBy!): User
}
`,
  },
]
