import type { GraphQLSchema } from "graphql"

import type { GraphApiSchema } from "./graphapi"
import { buildDocument } from "./build-schema"

/** Builds a GraphAPI document from a GraphQLSchema */
export function buildFromSchema(schema: GraphQLSchema): GraphApiSchema {
  return buildDocument(schema)
}
