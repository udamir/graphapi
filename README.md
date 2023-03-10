# GraphAPI
<img alt="npm" src="https://img.shields.io/npm/v/gqlapi"> <img alt="npm" src="https://img.shields.io/npm/dm/gqlapi?label=npm"> <img alt="npm type definitions" src="https://img.shields.io/npm/types/gqlapi"> <img alt="GitHub" src="https://img.shields.io/github/license/udamir/graphapi">

This package provides utils to convert GraphQL schema into GraphAPI document and back.
The GraphAPI Specification is GraphQL introspection alternative, but based on JsonSchema - OpenApi for GraphQL

## Features
- JsonSchema based GraphQL document, similar to OpenApi
- Support custom directives in schema (meta) 
- GraphAPI document can be build from GraphQL Schema or Introspection
- GraphAPI document can be converted to GraphQL Schema 
- Typescript syntax support out of the box
- No dependencies, can be used in nodejs or browser

## Installation
```SH
npm install gqlapi --save
```

## Usage

### Build GraphAPI document from Schema or Introspection
```ts
import { buildSchema, graphqlSync, getIntrospectionQuery } from "graphql"
import { buildFromSchema, buildFromIntrospection } from 'gqlapi'

const options = {
  // false - oneOf: [{ type: "object" }, { type: "null" }]
  // true  - type: ["object", "null"]
  nullableArrayType: false, // default: false

  // false - oneOf: [ { enum: [RED] }, { enum: [BLUE] } ]
  // true  - oneOf: [ { const: RED }, { const: BLUE } ]
  enumItemsAsConst: false // dafault: false
}

// build from GraphQL schema
const schema = buildSchema(data)
const graphapi = buildFromSchema(schema, options)

// build from GraphQL introspection
const introspection = graphqlSync(data, getIntrospectionQuery()).data
const graphapi = buildFromIntrospection(introspection, options)

```

> Important: only deprecated directives will be in result, as introspection not support custom directives meta

### Print GraphQL schema document from GraphAPI document

```ts
import { printSchema } from 'gqlapi'

const schema = printSchema(graphapi)
console.log(schema)

```

## Example

### Input data:

```graphql
type Todo {
  id: ID!
  name: String!
  completed: Boolean
  color: Color

  "A field that requires an argument"
  colors(filter: [Color!]!): [Color!]!
}

input TodoInputType {
  name: String!
  completed: Boolean
  color: Color=RED
}

enum Color {
  "Red color"
  RED
  "Green color"
  GREEN
}

type Query {
  "A Query with 1 required argument and 1 optional argument"
  todo(
    id: ID!,
    "A default value of false"
    isCompleted: Boolean=false
  ): Todo

  "Returns a list (or null) that can contain null values"
  todos(
    "Required argument that is a list that cannot contain null values"
    ids: [String!]!
  ): [Todo]
}

type Mutation {
  "A Mutation with 1 required argument"
  create_todo(
    todo: TodoInputType!
  ): Todo!
}
```

### Output result in yaml format: 

```yaml
graphapi: 0.0.2
queries:
  todo:
    title: todo
    description: A Query with 1 required argument and 1 optional argument
    args:
      id:
        title: id
        required: true
        schema:
          $ref: '#/components/scalars/ID'
      isCompleted:
        title: isCompleted
        description: A default value of false
        required: false
        schema:
          $ref: '#/components/scalars/Boolean'
        default: false
    response:
      oneOf:
        - $ref: '#/components/objects/Todo'
        - type: 'null'
  todos:
    title: todos
    description: Returns a list (or null) that can contain null values
    args:
      ids:
        title: ids
        description: Required argument that is a list that cannot contain null values
        required: true
        schema:
          type: array
          items:
            $ref: '#/components/scalars/String'
    response:
      oneOf:
        - type: array
          items:
            oneOf:
              - $ref: '#/components/objects/Todo'
              - type: 'null'
        - type: 'null'
mutations:
  create_todo:
    title: create_todo
    description: A Mutation with 1 required argument
    args:
      todo:
        title: todo
        required: true
        schema:
          $ref: '#/components/inputObjects/TodoInputType'
    response:
      $ref: '#/components/objects/Todo'
components:
  objects:
    Todo:
      title: Todo
      type: object
      required:
        - id
        - name
        - colors
      properties:
        id:
          title: id
          $ref: '#/components/scalars/ID'
        name:
          title: name
          $ref: '#/components/scalars/String'
        completed:
          title: completed
          oneOf:
            - $ref: '#/components/scalars/Boolean'
            - type: 'null'
        color:
          title: color
          oneOf:
            - $ref: '#/components/enums/Color'
            - type: 'null'
        colors:
          title: colors
          description: A field that requires an argument
          type: array
          items:
            $ref: '#/components/enums/Color'
          args:
            filter:
              title: filter
              required: true
              schema:
                type: array
                items:
                  $ref: '#/components/enums/Color'
  scalars:
    ID:
      title: ID
      description: >-
        The `ID` scalar type represents a unique identifier, often used to
        refetch an object or as key for a cache. The ID type appears in a JSON
        response as a String; however, it is not intended to be human-readable.
        When expected as an input type, any string (such as `"4"`) or integer
        (such as `4`) input value will be accepted as an ID.
      type: string
    String:
      title: String
      description: >-
        The `String` scalar type represents textual data, represented as UTF-8
        character sequences. The String type is most often used by GraphQL to
        represent free-form human-readable text.
      type: string
    Boolean:
      title: Boolean
      description: The `Boolean` scalar type represents `true` or `false`.
      type: boolean
  inputObjects:
    TodoInputType:
      title: TodoInputType
      inputFields:
        name:
          title: name
          required: true
          schema:
            $ref: '#/components/scalars/String'
        completed:
          title: completed
          required: false
          schema:
            $ref: '#/components/scalars/Boolean'
        color:
          title: color
          required: false
          schema:
            $ref: '#/components/enums/Color'
          default: RED
  enums:
    Color:
      title: Color
      type: string
      oneOf:
        - description: Red color
          enum:
            - RED
        - description: Green color
          enum:
            - GREEN
  directives:
    include:
      title: include
      description: >-
        Directs the executor to include this field or fragment only when the
        `if` argument is true.
      locations:
        - FIELD
        - FRAGMENT_SPREAD
        - INLINE_FRAGMENT
      args:
        if:
          title: if
          description: Included when true.
          required: true
          schema:
            $ref: '#/components/scalars/Boolean'
      repeatable: false
    skip:
      title: skip
      description: >-
        Directs the executor to skip this field or fragment when the `if`
        argument is true.
      locations:
        - FIELD
        - FRAGMENT_SPREAD
        - INLINE_FRAGMENT
      args:
        if:
          title: if
          description: Skipped when true.
          required: true
          schema:
            $ref: '#/components/scalars/Boolean'
      repeatable: false
    deprecated:
      title: deprecated
      description: Marks an element of a GraphQL schema as no longer supported.
      locations:
        - FIELD_DEFINITION
        - ARGUMENT_DEFINITION
        - INPUT_FIELD_DEFINITION
        - ENUM_VALUE
      args:
        reason:
          title: reason
          description: >-
            Explains why this element was deprecated, usually also including a
            suggestion for how to access supported similar data. Formatted using
            the Markdown syntax, as specified by
            [CommonMark](https://commonmark.org/).
          required: false
          schema:
            $ref: '#/components/scalars/String'
          default: No longer supported
      repeatable: false
    specifiedBy:
      title: specifiedBy
      description: Exposes a URL that specifies the behavior of this scalar.
      locations:
        - SCALAR
      args:
        url:
          title: url
          description: The URL that specifies the behavior of this scalar.
          required: true
          schema:
            $ref: '#/components/scalars/String'
      repeatable: false
```

## Documentation
TBD

## Contributing
When contributing, keep in mind that it is an objective of `graphapi` to have no package dependencies. This may change in the future, but for now, no-dependencies.

Please run the unit tests before submitting your PR: `npm test`. Hopefully your PR includes additional unit tests to illustrate your change/modification!

## License

MIT
