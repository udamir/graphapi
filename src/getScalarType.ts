import { GraphQLScalarType, IntrospectionScalarType } from "graphql"
import { GraphApiScalarType } from "./graphapi"

const scalarMap: Record<string, GraphApiScalarType> = {
  Int: 'number',
  Float: 'number',
  String: 'string',
  Boolean: 'boolean',
} as const

export const getScalarType = (gqlType: IntrospectionScalarType | GraphQLScalarType): GraphApiScalarType => {
  return scalarMap[gqlType.name] || "string"
}
