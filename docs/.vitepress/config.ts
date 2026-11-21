import { cpSync, existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { Plugin } from "vite-plus"
import { defineConfig } from "vitepress"

import pkg from "../../package.json" with { type: "json" }
import { CASES } from "./theme/cases"

// the JSON Schemas live in schemas/ at the repository root (they ship with the package) and are published at /schemas/
const SCHEMAS_DIR = fileURLToPath(new URL("../../schemas", import.meta.url))

const serveSchemas = (): Plugin => ({
  name: "graphapi-schemas",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const match = req.url?.match(/\/schemas\/([\w.-]+\.json)$/)
      const file = match && join(SCHEMAS_DIR, basename(match[1]))
      if (!file || !existsSync(file)) {
        return next()
      }
      res.setHeader("Content-Type", "application/schema+json")
      res.end(readFileSync(file))
    })
  },
})

// the heading ids VitePress gives the example sections, whose titles are the case titles
const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const GUIDE = {
  text: "Guide",
  items: [
    { text: "What is GraphAPI?", link: "/guide/" },
    { text: "Getting started", link: "/guide/getting-started" },
    { text: "Usage", link: "/guide/usage" },
    { text: "Custom directives", link: "/guide/custom-directives" },
    { text: "Conversions", link: "/guide/conversions" },
    { text: "API reference", link: "/guide/api" },
    { text: "Contributing", link: "/guide/contributing" },
  ],
}

const SPECIFICATION = {
  text: "Specification",
  items: [
    { text: "Overview", link: "/spec/" },
    { text: "GraphAPI 1.0", link: "/spec/v1.0" },
    { text: "JSON Schema", link: "/spec/json-schema" },
  ],
}

const EXAMPLES = {
  text: "Conversion examples",
  collapsed: false,
  items: CASES.map((item) => ({ text: item.title, link: `/examples/#${slug(item.title)}` })),
}

const TOOLS = {
  text: "Tools",
  items: [
    { text: "Online demo", link: "/demo" },
    { text: "Conversion examples", link: "/examples/" },
    { text: "API reference", link: "/guide/api" },
  ],
}

export default defineConfig({
  title: "GraphAPI",
  description: "GraphAPI Specification — a JSON Schema based, OpenAPI-like document for GraphQL schemas",
  // served from https://udamir.github.io/graphapi/
  base: "/graphapi/",
  cleanUrls: true,
  lastUpdated: true,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/graphapi/logo.svg" }]],
  buildEnd(site) {
    cpSync(SCHEMAS_DIR, join(site.outDir, "schemas"), { recursive: true })
  },
  vite: {
    plugins: [serveSchemas()],
    build: {
      // the examples page embeds pre-highlighted output of every example (1.3 MB, 50 kB gzipped)
      chunkSizeWarningLimit: 1600,
    },
  },
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Guide", link: "/guide/", activeMatch: "/guide/" },
      { text: "Specification", link: "/spec/", activeMatch: "/spec/" },
      { text: "Examples", link: "/examples/", activeMatch: "/examples/" },
      { text: "API", link: "/guide/api" },
      { text: "Demo", link: "/demo" },
      {
        text: `v${pkg.version}`,
        items: [
          { text: "Changelog", link: "/changelog" },
          { text: "npm", link: "https://www.npmjs.com/package/gqlapi" },
        ],
      },
    ],
    sidebar: {
      "/guide/": [GUIDE, SPECIFICATION, TOOLS],
      "/spec/": [SPECIFICATION, EXAMPLES, TOOLS],
      "/examples/": [EXAMPLES, SPECIFICATION, TOOLS],
    },
    outline: { level: [2, 3] },
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/udamir/graphapi" }],
    editLink: {
      pattern: "https://github.com/udamir/graphapi/edit/master/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © Damir Yusipov",
    },
  },
})
