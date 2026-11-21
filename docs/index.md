---
layout: home

hero:
  name: GraphAPI
  text: OpenAPI for GraphQL
  tagline: An OpenAPI-style document for GraphQL schemas, with a JSON Schema to validate it — build it from SDL or introspection, diff it, store it, and print it back to SDL.
  image:
    src: /logo.svg
    alt: GraphAPI
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Read the specification
      link: /spec/
    - theme: alt
      text: Try the online demo
      link: /demo

features:
  - icon: 📐
    title: Specified document format
    details: GraphAPI 1.0, with a normative specification and a JSON Schema — explicit kinds, flat type usages and one nullability encoding, designed for diffing.
    link: /spec/
    linkText: Specification
  - icon: 🔁
    title: Lossless round trips
    details: Types, defaults, deprecation, custom directives with typed arguments, repeatable directives, root type names and specifiedByURL survive SDL → GraphAPI → SDL.
  - icon: 🔍
    title: SDL or introspection
    details: Schema and introspection builds produce the same document for everything introspection exposes — see the conversion examples.
    link: /examples/
    linkText: Conversion examples
  - icon: 🧩
    title: Shared intermediate representation
    details: One SchemaIR behind every front-end and back-end; lift a document into it with toIR and write it again with fromIR or printIR.
    link: /guide/api
    linkText: API reference
  - icon: 🌐
    title: Node.js and browser
    details: ESM and CommonJS builds with bundled TypeScript declarations, plus a self-contained IIFE for script tags. graphql 16 and 17 supported.
  - icon: ⚡
    title: Live demo
    details: Convert between GraphQL SDL, introspection and GraphAPI documents in the browser, and validate the result against the JSON Schema.
    link: /demo
    linkText: Open the demo
---
