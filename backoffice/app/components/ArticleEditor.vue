<script setup lang="ts">
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
// Placeholder lives in @tiptap/extensions in v3, not in StarterKit.
import { Placeholder } from '@tiptap/extensions'

/**
 * The article body editor.
 *
 * THE EXTENSION SET IS A PLATFORM CONTRACT, NOT A PREFERENCE.
 *
 * Content is stored as TipTap block JSON and rendered by each public site's
 * own `ArticleBody.vue`, which walks the document and **drops any node type it
 * does not recognise**. So a node enabled here that the sites cannot render
 * does not throw — the paragraph simply vanishes from the published article,
 * and nobody notices until a reader does.
 *
 * Every node and mark below has a matching case in
 * each site's `ArticleBody.vue`. Adding one here is a platform
 * change: the renderer in EVERY site project must be updated in the same
 * change. Root CLAUDE.md and backoffice/CLAUDE.md both say so.
 *
 * Supported, and exactly this:
 *   marks — bold, italic, strike, code, underline, link
 *   nodes — paragraph, heading (h2/h3), bulletList, orderedList, listItem,
 *           blockquote, codeBlock, horizontalRule, hardBreak, image
 */
const model = defineModel<unknown>({ required: true })

const props = defineProps<{ disabled?: boolean }>()

const editor = shallowRef<Editor>()
const linkDialogOpen = ref(false)
const linkUrl = ref('')

/** Uploading inside the body reuses the same three-step flow as the cover. */
const { state: uploadState, upload } = useMediaUpload()
const bodyImageInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  editor.value = new Editor({
    editable: !props.disabled,
    extensions: [
      StarterKit.configure({
        // The article title is the page's h1, so a heading inside the body can
        // never legitimately be one. The sites clamp to h2/h3 anyway — matching
        // that here means the author sees what will actually render.
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          // Anything not http(s) is dropped rather than rendered — a
          // "javascript:" href in stored content is the obvious hazard.
          protocols: ['http', 'https'],
        },
      }),
      Image.configure({
        // Base64 would inline megabytes into the article JSON and bypass the
        // media pipeline entirely — no derivatives, no tenant scoping, no row.
        allowBase64: false,
      }),
      // Adds `is-editor-empty`, which the placeholder CSS below hangs off.
      Placeholder.configure({ placeholder: 'Write the article…' }),
    ],
    content: (model.value as object) ?? { type: 'doc', content: [] },
    onUpdate: ({ editor: e }) => {
      model.value = e.getJSON()
    },
    editorProps: {
      attributes: {
        class: 'prose-body focus:outline-none',
      },
    },
  })
})

onBeforeUnmount(() => editor.value?.destroy())

watch(
  () => props.disabled,
  disabled => editor.value?.setEditable(!disabled),
)

/**
 * Re-sync only when the incoming document differs from what the editor already
 * holds. Without the comparison this fires on every keystroke — `onUpdate`
 * writes the model, the watcher sees a new value and calls setContent, and the
 * cursor jumps to the start of the document mid-word.
 */
watch(model, (value) => {
  const current = editor.value?.getJSON()
  if (!editor.value || JSON.stringify(current) === JSON.stringify(value)) return
  editor.value.commands.setContent((value as object) ?? { type: 'doc', content: [] }, {
    emitUpdate: false,
  })
})

const can = (name: string, attrs?: Record<string, unknown>) =>
  editor.value?.isActive(name, attrs) ?? false

function openLinkDialog() {
  linkUrl.value = editor.value?.getAttributes('link').href ?? ''
  linkDialogOpen.value = true
}

function applyLink() {
  const url = linkUrl.value.trim()
  const chain = editor.value?.chain().focus().extendMarkRange('link')
  if (!url) chain?.unsetLink().run()
  else chain?.setLink({ href: url }).run()
  linkDialogOpen.value = false
}

async function insertImage(file: File | undefined | null) {
  if (!file) return
  const media = await upload(file)
  if (media) {
    editor.value?.chain().focus().setImage({ src: media.url }).run()
  }
}

/**
 * Toolbar. Grouped by what the control does to the text rather than by
 * TipTap's internal taxonomy — an author thinks "make this a heading", not
 * "toggle a node type".
 */
const marks = [
  { name: 'bold', label: 'B', title: 'Bold', class: 'font-bold' },
  { name: 'italic', label: 'I', title: 'Italic', class: 'italic' },
  { name: 'strike', label: 'S', title: 'Strikethrough', class: 'line-through' },
  { name: 'code', label: '<>', title: 'Inline code', class: 'font-mono text-[0.6875rem]' },
] as const
</script>

<template>
  <div
    class="overflow-hidden rounded-md border border-border bg-panel focus-within:border-accent"
  >
    <!-- Sticky so the controls stay reachable in a long article rather than
         scrolling away at the top of the document. -->
    <div
      v-if="editor"
      class="sticky top-[6.5rem] z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-panel/95 px-2 py-1.5 backdrop-blur-sm"
    >
      <button
        v-for="mark in marks"
        :key="mark.name"
        type="button"
        :title="mark.title"
        :aria-pressed="can(mark.name)"
        class="grid size-7 place-items-center rounded text-xs transition-colors hover:bg-bg-sunken"
        :class="[mark.class, can(mark.name) ? 'bg-bg-sunken text-fg' : 'text-fg-muted']"
        @click="editor.chain().focus().toggleMark(mark.name).run()"
      >
        {{ mark.label }}
      </button>

      <span class="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      <button
        v-for="level in ([2, 3] as const)"
        :key="level"
        type="button"
        :title="`Heading ${level}`"
        :aria-pressed="can('heading', { level })"
        class="grid h-7 min-w-7 place-items-center rounded px-1.5 text-xs font-semibold transition-colors hover:bg-bg-sunken"
        :class="can('heading', { level }) ? 'bg-bg-sunken text-fg' : 'text-fg-muted'"
        @click="editor.chain().focus().toggleHeading({ level }).run()"
      >
        H{{ level }}
      </button>

      <span class="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      <button
        type="button"
        title="Bullet list"
        :aria-pressed="can('bulletList')"
        class="grid size-7 place-items-center rounded text-xs transition-colors hover:bg-bg-sunken"
        :class="can('bulletList') ? 'bg-bg-sunken text-fg' : 'text-fg-muted'"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        •—
      </button>
      <button
        type="button"
        title="Numbered list"
        :aria-pressed="can('orderedList')"
        class="grid size-7 place-items-center rounded text-xs transition-colors hover:bg-bg-sunken"
        :class="can('orderedList') ? 'bg-bg-sunken text-fg' : 'text-fg-muted'"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        1.
      </button>
      <button
        type="button"
        title="Quote"
        :aria-pressed="can('blockquote')"
        class="grid size-7 place-items-center rounded text-sm transition-colors hover:bg-bg-sunken"
        :class="can('blockquote') ? 'bg-bg-sunken text-fg' : 'text-fg-muted'"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        ”
      </button>
      <button
        type="button"
        title="Code block"
        :aria-pressed="can('codeBlock')"
        class="grid size-7 place-items-center rounded font-mono text-[0.6875rem] transition-colors hover:bg-bg-sunken"
        :class="can('codeBlock') ? 'bg-bg-sunken text-fg' : 'text-fg-muted'"
        @click="editor.chain().focus().toggleCodeBlock().run()"
      >
        {}
      </button>

      <span class="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      <button
        type="button"
        title="Link"
        :aria-pressed="can('link')"
        class="grid h-7 min-w-7 place-items-center rounded px-1.5 text-xs transition-colors hover:bg-bg-sunken"
        :class="can('link') ? 'bg-bg-sunken text-fg' : 'text-fg-muted'"
        @click="openLinkDialog"
      >
        Link
      </button>
      <button
        type="button"
        title="Insert image"
        :disabled="uploadState.uploading"
        class="grid h-7 min-w-7 place-items-center rounded px-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-sunken disabled:opacity-50"
        @click="bodyImageInput?.click()"
      >
        {{ uploadState.uploading ? `${uploadState.progress}%` : 'Image' }}
      </button>
      <button
        type="button"
        title="Horizontal rule"
        class="grid h-7 min-w-7 place-items-center rounded px-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-sunken"
        @click="editor.chain().focus().setHorizontalRule().run()"
      >
        —
      </button>
    </div>

    <!-- Link entry inline rather than a modal: it interrupts nothing and the
         selection stays visible behind it. -->
    <div
      v-if="linkDialogOpen"
      class="flex items-center gap-2 border-b border-border bg-bg-subtle px-3 py-2"
    >
      <input
        v-model="linkUrl"
        type="url"
        placeholder="https://…"
        class="flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-xs"
        @keydown.enter.prevent="applyLink"
        @keydown.esc="linkDialogOpen = false"
      >
      <button type="button" class="text-xs font-medium text-accent" @click="applyLink">
        {{ linkUrl.trim() ? 'Apply' : 'Remove' }}
      </button>
      <button type="button" class="text-xs text-fg-muted" @click="linkDialogOpen = false">
        Cancel
      </button>
    </div>

    <EditorContent :editor="editor" class="article-editor" />

    <input
      ref="bodyImageInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="sr-only"
      @change="insertImage(($event.target as HTMLInputElement).files?.[0])"
    >

    <p v-if="uploadState.error" class="border-t border-border px-3 py-2 text-xs text-danger" role="alert">
      {{ uploadState.error }}
    </p>
  </div>
</template>

<style>
/**
 * Editor typography.
 *
 * Deliberately NOT the published article's type — that belongs to each site and
 * they look nothing like each other. This is a writing surface: a comfortable
 * measure and clear structural distinctions so an author can see the shape of
 * what they are writing. Fidelity to the live page is what preview is for.
 */
.article-editor .ProseMirror {
  min-height: 26rem;
  padding: 1rem 1.25rem 2rem;
  /* 65–75ch. Long-form text set full-width across a desktop is unreadable. */
  max-width: 68ch;
  font-size: 0.9375rem;
  line-height: 1.7;
}

.article-editor .ProseMirror > * + * {
  margin-top: 0.85em;
}

.article-editor .ProseMirror h2 {
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  /* More space above a heading than below it — it belongs to what follows. */
  margin-top: 1.8em;
  margin-bottom: 0.4em;
}

.article-editor .ProseMirror h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.35em;
}

.article-editor .ProseMirror ul,
.article-editor .ProseMirror ol {
  padding-inline-start: 1.35em;
}
.article-editor .ProseMirror ul { list-style: disc; }
.article-editor .ProseMirror ol { list-style: decimal; }
.article-editor .ProseMirror li::marker { color: var(--color-fg-subtle); }

.article-editor .ProseMirror blockquote {
  border-inline-start: 2px solid var(--color-border-strong);
  padding-inline-start: 1em;
  color: var(--color-fg-muted);
}

.article-editor .ProseMirror pre {
  background: var(--color-bg-sunken);
  border-radius: var(--radius-sm);
  padding: 0.75rem 1rem;
  overflow-x: auto;
  font-size: 0.8125rem;
}

.article-editor .ProseMirror code {
  font-family: var(--font-mono);
  font-size: 0.875em;
}
.article-editor .ProseMirror :not(pre) > code {
  background: var(--color-bg-sunken);
  border-radius: 3px;
  padding: 0.1em 0.3em;
}

.article-editor .ProseMirror a {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.article-editor .ProseMirror img {
  border-radius: var(--radius-sm);
  max-width: 100%;
  height: auto;
}
/* A selected image needs a visible selection, or deleting one is guesswork. */
.article-editor .ProseMirror img.ProseMirror-selectednode {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.article-editor .ProseMirror hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 2em 0;
}

/* An empty document needs to say it is ready for typing. */
.article-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: 'Write the article…';
  color: var(--color-fg-subtle);
  float: inline-start;
  height: 0;
  pointer-events: none;
}
</style>
