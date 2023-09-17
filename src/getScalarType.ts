import { GraphQLScalarType, IntrospectionScalarType } from "graphql"
import { GraphApiScalarType } from "./graphapi"

const scalarMap: Record<string, GraphApiScalarType> = {
  Int: 'integer',
  Float: 'number',
  String: 'string',
  Boolean: 'boolean',
} as const

export const getScalarType = (gqlType: IntrospectionScalarType | GraphQLScalarType): GraphApiScalarType => {
  return scalarMap[gqlType.name] || "string"
}

export const getScalarTypeFormat = (gqlType: IntrospectionScalarType | GraphQLScalarType): string | undefined => {
  switch (gqlType.name) {
    case 'Int': 
    case 'String': 
    case 'Boolean': 
      return ''
    default:
      return gqlType.name
  }
}
