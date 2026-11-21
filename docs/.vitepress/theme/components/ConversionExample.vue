<script setup lang="ts">
import { withBase } from "vitepress"
import { computed, ref } from "vue"

import { data } from "../../../examples/examples.data"

const props = defineProps<{ id: string }>()

const example = computed(() => {
  const found = data[props.id]
  if (!found) {
    throw new Error(`Unknown conversion example: ${props.id}`)
  }
  return found
})

const active = ref<string>("graphapi")
const panel = computed(() => example.value.panels.find((item) => item.id === active.value) ?? example.value.panels[0])
</script>

<template>
  <div class="conversion">
    <div class="bar">
      <div class="tabs" role="tablist">
        <button
          v-for="item in example.panels"
          :key="item.id"
          role="tab"
          :aria-selected="active === item.id"
          :class="{ active: active === item.id }"
          @click="active = item.id"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <p v-if="panel.note" class="note"><code>{{ panel.note }}</code></p>
    <div class="code" v-html="panel.html" />
    <div class="facts">
      <span :class="['badge', example.lossless ? 'ok' : 'warn']">
        {{ example.lossless ? "✓ Lossless round trip" : "Round trip normalizes the SDL" }}
      </span>
      <span :class="['badge', example.introspectionIdentical ? 'ok' : 'info']">
        {{
          example.introspectionIdentical
            ? "✓ Introspection build is identical"
            : "Introspection build lacks directive usages"
        }}
      </span>
      <a :class="['badge', example.valid ? 'ok' : 'warn']" :href="withBase('/spec/json-schema')">
        {{ example.valid ? "✓ Valid against the JSON Schema" : "Does not validate against the JSON Schema" }}
      </a>
      <span class="links">
        <a :href="withBase(`/spec/v1.0#${example.spec}`)">Specification</a>
        <a :href="withBase(`/demo#${example.demo}`)">Open in demo →</a>
      </span>
    </div>
  </div>
</template>

<style scoped>
.conversion {
  margin: 16px 0 32px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

.bar {
  padding: 8px;
  border-bottom: 1px solid var(--vp-c-divider);
  overflow-x: auto;
}

.tabs {
  display: flex;
  gap: 4px;
  width: max-content;
}

.tabs button {
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

.tabs button:hover {
  color: var(--vp-c-text-1);
}

.tabs button.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-1);
}

.note {
  margin: 0 !important;
  padding: 8px 16px 0;
  font-size: 12px;
  line-height: 1.5;
}

.note code {
  font-size: 12px !important;
  background: transparent !important;
  padding: 0 !important;
  color: var(--vp-c-text-2);
}

.code :deep(div[class*="language-"]) {
  margin: 8px 0 0 !important;
  border-radius: 0 !important;
  max-height: 480px;
  overflow: auto;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 12px;
}

.badge {
  padding: 2px 10px;
  border-radius: 999px;
  font-weight: 500;
}

a.badge {
  text-decoration: none;
}

.badge.ok {
  color: var(--vp-c-green-1);
  background: var(--vp-c-green-soft);
}

.badge.info {
  color: var(--vp-c-indigo-1);
  background: var(--vp-c-indigo-soft);
}

.badge.warn {
  color: var(--vp-c-yellow-1);
  background: var(--vp-c-yellow-soft);
}

.links {
  display: flex;
  gap: 14px;
  margin-left: auto;
}

.links a {
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.links a:hover {
  text-decoration: underline;
}
</style>
