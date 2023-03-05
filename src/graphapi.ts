import type { JSONSchema4 } from "json-schema"

export type DirectiveLocation = 
  'QUERY' | 'MUTATION' | 'SUBSCRIPTION' | 'FIELD' | 
  'FRAGMENT_DEFINITION' | 'FRAGMENT_SPREAD' | 'INLINE_FRAGMENT' | 
  'VARIABLE_DEFINITION' | 'SCHEMA' | 'SCALAR' | 'OBJECT' |
  'FIELD_DEFINITION' | 'ARGUMENT_DEFINITION' | 'INTERFACE' |
  'UNION' | 'ENUM' | 'ENUM_VALUE' | 'INPUT_OBJECT' | 'INPUT_FIELD_DEFINITION'

// GraphApi types
export type GraphApiTypes = GraphApiObject | GraphApiScalar | GraphApiInterface |
  GraphApiUnion | GraphApiEnum | GraphApiInputObject | GraphApiList

export type GraphApiScalarType = "string" | "number" | "boolean"

export interface GraphApiSchema {
  // graphapi version
  graphapi: string

  // schema description
  description?: string

  // operations
  queries?: Record<string, GraphApiOperation>
  mutations?: Record<string, GraphApiOperation>
  subscriptions?: Record<string, GraphApiOperation>

  components?: {
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
}

export interface GraphApiOperation {
  // name
  title?: string

  // description
  description?: string

  // operation arguments
  args?: Record<string, GraphApiInputValue>

  // operation response
  response: GraphApiBaseType

  // Custom field: type derictives
  directives?: Record<string, GraphApiDirective>
}

export interface GraphApiDirective {
  // Ref to directive schema
  $ref: string

  // directive metadata
  meta: Record<string, any>  
}

// Base Type
export interface GraphApiBaseType extends JSONSchema4 {
  // description
  description?: string

  // Custom field: type derictives
  "directives"?: Record<string, GraphApiDirective>
}

// Named Type
export interface GraphApiNamedType extends GraphApiBaseType {
  // name
  title: string
}

// SCALAR
export interface GraphApiScalar extends GraphApiNamedType {
  // kind = "SCALAR"
  type: GraphApiScalarType

  // Custom field: specifiedByURL
  "specifiedByURL"?: string
}

// OBJECT
export interface GraphApiObject extends GraphApiNamedType {
  // kind = "OBJECT"
  type: "object"

  // non-null
  required?: string[] | boolean

  // fields
  properties?: Record<string, GraphApiField>
}

// INTERFACE
export interface GraphApiInterface extends GraphApiObject {
  // same as object ?
}

// UNION
export interface GraphApiUnion extends GraphApiNamedType {
  // kind = "UNION"
  type: "object"
  
  // one of objects
  oneOf: GraphApiBaseType[] 
}

// ENUM
export interface GraphApiEnum extends GraphApiNamedType {
  // kind = "ENUM"
  type: "string"

  // enumValues
  oneOf: GraphApiBaseType[]
}

// INPUT_OBJECT
export interface GraphApiInputObject extends GraphApiNamedType {
  // kind = "INPUT_OBJECT"
  type: "object"

  // Custom field: inputFields
  "inputFields": Record<string, GraphApiInputValue>
}

// LIST
export interface GraphApiList extends GraphApiNamedType {
  // kind = "LIST"
  type: "array"

  // ofType
  items?: GraphApiTypes
}

export interface GraphApiField extends GraphApiBaseType {
  // Custom field: args
  "args"?: Record<string, GraphApiInputValue>
}

export interface GraphApiInputValue {
  // name
  title?: string

  // description
  description?: string

  // non-null
  required?: boolean

  // type
  schema?: GraphApiBaseType

  // defaultValue
  default?: any
  
  // arg derictives
  directives?: Record<string, any>
}

export interface GraphApiDirectiveDefinition {
  // name
  title: string

  // description
  description?: string

  // locations
  locations: DirectiveLocation[]

  // args[]
  args?: Record<string, GraphApiInputValue>

  // isRepeatable
  repeatable: boolean
}
