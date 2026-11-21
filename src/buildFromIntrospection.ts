import type { IntrospectionQuery } from "graphql"

import type { GraphApiSchema } from "./graphapi"
import { fromIntrospection } from "./from-introspection"
import { fromIR } from "./serialize"

/** Builds a GraphAPI document from an introspection result */
export function buildFromIntrospection(introspection: IntrospectionQuery): GraphApiSchema {
  return fromIR(fromIntrospection(introspection))
}
