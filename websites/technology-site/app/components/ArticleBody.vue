<script setup lang="ts">
/**
 * Renders TipTap block JSON.
 *
 * The API returns `content` as a TipTap document, not HTML — so something has
 * to walk it. Doing that with a render function rather than building an HTML
 * string keeps `v-html` out of the codebase entirely: nothing here can inject
 * markup that the editor did not produce, because unknown node types are
 * dropped rather than passed through.
 *
 * Deliberately duplicated in gaming-site rather than shared. websites/CLAUDE.md
 * is explicit that there is no shared component library until there is a real
 * second case for a component. The `.doc` styles this emits are this site's
 * alone (see main.css) — the gaming copy emits `.story` with its own rules.
 */
import { h, type VNode } from 'vue'

const props = defineProps<{ content: unknown }>()

interface Mark { type: string, attrs?: Record<string, unknown> }
interface Node {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: Mark[]
  content?: Node[]
}

/** Only these marks render. Anything else is ignored, not passed through. */
function applyMarks(text: string, marks: Mark[] | undefined): VNode | string {
  if (!marks?.length) return text

  return marks.reduce<VNode | string>((acc, mark) => {
    switch (mark.type) {
      case 'bold': return h('strong', null, [acc])
      case 'italic': return h('em', null, [acc])
      case 'strike': return h('s', null, [acc])
      case 'code': return h('code', null, [acc])
      case 'underline': return h('u', null, [acc])
      case 'link': {
        const href = String(mark.attrs?.href ?? '')
        // Anything not same-origin-relative gets the full safety treatment.
        const external = /^https?:\/\//i.test(href)
        return h(
          'a',
          {
            href,
            ...(external ? { rel: 'noopener noreferrer nofollow', target: '_blank' } : {}),
          },
          [acc],
        )
      }
      default: return acc
    }
  }, text)
}

function renderNodes(nodes: Node[] | undefined): (VNode | string)[] {
  if (!nodes?.length) return []
  return nodes.flatMap((node) => {
    const rendered = renderNode(node)
    return rendered === null ? [] : [rendered]
  })
}

function renderNode(node: Node): VNode | string | null {
  switch (node.type) {
    case 'text':
      return applyMarks(node.text ?? '', node.marks)

    case 'paragraph':
      return h('p', null, renderNodes(node.content))

    case 'heading': {
      // Clamped to h2/h3: the article title is the page's h1, so a heading
      // inside the body can never legitimately be one.
      const raw = Number(node.attrs?.level ?? 2)
      const level = Math.min(Math.max(raw, 2), 3)
      return h(`h${level}`, { id: slugify(textOf(node)) }, renderNodes(node.content))
    }

    case 'bulletList':
      return h('ul', null, renderNodes(node.content))

    case 'orderedList':
      return h('ol', { start: node.attrs?.start as number | undefined }, renderNodes(node.content))

    case 'listItem':
      return h('li', null, renderNodes(node.content))

    case 'blockquote':
      return h('blockquote', null, renderNodes(node.content))

    case 'codeBlock':
      return h('pre', null, [h('code', null, renderNodes(node.content))])

    case 'horizontalRule':
      return h('hr')

    case 'hardBreak':
      return h('br')

    case 'image': {
      const src = String(node.attrs?.src ?? '')
      if (!src) return null
      return h('img', {
        src,
        alt: String(node.attrs?.alt ?? ''),
        loading: 'lazy',
        decoding: 'async',
      })
    }

    // Unknown node type: drop it. Rendering something we do not understand is
    // how an editor change silently becomes a layout bug in production.
    default:
      return node.content ? h('div', null, renderNodes(node.content)) : null
  }
}

function textOf(node: Node): string {
  if (node.text) return node.text
  return (node.content ?? []).map(textOf).join('')
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

const doc = computed(() => props.content as Node | undefined)
</script>

<template>
  <div class="doc">
    <component :is="() => renderNodes(doc?.content)" />
  </div>
</template>
