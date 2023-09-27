import { Maybe, isPrintableAsBlockString, printBlockString, printString } from "./utils"

import { 
  GraphApiInterface, GraphApiList, GraphApiObject, GraphApiScalar, GraphApiSchema, 
  GraphApiComponents, GraphApiComponentsKind, GraphApiUnion,
  GraphApiDirectiveDefinition, GraphApiEnum, GraphApiInputObject, 
} from "./graphapi"
import { GraphApiDirective, GraphSchema } from "./graphSchema"

const buildinDirectives = ["specifiedBy", "deprecated", "skip", "include"]
const buildinScalars = ["Int", "Float", "Boolean", "String", "ID"]

export function printSchema(graphapi: GraphApiSchema): string {
  return [
    printSchemaDefinition(graphapi),
    ...printTypes(graphapi.components),
    printOperations("Query", graphapi.queries),
    printOperations("Mutation",graphapi.mutations),
    printOperations("Subscription", graphapi.subscriptions),
  ]
  .filter(Boolean)
  .join('\n\n')
}

function printSchemaDefinition(schema: GraphApiSchema): Maybe<string> {
  const queriesCount = Object.keys(schema.queries || {}).length
  const mutationionsCount = Object.keys(schema.mutations || {}).length
  const subscriptionsCount = Object.keys(schema.subscriptions || {}).length

  if (!queriesCount && !mutationionsCount && !subscriptionsCount) {
    return
  }

  // Only print a schema definition if there is a description
  if (schema.description) {
    return (
      printDescription(schema.description) +
      'schema {\n' +
      (queriesCount ? `  query: Query\n` : '') +
      (mutationionsCount ? `  mutation: Mutation\n` : '') +
      (subscriptionsCount ? `  subscription: Subscription\n` : '') +
      '}'
    )
  }
}

export type TypePrinter<T = any> = (name: string, type: T) => string

export function printOperations(name: string, operations?: Record<string, GraphSchema>): string {
  if (!operations) { return "" }
  return printObject(name, { title: name, type: "object", properties: operations, required: Object.keys(operations) })
}

export function typePrinter(componentKind: GraphApiComponentsKind): Maybe<TypePrinter> {
  switch (componentKind) {
    case "directives": return printDirective
    case "scalars": return printScalar
    case "objects": return printObject
    case "interfaces": return printInterface
    case "unions": return printUnion
    case "enums": return printEnum
    case "inputObjects": return printInputObject
  }
}

export function printTypes(components: GraphApiComponents = {}): string[] {
  const types: string[] = []
  const kinds: GraphApiComponentsKind[] = ["directives", "scalars", "objects", "interfaces", "unions", "enums", "inputObjects"]

  for (const kind of kinds) {
    const printer = typePrinter(kind)!
    const definitions = components[kind]

    if (!definitions) { continue }

    for (const [name, definition] of Object.entries(definitions)) {
      types.push(printer(name, definition))
    }
  }

  return types
}

function printScalar(name: string, type: GraphApiScalar): string {
  if (buildinScalars.includes(name)) { return "" }

  return (
    printDescription(type.description) + 
    `scalar ${name}` + 
    printSpecifiedByURL(type.directives?.specifiedBy)
  )
}

function printImplementedInterfaces(interfaces: { $ref: string }[] = []): string {
  return interfaces.length
    ? ' implements ' + interfaces.map(typeName).join(' & ')
    : ''
}

function printObject(name: string, type: GraphApiObject): string {
  return (
    printDescription(type.description) +
    `type ${name}` +
    printImplementedInterfaces(type.interfaces) +
    printFields(type, type.required)
  )
}

function printInterface(name: string, type: GraphApiInterface): string {
  return (
    printDescription(type.description) +
    `interface ${name}` +
    printImplementedInterfaces(type.interfaces) +
    printFields(type, type.required)
  )
}

function printUnion(name: string, type: GraphApiUnion): string {
  const types = type.oneOf.map((item) => typeName(item))
  const possibleTypes = types.length ? ' = ' + types.join(' | ') : ''
  return printDescription(type.description) + 'union ' + name + possibleTypes
}

function typeName(type: GraphSchema) {
  return type.$ref ? type.$ref.split("/").pop() : type.title
}

function printEnum(name: string, type: GraphApiEnum): string {
  const values = type.enum!.map((name, i) => {
    const value = type.values?.[name] ?? {}
    return printDescription(value.description, '  ', !i) +
      '  ' +
      name +
      printDirectives({}, value.deprecated)
  }) 

  return printDescription(type.description) + `enum ${name}` + printBlock(values)
}

function printInputObject(name: string, type: GraphApiInputObject): string {
  const fieldList = Object.entries(type.properties || {})
  const fields = fieldList.map(([name, field], i) => printDescription(field.description, '  ', !i) + '  ' + printInputValue(name, field, type.required?.includes(name)))
  return printDescription(type.description) + `input ${name}` + printBlock(fields)
}

function printFields(type: GraphApiObject | GraphApiInterface, required: string[] = []): string {
  const fieldList = Object.entries(type.properties || {})

  const fields = fieldList.map(([name, field], i) =>
    printDescription(field.description, '  ', !i) +
    '  ' +
    name +
    printArgs(field.args, '  ') +
    ': ' +
    printTypeRef(field, !required.includes(name)) +
    printDirectives(field.directives, field.deprecated),
  )
  return printBlock(fields)
}

function printBlock(items: ReadonlyArray<string>): string {
  return items.length !== 0 ? ' {\n' + items.join('\n') + '\n}' : ''
}

function printArgs(args?: GraphSchema, indentation = ''): string {
  if (!args) { return "" }
  
  const argList = Object.entries(args.properties ?? {})

  if (argList.length === 0) { return '' }

  // If every arg does not have a description, print them on one line.
  if (argList.every(([,arg]) => !arg.description)) {
    return '(' + argList.map(([name, arg]) => printInputValue(name, arg, args.required?.includes(name))).join(', ') + ')'
  }

  return (
    '(\n' + argList.map(([name, arg], i) =>
      printDescription(arg.description, '  ' + indentation, !i) +
      '  ' +
      indentation +
      printInputValue(name, arg, args.required?.includes(name)),
    ).join('\n') + '\n' + indentation + ')'
  )
}

function printTypeRef (schema?: GraphSchema, nullable = false): string {
  if (!schema) { return "" }
  const { $ref, oneOf, type } = schema
  const postfix = (nullable || schema.nullable) ? "" : "!"
  if ($ref) {
    return $ref.split("/").pop() + postfix
  } else if (type === "array") {
    return `[${printTypeRef((schema as GraphApiList).items)}]${postfix}` 
  } else if (type && ['string', 'number', 'integer', 'boolean'].includes(type)) {
    if (schema.format) {
      return schema.format + postfix
    } else {
      switch (type) {
        case 'string': return 'String' + postfix
        case 'number': return 'Float' + postfix
        case 'integer': return 'Int' + postfix
        case 'boolean': return 'Boolean' + postfix
      }
    }
  } else if (oneOf && oneOf.length === 2) {
    const nullIndex = oneOf.findIndex((item) => item.type === "null")
    if (nullIndex < 0) {
      throw new Error(`Expected null type in 'oneOf' item not found: ${schema.title}`)
    }        
    return printTypeRef(nullIndex ? oneOf[0] : oneOf[1])
  }
  throw new Error(`Unexpected type: ${schema.title}`)
}

function printArgValue(value: any) {
  return typeof value === "string" ? printString(value) : String(value)
}

function printDirectiveArgs(args: Record<string, any> = {}) {
  const argList = Object.entries(args)
  if (!argList.length) { return "" }
  return '(' + argList.map(([name, value]) => `${name}: ${printArgValue(value)}`).join(', ') + ')'
}

function printDirectives(directives?: Record<string, GraphApiDirective>, deprecated?: boolean | { reason: string }): string {
  if (!directives && !deprecated) { return '' }
  let result = ""
  const _directives: Record<string, GraphApiDirective> = {
    ...directives,
    ...deprecated ? { deprecated: { $ref: "", meta: typeof deprecated === 'boolean' ? {} : deprecated } } : {},
  }
  for (const [name, directive] of Object.entries(_directives)) {
    result += ` @${name}${printDirectiveArgs(directive.meta)}`
  }
  return result
}

function printInputValue(name: string, arg: GraphSchema, required = false): string {
  const type = printTypeRef(arg, !required)
  return (
    name + ': ' + type + 
    (arg.default !== undefined ? ` = ${String(arg.default)}` : "") + 
    printDirectives(arg.directives, arg.deprecated)
  )
}

function printDirective(name: string, directive: GraphApiDirectiveDefinition): string {
  if (buildinDirectives.includes(name)) { return "" }

  return (
    printDescription(directive.description) +
    'directive @' +
    name +
    printArgs(directive.args) +
    (directive.repeatable ? ' repeatable' : '') +
    ' on ' +
    directive.locations.join(' | ')
  )
}

function printSpecifiedByURL(directive?: GraphApiDirective): string {
  return !directive || !directive.meta?.url ? "" : ` @specifiedBy(url: ${printString(directive.meta.url)})`
}

function printDescription(value?: string, indent = '', firstInBlock = true): string {
  if (!value) { return '' }

  const blockString = isPrintableAsBlockString(value) ? printBlockString(value) : printString(value)

  const prefix = indent && !firstInBlock ? '\n' + indent : indent

  return prefix + blockString.replaceAll('\n', '\n' + indent) + '\n'
}
