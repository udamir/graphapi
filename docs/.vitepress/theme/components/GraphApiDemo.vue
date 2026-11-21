<script setup lang="ts">
import { buildSchema, introspectionFromSchema } from "graphql"
import { withBase } from "vitepress"
import { computed, onMounted, ref, watch } from "vue"

import { buildFromSchema } from "../../../../src/index"
import { CASES } from "../cases"
import {
  INTROSPECTION_OPTIONS,
  SOURCES,
  TARGETS,
  convert,
  decodeState,
  encodeState,
  parseGraphApi,
  serialize,
  type Conversion,
  type Language,
  type SourceKind,
  type TargetKind,
  type TextFormat,
} from "../convert"
import { validateDocument, type Validation } from "../validate"
import CodeEditor from "./CodeEditor.vue"

const source = ref<SourceKind>("sdl")
const target = ref<TargetKind>("graphapi")
const format = ref<TextFormat>("yaml")
const preset = ref<string>(CASES[0].id)
const texts = ref<Record<SourceKind, string>>({ sdl: "", introspection: "", graphapi: "" })
const flash = ref("")

/** The preset schema in the form a source expects */
const presetText = (kind: SourceKind, id: string): string => {
  const sdl = (CASES.find((item) => item.id === id) ?? CASES[0]).sdl
  switch (kind) {
    case "sdl":
      return sdl
    case "introspection":
      return serialize(introspectionFromSchema(buildSchema(sdl), INTROSPECTION_OPTIONS), "json")
    case "graphapi":
      return serialize(buildFromSchema(buildSchema(sdl)), "yaml")
  }
}

const loadPreset = (id: string) => {
  if (!id) {
    return
  }
  texts.value = { sdl: presetText("sdl", id), introspection: "", graphapi: "" }
  texts.value[source.value] ||= presetText(source.value, id)
}

const input = computed({
  get: () => texts.value[source.value],
  set: (text: string) => (texts.value[source.value] = text),
})

// conversions run on a debounced copy of the input, so typing into a large document stays responsive
const settled = ref("")
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  input,
  (text) => {
    clearTimeout(timer)
    timer = setTimeout(() => (settled.value = text), 120)
  },
  { immediate: true },
)

const result = computed<Conversion | { error: string }>(() => {
  if (!settled.value.trim()) {
    return { error: "" }
  }
  try {
    return convert(source.value, settled.value, target.value, format.value)
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
const conversion = computed(() => ("output" in result.value ? result.value : undefined))
const error = computed(() => ("error" in result.value ? result.value.error : ""))
const output = computed(() => conversion.value?.output ?? "")
const outputLanguage = computed<Language>(() => conversion.value?.language ?? "yaml")

const sourceMeta = computed(() => SOURCES.find((item) => item.id === source.value)!)
const targetMeta = computed(() => TARGETS.find((item) => item.id === target.value)!)
const toDocument = computed(() => target.value === "graphapi")

const lines = computed(() => (output.value ? output.value.trimEnd().split("\n").length : 0))

// every GraphAPI document the demo produces is checked against the published JSON Schema
const validation = computed<Validation | undefined>(() => {
  if (!toDocument.value || !output.value) {
    return undefined
  }
  try {
    return validateDocument(parseGraphApi(output.value))
  } catch {
    return undefined
  }
})

watch(source, (kind) => {
  texts.value[kind] ||= presetText(kind, preset.value || CASES[0].id)
})

watch(preset, loadPreset)

const notify = (message: string) => {
  flash.value = message
  setTimeout(() => (flash.value = ""), 1800)
}

/** Continue with the output: it becomes the input, and the conversion goes the other way */
const useAsInput = () => {
  if (!output.value) {
    return
  }
  const next: SourceKind = toDocument.value ? "graphapi" : target.value === "sdl" ? "sdl" : "introspection"
  texts.value[next] = output.value
  source.value = next
  target.value = next === "graphapi" ? "sdl" : "graphapi"
}

const copy = async () => {
  await navigator.clipboard.writeText(output.value)
  notify("Output copied")
}

const FILE_NAMES: Record<TargetKind, (format: TextFormat) => string> = {
  graphapi: (ext) => `graphapi.${ext}`,
  sdl: () => "schema.graphql",
  introspection: () => "introspection.json",
}

const download = () => {
  const url = URL.createObjectURL(new Blob([output.value], { type: "text/plain" }))
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: FILE_NAMES[target.value](format.value),
  })
  link.click()
  URL.revokeObjectURL(url)
}

const share = async () => {
  const hash = encodeState({ source: source.value, target: target.value, format: format.value, text: input.value })
  const url = `${location.origin}${location.pathname}#${hash}`
  history.replaceState(null, "", url)
  await navigator.clipboard.writeText(url)
  notify("Link copied")
}

onMounted(() => {
  const state = location.hash.length > 1 ? decodeState(location.hash.slice(1)) : undefined
  if (!state) {
    loadPreset(preset.value)
    return
  }
  // a shared link (or an "Open in demo" link of the examples) wins over the preset
  source.value = state.source
  target.value = state.target
  format.value = state.format
  preset.value = CASES.find((item) => item.sdl === state.text)?.id ?? ""
  texts.value = { sdl: "", introspection: "", graphapi: "", [state.source]: state.text }
})
</script>

<template>
  <div class="demo">
    <div class="toolbar">
      <div class="group">
        <span class="caption">From</span>
        <div class="segmented" role="radiogroup" aria-label="Convert from">
          <button
            v-for="item in SOURCES"
            :key="item.id"
            role="radio"
            :aria-checked="source === item.id"
            :class="{ active: source === item.id }"
            @click="source = item.id"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <div class="group">
        <span class="caption">To</span>
        <div class="segmented" role="radiogroup" aria-label="Convert to">
          <button
            v-for="item in TARGETS"
            :key="item.id"
            role="radio"
            :aria-checked="target === item.id"
            :class="{ active: target === item.id }"
            @click="target = item.id"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <div class="group selects">
        <label>
          Example
          <select v-model="preset">
            <option v-if="!preset" value="" disabled>Shared input</option>
            <option v-for="item in CASES" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select>
        </label>
        <label v-if="toDocument">
          Format
          <select v-model="format">
            <option value="yaml">YAML</option>
            <option value="json">JSON</option>
          </select>
        </label>
      </div>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span>{{ sourceMeta.label }}</span>
          <span class="actions">
            <button class="link" @click="texts[source] = presetText(source, preset || CASES[0].id)">Reset</button>
            <button class="link" :disabled="!input" @click="input = ''">Clear</button>
          </span>
        </header>
        <CodeEditor v-model="input" :language="sourceMeta.language" :label="`${sourceMeta.label} input`" />
      </section>

      <section class="pane">
        <header>
          <span>
            {{ targetMeta.label }}<small v-if="lines"> · {{ lines }} lines</small>
            <a
              v-if="validation"
              :class="['valid', { invalid: !validation.valid }]"
              :href="withBase('/spec/json-schema')"
              :title="validation.valid ? `Validates against ${validation.schema}` : validation.errors.join('\n')"
            >
              {{ validation.valid ? "✓ valid" : `✗ ${validation.errors.length} schema errors` }}
            </a>
          </span>
          <span class="actions">
            <span v-if="flash" class="flash" role="status">{{ flash }}</span>
            <button class="link" :disabled="!output" title="Make the output the input" @click="useAsInput">
              ⇄ Use as input
            </button>
            <button class="link" :disabled="!output" @click="copy">Copy</button>
            <button class="link" :disabled="!output" @click="download">Download</button>
            <button class="link" :disabled="!input" @click="share">Share</button>
          </span>
        </header>
        <pre v-if="error" class="error" role="alert">{{ error }}</pre>
        <CodeEditor
          v-else
          :model-value="output"
          :language="outputLanguage"
          readonly
          :label="`${targetMeta.label} output`"
        />
      </section>
    </div>

    <div v-if="conversion" class="code-line">
      <code>{{ conversion.code }}</code>
      <p v-for="note in conversion.notes" :key="note" class="note">{{ note }}</p>
    </div>
  </div>
</template>

<style scoped>
.demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
}

.group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.caption {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: var(--vp-c-bg-soft);
}

.segmented button {
  padding: 5px 12px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--vp-c-text-2);
  transition:
    color 0.2s,
    background-color 0.2s;
}

.segmented button:hover {
  color: var(--vp-c-text-1);
}

.segmented button.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-1);
}

.selects {
  gap: 16px;
  margin-left: auto;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.selects select {
  margin-left: 6px;
  padding: 3px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.panes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  height: calc(100vh - var(--vp-nav-height) - 260px);
  min-height: 480px;
}

@media (max-width: 960px) {
  .group {
    flex-wrap: wrap;
  }

  .selects {
    margin-left: 0;
  }

  .panes {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }

  .pane {
    height: 440px;
  }
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-code-block-bg);
}

.pane header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.pane header small {
  font-weight: 400;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
}

.link {
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}

.link:disabled {
  color: var(--vp-c-text-3);
  cursor: default;
}

.valid {
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  text-decoration: none;
  color: var(--vp-c-green-1);
  background: var(--vp-c-green-soft);
}

.valid.invalid {
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
}

.flash {
  font-weight: 500;
  color: var(--vp-c-green-1);
}

.error {
  flex: 1;
  margin: 0;
  padding: 12px 14px;
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--vp-c-danger-1);
}

.code-line {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  font-size: 13px;
  overflow-x: auto;
}

.code-line code {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  white-space: pre;
}

.note {
  margin: 6px 0 0;
  color: var(--vp-c-text-2);
}
</style>
