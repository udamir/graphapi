import type { GraphApiSchema } from "./graphapi"
import { printDocument } from "./print-document"

/** Prints a GraphAPI document as GraphQL SDL */
export function printSchema(graphapi: GraphApiSchema): string {
  return printDocument(graphapi)
}
