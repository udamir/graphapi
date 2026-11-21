---
layout: page
title: Online demo
description: Convert between GraphQL SDL, introspection results and GraphAPI documents, in your browser.
---

<script setup>
import GraphApiDemo from "./.vitepress/theme/components/GraphApiDemo.vue"
</script>

<div class="demo-page">

# Online demo

Pick what you have and what you want: GraphQL SDL, an introspection result or a GraphAPI document (YAML or JSON) on the left, a GraphAPI document, SDL or introspection on the right. A GraphAPI document converted to GraphAPI is normalized through the intermediate representation (`fromIR(toIR(graphapi))`), and every GraphAPI output is validated against the [JSON Schema](/spec/json-schema). The output updates as you type, and the line below the editors shows the `gqlapi` call that produced it. **⇄ Use as input** converts the result back, **Share** copies a link to your input. Everything runs in your browser with the current sources; the [conversion examples](/examples/) and the [specification](/spec/) explain the output.

<ClientOnly>
  <GraphApiDemo />
</ClientOnly>

</div>

<style>
.demo-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 32px 24px 48px;
}

.demo-page h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.demo-page > p {
  color: var(--vp-c-text-2);
  margin-bottom: 20px;
}

.demo-page a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}
</style>
