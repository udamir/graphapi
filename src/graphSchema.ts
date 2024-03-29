import type { JSONSchema6 } from "json-schema"

export type GraphSchemaType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null"

// Graph Schema Type
export interface GraphSchema extends JSONSchema6 {
  // name
  title?: string

  // kind
  type?: GraphSchemaType

  // description
  description?: string

  // boolean not supported
  required?: string[]

  oneOf?: GraphSchema[] // union kind
  allOf?: GraphSchema[]

  items?: GraphSchema
  properties?: Record<string, GraphSchema>
  nullable?: boolean

  deprecated?: boolean | { reason: string }

  // default Value
  default?: any

  // simple enum
  enum?: string[]

  // Custom field for derictives
  "directives"?: Record<string, GraphApiDirective>
  // Custom field for args
  "args"?: GraphSchema
  // Custom field for interfaces (for object type only)
  "interfaces"?: { $ref: string }[]
  // Custom field for enum with description or deprecation
  "values"?: Record<string, GraphEnumValue>
  // Custom field for scalar types
  "specifiedByURL"?: string
}

// DIRECTIVE
export interface GraphApiDirective {
  // Ref to directive schema
  $ref: string

  // directive metadata
  meta?: Record<string, any>  
}

// ENUM
export interface GraphEnumValue {
  // description
  description?: string

  // deprecated flag with deprecation reason
  deprecated?: boolean | { reason: string }
}
