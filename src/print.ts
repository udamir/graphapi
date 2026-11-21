import { isPrintableAsBlockString, printBlockString, printString } from "./utils"
import {
  DEFAULT_DEPRECATION_REASON,
  DEFAULT_ROOT_NAMES,
  Deprecation,
  DirectiveDef,
  EnumValue,
  Field,
  InputValue,
  NamedType,
  ROOT_KINDS,
  SchemaIR,
  TypeRef,
  TypedValue,
  Usage,
  rootNames,
} from "./ir"

// characters that keep a description off the plain single-line path: controls (line breaks and tabs included), `"`, `\`
// eslint-disable-next-line no-control-regex
const NOT_PLAIN_LINE = /[\x00-\x1f"\\]/
const NOT_SPACE = /[^ ]/

/**
 * A description as a block string, indented, with a line break after it. A plain single-line description (most are)
 * is printed directly: for it `isPrintableAsBlockString` is true and `printBlockString` only decides whether to add
 * line breaks, which depends on its length (over 70 characters) and a leading space alone.
 */
export const printDescription = (value: string | undefined, indent = "", firstInBlock = true): string => {
  if (!value) {
    return ""
  }
  if (!NOT_PLAIN_LINE.test(value) && NOT_SPACE.test(value)) {
    const prefix = indent && !firstInBlock ? "\n" + indent : indent
    if (value.length > 70) {
      const open = value.charCodeAt(0) === 0x20 ? '"""' : '"""\n' + indent
      return prefix + open + value + "\n" + indent + '"""\n'
    }
    return prefix + '"""' + value + '"""\n'
  }
  return printAnyDescription(value, indent, firstInBlock)
}

/** The general form of printDescription, for any description (exported for the tests of the fast path) */
export const printAnyDescription = (value: string, indent: string, firstInBlock: boolean): string => {
  const blockString = isPrintableAsBlockString(value) ? printBlockString(value) : printString(value)
  const prefix = indent && !firstInBlock ? "\n" + indent : indent
  return prefix + blockString.replaceAll("\n", "\n" + indent) + "\n"
}

const printBlock = (items: readonly string[]): string => {
  return items.length !== 0 ? " {\n" + items.join("\n") + "\n}" : ""
}

const printTypeRef = (ref: TypeRef): string => {
  const postfix = ref.nonNull ? "!" : ""
  return ref.kind === "list" ? `[${printTypeRef(ref.of)}]${postfix}` : ref.name + postfix
}

/** Prints a JavaScript value as a GraphQL literal when no type information is available */
export const printUntyped = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "null"
  }
  if (Array.isArray(value)) {
    return "[" + value.map(printUntyped).join(", ") + "]"
  }
  switch (typeof value) {
    case "string":
      return printString(value)
    case "number":
    case "boolean":
    case "bigint":
      return String(value)
    case "object":
      return (
        "{" +
        Object.entries(value as Record<string, unknown>)
          .map(([key, item]) => `${key}: ${printUntyped(item)}`)
          .join(", ") +
        "}"
      )
    default:
      return printString(String(value))
  }
}

class Printer {
  constructor(private readonly ir: SchemaIR) {}

  /** Prints a value as the GraphQL literal of the given type (quoted strings, bare enums, object literals, lists) */
  value(value: unknown, type: TypeRef): string {
    if (value === null || value === undefined) {
      return "null"
    }
    if (type.kind === "list") {
      return Array.isArray(value)
        ? "[" + value.map((item) => this.value(item, type.of)).join(", ") + "]"
        : this.value(value, type.of)
    }
    switch (type.name) {
      case "Int":
      case "Float":
      case "Boolean":
        return typeof value === "number" || typeof value === "boolean" ? String(value) : printUntyped(value)
      case "String":
      case "ID":
        return typeof value === "string" ? printString(value) : printUntyped(value)
    }
    const named = this.ir.types.get(type.name)
    if (named?.kind === "enum") {
      return typeof value === "string" ? value : printUntyped(value)
    }
    if (named?.kind === "input" && named.inputFields && typeof value === "object" && !Array.isArray(value)) {
      const fields = named.inputFields
      const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const field = fields.get(key)
        return `${key}: ${field ? this.value(item, field.type) : printUntyped(item)}`
      })
      return "{" + entries.join(", ") + "}"
    }
    return printUntyped(value)
  }

  typedValue(value: TypedValue): string {
    return this.value(value.value, value.type)
  }

  usageArgs(usage: Usage): string {
    if (!usage.args.size) {
      return ""
    }
    const items: string[] = []
    for (const [name, value] of usage.args) {
      items.push(`${name}: ${this.typedValue(value)}`)
    }
    return "(" + items.join(", ") + ")"
  }

  directives(usages: readonly Usage[], deprecation?: Deprecation): string {
    let result = ""
    for (const usage of usages) {
      result += ` @${usage.name}${this.usageArgs(usage)}`
    }
    if (deprecation) {
      result +=
        deprecation.reason === DEFAULT_DEPRECATION_REASON
          ? " @deprecated"
          : ` @deprecated(reason: ${printString(deprecation.reason)})`
    }
    return result
  }

  inputValue(arg: InputValue): string {
    return (
      arg.name +
      ": " +
      printTypeRef(arg.type) +
      (arg.default ? ` = ${this.typedValue(arg.default)}` : "") +
      this.directives(arg.directives, arg.deprecation)
    )
  }

  args(args: ReadonlyMap<string, InputValue>, indentation = ""): string {
    if (!args.size) {
      return ""
    }
    let described = false
    for (const arg of args.values()) {
      if (arg.description) {
        described = true
        break
      }
    }
    // If every arg does not have a description, print them on one line.
    if (!described) {
      let result = "("
      let first = true
      for (const arg of args.values()) {
        result += (first ? "" : ", ") + this.inputValue(arg)
        first = false
      }
      return result + ")"
    }
    const items: string[] = []
    let i = 0
    for (const arg of args.values()) {
      items.push(
        printDescription(arg.description, "  " + indentation, !i++) + "  " + indentation + this.inputValue(arg),
      )
    }
    return "(\n" + items.join("\n") + "\n" + indentation + ")"
  }

  fields(fields: ReadonlyMap<string, Field> | undefined): string {
    if (!fields) {
      return ""
    }
    const items: string[] = []
    let i = 0
    for (const field of fields.values()) {
      items.push(
        printDescription(field.description, "  ", !i++) +
          "  " +
          field.name +
          this.args(field.args, "  ") +
          ": " +
          printTypeRef(field.type) +
          this.directives(field.directives, field.deprecation),
      )
    }
    return printBlock(items)
  }

  inputFields(fields: ReadonlyMap<string, InputValue> | undefined): string {
    if (!fields) {
      return ""
    }
    const items: string[] = []
    let i = 0
    for (const field of fields.values()) {
      items.push(printDescription(field.description, "  ", !i++) + "  " + this.inputValue(field))
    }
    return printBlock(items)
  }

  enumValues(values: ReadonlyMap<string, EnumValue> | undefined): string {
    if (!values) {
      return ""
    }
    const items: string[] = []
    let i = 0
    for (const value of values.values()) {
      items.push(
        printDescription(value.description, "  ", !i++) +
          "  " +
          value.name +
          this.directives(value.directives, value.deprecation),
      )
    }
    return printBlock(items)
  }

  implements(interfaces: readonly string[] | undefined): string {
    return interfaces?.length ? " implements " + interfaces.join(" & ") : ""
  }

  type(type: NamedType): string {
    const description = printDescription(type.description)
    const directives = this.directives(type.directives)
    switch (type.kind) {
      case "scalar": {
        const specifiedBy = type.specifiedByURL ? ` @specifiedBy(url: ${printString(type.specifiedByURL)})` : ""
        return description + `scalar ${type.name}` + specifiedBy + directives
      }
      case "object":
        return (
          description + `type ${type.name}` + this.implements(type.interfaces) + directives + this.fields(type.fields)
        )
      case "interface":
        return (
          description +
          `interface ${type.name}` +
          this.implements(type.interfaces) +
          directives +
          this.fields(type.fields)
        )
      case "union": {
        const members = type.members?.length ? " = " + type.members.join(" | ") : ""
        return description + `union ${type.name}` + directives + members
      }
      case "enum":
        return description + `enum ${type.name}` + directives + this.enumValues(type.values)
      case "input":
        return description + `input ${type.name}` + directives + this.inputFields(type.inputFields)
    }
  }

  directiveDef(def: DirectiveDef): string {
    return (
      printDescription(def.description) +
      "directive @" +
      def.name +
      this.args(def.args) +
      (def.repeatable ? " repeatable" : "") +
      " on " +
      def.locations.join(" | ")
    )
  }

  /**
   * The schema definition is printed when it carries a description or directives, when a root type has a
   * non-default name, or when a non-root type is named like a default root (otherwise re-parsing would promote it).
   */
  schemaDefinition(): string | undefined {
    const { ir } = this
    const roots = ROOT_KINDS.filter((kind) => ir.roots[kind])
    const hasRoots = roots.length > 0
    const nonDefault = ROOT_KINDS.some((kind) => {
      const name = ir.roots[kind]
      return name ? name !== DEFAULT_ROOT_NAMES[kind] : ir.types.has(DEFAULT_ROOT_NAMES[kind]) && hasRoots
    })
    if (!ir.description && !ir.directives.length && !nonDefault) {
      return undefined
    }
    return (
      printDescription(ir.description) +
      "schema" +
      this.directives(ir.directives) +
      " {\n" +
      roots.map((kind) => `  ${kind}: ${ir.roots[kind]}\n`).join("") +
      "}"
    )
  }
}

/** Every printable definition of the IR, in print order: schema, directives, named types, root types */
export const printIRDefinitions = (ir: SchemaIR): string[] => {
  const printer = new Printer(ir)
  const result: string[] = []
  const schema = printer.schemaDefinition()
  if (schema) {
    result.push(schema)
  }
  for (const def of ir.directiveDefs.values()) {
    if (!def.builtin) {
      result.push(printer.directiveDef(def))
    }
  }
  const roots = rootNames(ir.roots)
  for (const type of ir.types.values()) {
    if (!roots.has(type.name)) {
      result.push(printer.type(type))
    }
  }
  for (const kind of ROOT_KINDS) {
    const name = ir.roots[kind]
    const type = name ? ir.types.get(name) : undefined
    if (type) {
      result.push(printer.type(type))
    }
  }
  return result
}

export const printIR = (ir: SchemaIR): string => printIRDefinitions(ir).join("\n\n")
