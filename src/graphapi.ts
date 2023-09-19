import { GraphApiDirective, GraphEnumValue, GraphSchema } from "./graphSchema"

export type DirectiveLocation = 
  'QUERY' | 'MUTATION' | 'SUBSCRIPTION' | 'FIELD' | 
  'FRAGMENT_DEFINITION' | 'FRAGMENT_SPREAD' | 'INLINE_FRAGMENT' | 
  'VARIABLE_DEFINITION' | 'SCHEMA' | 'SCALAR' | 'OBJECT' |
  'FIELD_DEFINITION' | 'ARGUMENT_DEFINITION' | 'INTERFACE' |
  'UNION' | 'ENUM' | 'ENUM_VALUE' | 'INPUT_OBJECT' | 'INPUT_FIELD_DEFINITION'

export type GraphApiScalarType = "string" | "number" | "integer" | "boolean"

export interface GraphApiSchema {
  // graphapi version 
  graphapi: "0.1.1"

  // schema description
  description?: string

  // operations
  queries?: Record<string, GraphSchema>
  mutations?: Record<string, GraphSchema>
  subscriptions?: Record<string, GraphSchema>

  components?: GraphApiComponents
}

export interface GraphApiComponents {
  // named types
  scalars?: Record<string, GraphApiScalar>
  objects?: Record<string, GraphApiObject>
  interfaces?: Record<string, GraphApiInterface>
  unions?: Record<string, GraphApiUnion>
  enums?: Record<string, GraphApiEnum>
  inputObjects?: Record<string, GraphApiInputObject>

  // directive schemas
  directives?: Record<string, GraphApiDirectiveDefinition>
}

export type GraphApiComponentsKind = keyof GraphApiComponents

// SCALAR
export interface GraphApiScalar extends GraphSchema {
  // kind = "SCALAR"
  type: GraphApiScalarType

  // format for custom scalars 
  format?: any

  // default for input values
  default?: any
}

// OBJECT
export interface GraphApiObject extends GraphSchema {
  // kind = "OBJECT"
  type: "object"

  // non-null
  required?: string[]

  // fields
  properties?: Record<string, GraphSchema>

  // interfaces
  "interfaces"?: { $ref: string }[]
}

// INTERFACE
export interface GraphApiInterface extends GraphApiObject {
  // same as object ?
}

// UNION
export interface GraphApiUnion extends GraphSchema {
  // one of objects
  oneOf: GraphSchema[] 
}

// INPUT_OBJECT
export interface GraphApiInputObject extends GraphSchema {
  // kind = "INPUT_OBJECT"
  type: "object"

  title: string

  // required
  required?: string[]
  
  // description
  description?: string

  // derictives
  directives?: Record<string, GraphApiDirective>

  // nputFields
  properties: Record<string, GraphSchema>
}

// ENUM
export interface GraphApiEnum extends GraphSchema {
  type: "string"

  // simple enum
  enum?: string[]

  // enum with description or deprecation
  "values"?: Record<string, GraphEnumValue>
}

// LIST
export interface GraphApiList extends GraphSchema {
  // kind = "LIST"
  type: "array"

  // ofType
  items?: GraphSchema
}

// LIST
export interface GraphApiArgs extends GraphSchema {
  type: "object"

  // non-null
  required?: string[]

  // fields
  properties?: Record<string, GraphSchema>
}

export interface GraphApiDirectiveDefinition {
  // name
  title: string

  // description
  description?: string

  // locations
  locations: DirectiveLocation[]

  // args[]
  args?: GraphApiArgs

  // isRepeatable
  repeatable: boolean
}
