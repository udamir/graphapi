# GraphAPI
<img alt="npm" src="https://img.shields.io/npm/v/gqlapi"> <img alt="npm" src="https://img.shields.io/npm/dm/gqlapi?label=npm"> <img alt="npm type definitions" src="https://img.shields.io/npm/types/gqlapi"> <img alt="GitHub" src="https://img.shields.io/github/license/udamir/graphapi">

This package provides utils to convert GraphQL schema into GraphAPI document and back - [online demo](https://udamir.github.io/graphapi/)<br/>
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
  // false - { enum: ['RED', 'BLUE'] }
  // true  - { values: [ { value: "RED" }, { value: "BLUE" }] }
  disableStringEnums: false, // default: false
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

  """ Returns a list (or null) that can contain null values """
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
graphapi: 0.1.0
queries:
  todo:
    title: todo
    description: A Query with 1 required argument and 1 optional argument
    args:
      type: object
      required:
        - id
      properties:
        id:
          type: string
          format: ID
        isCompleted:
          type: boolean
          description: A default value of false
          default: false
    $ref: '#/components/objects/Todo'
    nullable: true
  todos:
    title: todos
    description: Returns a list (or null) that can contain null values
    args:
      type: object
      required:
        - ids
      properties:
        ids:
          type: array
          items:
            type: string
          description: Required argument that is a list that cannot contain null values
    type: array
    items:
      $ref: '#/components/objects/Todo'
      nullable: true
    nullable: true
mutations:
  create_todo:
    title: create_todo
    description: A Mutation with 1 required argument
    args:
      type: object
      required:
        - todo
      properties:
        todo:
          $ref: '#/components/inputObjects/TodoInputType'
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
          type: string
          format: ID
        name:
          type: string
        completed:
          type: boolean
        color:
          $ref: '#/components/enums/Color'
        colors:
          description: A field that requires an argument
          type: array
          items:
            $ref: '#/components/enums/Color'
          args:
            type: object
            required:
              - filter
            properties:
              filter:
                type: array
                items:
                  $ref: '#/components/enums/Color'
  enums:
    Color:
      title: Color
      type: string
      values:
        - value: RED
          description: Red color
        - value: GREEN
          description: Green color
  inputObjects:
    TodoInputType:
      title: TodoInputType
      type: object
      required:
        - name
      properties:
        name:
          type: string
        completed:
          directives:
            deprecated:
              $ref: '#/components/directives/deprecated'
              meta:
                reason: not used
          type: boolean
        color:
          $ref: '#/components/enums/Color'
          default: RED
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
        type: object
        required:
          - if
        properties:
          if:
            type: boolean
            description: Included when true.
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
        type: object
        required:
          - if
        properties:
          if:
            type: boolean
            description: Skipped when true.
      repeatable: false
```

## Documentation
TBD

## Contributing
When contributing, keep in mind that it is an objective of `graphapi` to have no package dependencies. This may change in the future, but for now, no-dependencies.

Please run the unit tests before submitting your PR: `npm test`. Hopefully your PR includes additional unit tests to illustrate your change/modification!

## License

MIT
