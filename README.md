# GraphAPI
<img alt="npm" src="https://img.shields.io/npm/v/gqlapi"> <img alt="npm" src="https://img.shields.io/npm/dm/gqlapi?label=npm"> <img alt="npm type definitions" src="https://img.shields.io/npm/types/gqlapi"> <img alt="GitHub" src="https://img.shields.io/github/license/udamir/graphapi">

This package provides utils to convert GraphQL schema into GraphAPI document.
The GraphAPI Specification is GraphQL introspection alternative, but based on JsonSchema - OpenApi for GraphQl

## Features
- JsonSchema based GraphQl document, similar to OpenApi
- Support custom directives in schema (meta) 
- Typescript syntax support out of the box
- No dependencies, can be used in nodejs or browser

## Installation
```SH
npm install gqlapi --save
```

## Usage

```ts
import { buildSchema } from "graphql"
import { buildFromSchema } from 'gqlapi'

const graphapi = buildFromSchema(buildSchema(`
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
`))

console.log(graphapi)
```
Output in yaml format: 

```yaml
graphapi: 0.0.1
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
          description: A default value of false
        default: false
    response:
      oneOf:
        - $ref: '#/components/objects/Todo'
          description: A Query with 1 required argument and 1 optional argument
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
            description: Required argument that is a list that cannot contain null values
    response:
      oneOf:
        - type: array
          items:
            oneOf:
              - $ref: '#/components/objects/Todo'
                description: Returns a list (or null) that can contain null values
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
      description: A Mutation with 1 required argument
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
          $ref: '#/components/scalars/ID'
        name:
          $ref: '#/components/scalars/String'
        completed:
          oneOf:
            - $ref: '#/components/scalars/Boolean'
            - type: 'null'
        color:
          oneOf:
            - $ref: '#/components/enums/Color'
            - type: 'null'
        colors:
          type: array
          items:
            $ref: '#/components/enums/Color'
            description: A field that requires an argument
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
      type: object
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
        - title: RED
          description: Red color
          type: string
          enum:
            - RED
        - title: GREEN
          description: Green color
          type: string
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
        if:
          title: if
          description: Skipped when true.
          required: true
          schema:
            $ref: '#/components/scalars/Boolean'
            description: Skipped when true.
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
            description: >-
              Explains why this element was deprecated, usually also including a
              suggestion for how to access supported similar data. Formatted
              using the Markdown syntax, as specified by
              [CommonMark](https://commonmark.org/).
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
            description: The URL that specifies the behavior of this scalar.
      repeatable: false
```

## Documentation
TBD

## Contributing
When contributing, keep in mind that it is an objective of `graphapi` to have no package dependencies. This may change in the future, but for now, no-dependencies.

Please run the unit tests before submitting your PR: `npm test`. Hopefully your PR includes additional unit tests to illustrate your change/modification!

## License

MIT
