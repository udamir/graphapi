---
title: JSON Schema
outline: [2, 3]
---

# JSON Schema

The GraphAPI document comes with a machine-readable JSON Schema (draft 2020-12) that checks the structure of a document: which fields exist, which are required, the type of every value and the shape of every object. Use it to validate documents in CI, to get completion and inline errors in editors, or as a starting point for code generators.

| `$id`                                                                | Download                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `https://udamir.github.io/graphapi/schemas/graphapi-1.0.schema.json` | [graphapi-1.0.schema.json](/schemas/graphapi-1.0.schema.json){target="_blank"} |

The schema is derived from the [GraphAPI 1.0](/spec/v1.0) specification, which remains normative. Every definition in `$defs` carries a `title` and a `description` quoting the specification, so editors show the relevant rule when you hover over a field. The test suite of `gqlapi` validates every document the reference implementation produces (from a schema, from introspection, and after lifting it into the IR and serializing it again) against this schema.

## What the schema checks

- The version marker: `graphapi` is required and is the string `"1.0"`, so documents of any other version, documents without `graphapi`, and a document whose `graphapi` is an unquoted YAML number `1.0` are rejected.
- Every object is closed (`additionalProperties: false`, or `unevaluatedProperties: false` where an object extends the Element Object): an unknown field, such as `format`, `required`, `deprecated` or `nullable`, is an error.
- Required fields (`title`, `type`, `properties`, `oneOf`, `locations`, `repeatable`, `methods`, `values`, `$ref` of a directive usage, `items` of a list, …) are present and have the right JSON type.
- Optional fields that the specification says to omit when empty are not empty: descriptions are non-empty strings, `meta`, `args`, `values`, `directives`, `interfaces`, `implementedBy`, the sections of `components` and the entries of `rootTypes` contain at least one item, and `components` is omitted rather than written as `{}`.
- Map keys are GraphQL names; component keys do not start with `__`; `components.scalars` contains no built-in scalar; enum values are not `true`, `false` or `null`.
- A type usage is written flat next to the other properties of its site (operation, field, argument, input field, directive argument): it has exactly one of `$ref` and `type`, `type` is a built-in scalar (`Int`, `Float`, `String`, `Boolean` or `ID`) or `list`, `items` is present if and only if `type` is `list`, a list item is a bare type usage with no other property, and a non-null position carries `nonNull: true` (absent means nullable, `nonNull` is only ever `true`). Wrapper objects such as `typeDef`, `output`, `type: { kind }` or a `definition` in a directive usage are rejected.
- Every `$ref` has the form prescribed for its position: interfaces are `#/components/interfaces/<Name>`, union members `#/components/objects/<Name>`, directive usages `#/components/directives/<name>`, and type references point into the section of a type that may appear there (an argument or input field never references an object, interface or union, an operation result never references an input object).
- Every definition has the `type` of its section (`scalars` → `scalar`, `objects` → `object`, `interfaces` → `interface`, `unions` → `union`, `enums` → `enum`, `inputObjects` → `input`) and only the members of that kind next to it; an unknown type is rejected, and `implementedBy` appears only on interfaces.
- Directive locations are GraphQL directive location names, without duplicates.
- The `*TypeName` field of a root type is present if and only if its operations map is present, and a `rootTypes` entry comes with the operations map of its root type.
- An element with a `deprecation` carries exactly one `@deprecated` usage in its `directives`, and a `@deprecated` usage on an operation, argument, input field or enum value comes with a `deprecation` and a `meta.reason`; `deprecation.reason` is a non-empty string.

## What the schema cannot check

JSON Schema validates the shape of a document, not the relations between its parts. A document that passes the schema can still violate the specification in these ways, which a consumer (or a dedicated linter) has to check:

- **References resolve.** Every `$ref` has the right form but may point to a component that does not exist.
- **Keys agree with their content.** The key of a component equals its `title`.
- **Directive usages match their definitions.** The usage is allowed at that location, only repeatable directives are used more than once, `meta` names only arguments of the definition and every value has the type of its argument; default values have the type of their argument or input field.
- **Built-in directive rules.** Which built-in definitions must be present (every used built-in) and which must be absent (unused built-ins), since telling a built-in from an override depends on its locations and arguments; and that `components.directives.deprecated` exists whenever an element is deprecated.
- **Deprecation consistency.** The `@deprecated` usage is the first entry of `directives` and its `meta.reason` equals `deprecation.reason`.
- **`implementedBy`.** It is consistent with the `interfaces` lists of the components and sorted by type name.
- **Order.** Map entries and array items are in GraphQL declaration order.
- **Root types.** Root operation types do not also appear in `components`.
- **GraphQL validity.** For example that an object implements every field of its interfaces, or that a OneOf Input Object has only nullable fields without defaults.

A `specifiedBy` usage in a scalar's `directives` is accepted because an overridden `@specifiedBy` is a regular usage.

## Validating a document

The schema ships with the `gqlapi` package as `gqlapi/schemas/graphapi-1.0.schema.json`, so it always matches the installed version. It uses draft 2020-12, so validate with the 2020 build of [Ajv](https://ajv.js.org). It compiles in strict mode and needs no format plugins:

```ts
import Ajv2020 from "ajv/dist/2020"
import { buildSchema } from "graphql"
import { buildFromSchema } from "gqlapi"
import schema from "gqlapi/schemas/graphapi-1.0.schema.json" with { type: "json" }

const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema)

const doc = buildFromSchema(buildSchema(sdl))
if (!validate(doc)) {
  for (const error of validate.errors ?? []) {
    console.log(`${error.instancePath || "/"} ${error.message}`)
  }
}
```

## Using the schema in editors

A GraphAPI document cannot reference its schema with a `"$schema"` property: the root object is closed, so `$schema` is an unknown field and the document would no longer validate. Associate the schema with your files through the editor instead.

For YAML files, the [YAML language server](https://github.com/redhat-developer/yaml-language-server) (used by the VS Code YAML extension and many other editors) reads a modeline comment, which is not part of the document:

```yaml
# yaml-language-server: $schema=https://udamir.github.io/graphapi/schemas/graphapi-1.0.schema.json
graphapi: "1.0"
queryTypeName: Query
queries:
  hello:
    type: String
```

For JSON files (and YAML files without a modeline), map file patterns to the schema in the editor settings, for example in VS Code's `settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["*.graphapi.json"],
      "url": "https://udamir.github.io/graphapi/schemas/graphapi-1.0.schema.json"
    }
  ],
  "yaml.schemas": {
    "https://udamir.github.io/graphapi/schemas/graphapi-1.0.schema.json": ["*.graphapi.yaml", "*.graphapi.yml"]
  }
}
```

JetBrains IDEs offer the same mapping under Settings, Languages & Frameworks, Schemas and DTDs, JSON Schema Mappings.
