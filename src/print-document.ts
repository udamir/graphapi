import type {
  GraphApiArgument,
  GraphApiDeprecatable,
  GraphApiDirectiveDefinition,
  GraphApiEnum,
  GraphApiInputObject,
  GraphApiOperation,
  GraphApiRef,
  GraphApiRootType,
  GraphApiScalar,
  GraphApiSchema,
  GraphApiTypeUsage,
  GraphApiUnion,
  GraphApiUsage,
} from "./graphapi"
import {
  BUILTIN_SCALARS,
  DEFAULT_DEPRECATION_REASON,
  DEFAULT_ROOT_NAMES,
  DirectiveDef,
  ROOT_KINDS,
  RootKind,
  TypeKind,
  TypeRef,
  inferTypeRef,
  isSpecifiedDirectiveShape,
} from "./ir"
import { specifiedDirectiveDefs } from "./from-schema"
import { printDescription, printUntyped } from "./print"
import { nameOfRef, printString } from "./utils"

/**
 * Prints a GraphAPI 1.0 document as SDL directly, without lifting it into the IR first. The output is the same as
 * `printIR(lift(doc))`, and so are the errors for malformed documents (the same checks, with the same messages, run
 * while printing). The equivalence is pinned by test/equivalence.
 */

const BUCKETS: [keyof NonNullable<GraphApiSchema["components"]>, TypeKind][] = [
  ["scalars", "scalar"],
  ["objects", "object"],
  ["interfaces", "interface"],
  ["unions", "union"],
  ["enums", "enum"],
  ["inputObjects", "input"],
]

const OPERATIONS = { query: "queries", mutation: "mutations", subscription: "subscriptions" } as const

const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key)

// the specified directive definitions of the installed graphql, for typing the arguments of their usages
let specifiedDefs: Map<string, DirectiveDef> | undefined
const specifiedDef = (name: string): DirectiveDef | undefined =>
  (specifiedDefs ??= new Map(specifiedDirectiveDefs().map((def) => [def.name, def]))).get(name)

/** A named type of the document: a component definition, or a root type with its operations */
interface Entry {
  kind: TypeKind
  // the definition, or the root type metadata of a root type
  def: Record<string, any>
  operations?: Record<string, GraphApiOperation>
}

/** A type to print a value with: a type usage of the document, or the IR type of a specified directive argument */
type ValueType = GraphApiTypeUsage | TypeRef

class DocumentPrinter {
  private readonly types = new Map<string, Entry>()
  private readonly roots: Partial<Record<RootKind, string>> = {}
  private readonly directiveDefs: Record<string, GraphApiDirectiveDefinition>
  private readonly names = new Map<string, string>()
  private readonly parts: string[] = []
  private out = ""
  private flattened = 0

  constructor(private readonly doc: GraphApiSchema) {
    this.directiveDefs = doc.components?.directives ?? {}
  }

  private refName(ref: string): string {
    let name = this.names.get(ref)
    if (name === undefined) {
      this.names.set(ref, (name = nameOfRef(ref)))
    }
    return name
  }

  private deprecation(element: GraphApiDeprecatable): string | undefined {
    const deprecation = element.deprecation
    return deprecation ? deprecation.reason || DEFAULT_DEPRECATION_REASON : undefined
  }

  /** A type usage as SDL (`[User!]!`), validated like `lift` validates it */
  private typeStr(usage: GraphApiTypeUsage): string {
    const nonNull = usage.nonNull === true ? "!" : ""
    const { $ref, type, items } = usage as { $ref?: unknown; type?: unknown; items?: GraphApiTypeUsage }
    if ($ref !== undefined && type !== undefined) {
      throw new Error("Unexpected type: a type usage has both $ref and type")
    }
    if (typeof $ref === "string") {
      return this.refName($ref) + nonNull
    }
    if (type === "list") {
      if (!items || typeof items !== "object") {
        throw new Error("Unexpected type: a list without items")
      }
      return "[" + this.typeStr(items) + "]" + nonNull
    }
    if (typeof type === "string" && BUILTIN_SCALARS.has(type)) {
      return type + nonNull
    }
    throw new Error(`Unexpected type: expected $ref, a built-in scalar or list, got ${JSON.stringify(type ?? $ref)}`)
  }

  /** Prints a value as the GraphQL literal of a type (quoted strings, bare enums, object literals, lists) */
  private value(value: unknown, type: ValueType): string {
    if (value === null || value === undefined) {
      return "null"
    }
    const ref = type as {
      kind?: string
      of?: ValueType
      name?: string
      $ref?: string
      type?: string
      items?: ValueType
    }
    if (ref.kind === "list" || ref.type === "list") {
      const of = (ref.kind === "list" ? ref.of : ref.items)!
      if (!Array.isArray(value)) {
        return this.value(value, of)
      }
      let result = "["
      for (let i = 0; i < value.length; i++) {
        result += (i ? ", " : "") + this.value(value[i], of)
      }
      return result + "]"
    }
    const name = ref.kind === "named" ? ref.name! : ref.$ref !== undefined ? this.refName(ref.$ref) : ref.type!
    switch (name) {
      case "Int":
      case "Float":
      case "Boolean":
        return typeof value === "number" || typeof value === "boolean" ? String(value) : printUntyped(value)
      case "String":
      case "ID":
        return typeof value === "string" ? printString(value) : printUntyped(value)
    }
    const named = this.types.get(name)
    if (named?.kind === "enum") {
      return typeof value === "string" ? value : printUntyped(value)
    }
    if (named?.kind === "input" && typeof value === "object" && !Array.isArray(value)) {
      const fields = (named.def as GraphApiInputObject).properties as Record<string, GraphApiArgument> | undefined
      let result = "{"
      let first = true
      for (const key of Object.keys(value)) {
        const item = (value as Record<string, unknown>)[key]
        const field = fields && hasOwn(fields, key) ? fields[key] : undefined
        result += (first ? "" : ", ") + key + ": " + (field ? this.value(item, field) : printUntyped(item))
        first = false
      }
      return result + "}"
    }
    return printUntyped(value)
  }

  /** The type of a directive argument: from the document's definition, a specified definition, or the value itself */
  private argType(directive: string, argName: string, value: unknown): ValueType {
    if (hasOwn(this.directiveDefs, directive)) {
      const args = this.directiveDefs[directive].args
      return (args && hasOwn(args, argName) ? args[argName] : undefined) ?? inferTypeRef(value)
    }
    return specifiedDef(directive)?.args.get(argName)?.type ?? inferTypeRef(value)
  }

  /** ` @a(x: 1) @b` for the usages of an element, then its deprecation */
  private directives(usages: GraphApiUsage[] | undefined, deprecation?: string): string {
    let result = ""
    if (usages) {
      for (const usage of usages) {
        const name = this.refName(usage.$ref)
        // the deprecation marker is already carried by `deprecation`
        if (name === "deprecated" && deprecation !== undefined) {
          continue
        }
        result += " @" + name
        const meta = usage.meta
        if (meta) {
          let first = true
          for (const argName in meta) {
            const item = meta[argName]
            result += (first ? "(" : ", ") + argName + ": " + this.value(item, this.argType(name, argName, item))
            first = false
          }
          if (!first) {
            result += ")"
          }
        }
      }
    }
    if (deprecation !== undefined) {
      result +=
        deprecation === DEFAULT_DEPRECATION_REASON
          ? " @deprecated"
          : ` @deprecated(reason: ${printString(deprecation)})`
    }
    return result
  }

  private inputValue(name: string, arg: GraphApiArgument): string {
    let result = name + ": " + this.typeStr(arg)
    if (arg.default !== undefined) {
      result += " = " + this.value(arg.default, arg)
    }
    return result + this.directives(arg.directives, this.deprecation(arg))
  }

  private args(args: Record<string, GraphApiArgument> | undefined, indentation: string): string {
    if (!args) {
      return ""
    }
    const names = Object.keys(args)
    if (!names.length) {
      return ""
    }
    let described = false
    for (const name of names) {
      if (args[name].description) {
        described = true
        break
      }
    }
    // If every arg does not have a description, print them on one line.
    if (!described) {
      let result = "("
      for (let i = 0; i < names.length; i++) {
        result += (i ? ", " : "") + this.inputValue(names[i], args[names[i]])
      }
      return result + ")"
    }
    let result = "(\n"
    for (let i = 0; i < names.length; i++) {
      const arg = args[names[i]]
      result +=
        (i ? "\n" : "") +
        printDescription(arg.description, "  " + indentation, !i) +
        "  " +
        indentation +
        this.inputValue(names[i], arg)
    }
    return result + "\n" + indentation + ")"
  }

  private fields(methods: Record<string, GraphApiOperation>): void {
    const names = Object.keys(methods)
    if (!names.length) {
      return
    }
    this.out += " {\n"
    for (let i = 0; i < names.length; i++) {
      const field = methods[names[i]]
      const directives = this.directives(field.directives, this.deprecation(field))
      const args = this.args(field.args, "  ")
      this.out +=
        (i ? "\n" : "") +
        printDescription(field.description, "  ", !i) +
        "  " +
        names[i] +
        args +
        ": " +
        this.typeStr(field) +
        directives
    }
    this.out += "\n}"
  }

  private implements(interfaces: GraphApiRef[] | undefined): string {
    if (!interfaces?.length) {
      return ""
    }
    let result = " implements "
    for (let i = 0; i < interfaces.length; i++) {
      result += (i ? " & " : "") + this.refName(interfaces[i].$ref)
    }
    return result
  }

  private type(name: string, entry: Entry): void {
    const { kind, def } = entry
    if (!entry.operations && def.type !== kind) {
      throw new Error(`Unexpected definition: ${name} has type ${JSON.stringify(def.type)} in the ${kind} section`)
    }
    const description = printDescription(def.description)
    const directives = this.directives(def.directives)
    switch (kind) {
      case "scalar": {
        const url = (def as GraphApiScalar).specifiedByURL
        this.out += description + "scalar " + name + (url ? ` @specifiedBy(url: ${printString(url)})` : "") + directives
        return
      }
      case "object":
      case "interface":
        this.out +=
          description +
          (kind === "object" ? "type " : "interface ") +
          name +
          this.implements(def.interfaces) +
          directives
        this.fields(entry.operations ?? def.methods ?? {})
        return
      case "union": {
        const members = (def as GraphApiUnion).oneOf ?? []
        let result = ""
        for (let i = 0; i < members.length; i++) {
          result += (i ? " | " : " = ") + this.refName(members[i].$ref)
        }
        this.out += description + "union " + name + directives + result
        return
      }
      case "enum": {
        this.out += description + "enum " + name + directives
        const values = (def as GraphApiEnum).values ?? {}
        const keys = Object.keys(values)
        if (!keys.length) {
          return
        }
        // the lines of a block are written inline: a callback capturing `this` would allocate a context per type
        this.out += " {\n"
        for (let i = 0; i < keys.length; i++) {
          const value = values[keys[i]]
          this.out +=
            (i ? "\n" : "") +
            printDescription(value.description, "  ", !i) +
            "  " +
            keys[i] +
            this.directives(value.directives, this.deprecation(value))
        }
        this.out += "\n}"
        return
      }
      case "input": {
        this.out += description + "input " + name + directives
        const fields = (def as GraphApiInputObject).properties
        const keys = fields ? Object.keys(fields) : []
        if (!keys.length) {
          return
        }
        this.out += " {\n"
        for (let i = 0; i < keys.length; i++) {
          const field = fields[keys[i]]
          this.out +=
            (i ? "\n" : "") + printDescription(field.description, "  ", !i) + "  " + this.inputValue(keys[i], field)
        }
        this.out += "\n}"
      }
    }
  }

  /**
   * Ends the current definition. Its string is flattened right away: a definition is built by many concatenations,
   * which V8 keeps as a tree of cons strings; left as trees until the final join, they stay alive across scavenges and
   * cost much more garbage collection than one copy per definition (measured: GC 33% → 4% of the print time).
   */
  private separate(): void {
    if (this.out.length) {
      this.flattened += this.out.indexOf("\u0000")
      this.parts.push(this.out)
      this.out = ""
    }
  }

  print(): string {
    const { doc } = this
    const components = doc.components ?? {}
    // named types in the order `lift` gives them: components by section, then root types (which replace a component
    // of the same name, keeping its position)
    for (const [bucket, kind] of BUCKETS) {
      const defs = components[bucket] as Record<string, Record<string, any>> | undefined
      if (defs) {
        for (const name of Object.keys(defs)) {
          this.types.set(name, { kind, def: defs[name] })
        }
      }
    }
    for (const kind of ROOT_KINDS) {
      const operations = doc[OPERATIONS[kind]]
      if (!operations) {
        continue
      }
      const name = doc[`${kind}TypeName`] ?? DEFAULT_ROOT_NAMES[kind]
      const meta: GraphApiRootType = doc.rootTypes?.[kind] ?? {}
      this.types.set(name, { kind: "object", def: meta, operations })
      this.roots[kind] = name
    }

    // The schema definition is printed when it carries a description or directives, when a root type has a
    // non-default name, or when a non-root type is named like a default root (otherwise re-parsing would promote it).
    const rootKinds = ROOT_KINDS.filter((kind) => this.roots[kind])
    const nonDefault = ROOT_KINDS.some((kind) => {
      const name = this.roots[kind]
      return name ? name !== DEFAULT_ROOT_NAMES[kind] : this.types.has(DEFAULT_ROOT_NAMES[kind]) && rootKinds.length > 0
    })
    const schemaDirectives = this.directives(doc.directives)
    if (doc.description || schemaDirectives || nonDefault) {
      this.out += printDescription(doc.description) + "schema" + schemaDirectives + " {\n"
      for (const kind of rootKinds) {
        this.out += `  ${kind}: ${this.roots[kind]}\n`
      }
      this.out += "}"
    }

    for (const name of Object.keys(this.directiveDefs)) {
      const def = this.directiveDefs[name]
      if (isSpecifiedDirectiveShape(name, def.locations, def.args ? Object.keys(def.args) : [])) {
        continue
      }
      this.separate()
      this.out +=
        printDescription(def.description) +
        "directive @" +
        name +
        this.args(def.args, "") +
        (def.repeatable ? " repeatable" : "") +
        " on " +
        def.locations.join(" | ")
    }

    const roots = new Set(Object.values(this.roots))
    for (const [name, entry] of this.types) {
      if (!roots.has(name)) {
        this.separate()
        this.type(name, entry)
      }
    }
    for (const kind of ROOT_KINDS) {
      const name = this.roots[kind]
      if (name) {
        this.separate()
        this.type(name, this.types.get(name)!)
      }
    }
    this.separate()
    return this.parts.join("\n\n")
  }
}

/** Prints a GraphAPI 1.0 document as GraphQL SDL, without building the IR */
export const printDocument = (doc: GraphApiSchema): string => {
  if (!doc || typeof doc !== "object") {
    throw new TypeError("lift: a GraphAPI document is expected")
  }
  const version = (doc as { graphapi?: unknown }).graphapi
  if (version !== "1.0") {
    throw new Error(`Unsupported graphapi version: ${String(version)}`)
  }
  return new DocumentPrinter(doc).print()
}
