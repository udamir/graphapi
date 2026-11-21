import type { GraphApiUsage } from "./graphapi"

/** Anything that carries directive usages: the document, a root type, a definition, an operation, an argument, an enum value */
export interface GraphApiElementWithDirectives {
  directives?: GraphApiUsage[]
}

const DIRECTIVES = "#/components/directives/"

/**
 * The arguments of every usage of a directive on an element, in source order, as the `meta` objects of the document
 * (not copies): `[]` when the directive is not used, `{}` for a usage without arguments, one entry per usage of a
 * repeatable directive.
 *
 * ```ts
 * directiveArgs(doc.queries.order, "tags") // [{ tags: ["orders", "read"] }]
 * ```
 */
export const directiveArgs = (
  element: GraphApiElementWithDirectives | undefined,
  name: string,
): Record<string, unknown>[] => {
  const usages = element?.directives
  if (!usages?.length) {
    return []
  }
  const ref = DIRECTIVES + name
  const result: Record<string, unknown>[] = []
  for (const usage of usages) {
    if (usage.$ref === ref) {
      result.push(usage.meta ?? {})
    }
  }
  return result
}
