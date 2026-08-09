<script setup lang="ts">
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import type { IconName } from '~/components/AppIcon.vue'
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

const isActive = ([name, attrs]: [string, Record<string, unknown>?]) =>
  editor.value?.isActive(name, attrs ?? {}) ?? false

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
 * Toolbar model.
 *
 * Grouped by what the control does to the text rather than by TipTap's internal
 * taxonomy — an author thinks "make this a heading", not "toggle a node type".
 *
 * Every control is an ICON, drawn on the same 16-unit grid at the same stroke
 * weight. The earlier mix of letterforms and unicode glyphs (B, •—, ", {}, —)
 * never optically aligned, and a glyph standing in for an icon is exactly the
 * default the craft floor rules out.
 */
type Tool = {
  icon: IconName
  title: string
  /** What `isActive` is checked against, when the control is a toggle. */
  active?: [string, Record<string, unknown>?]
  run: () => void
}

const groups = computed<Tool[][]>(() => {
  const e = editor.value
  if (!e) return []
  const chain = () => e.chain().focus()

  return [
    [
      { icon: 'bold', title: 'Bold  ⌘B', active: ['bold'], run: () => chain().toggleBold().run() },
      { icon: 'italic', title: 'Italic  ⌘I', active: ['italic'], run: () => chain().toggleItalic().run() },
      { icon: 'strike', title: 'Strikethrough', active: ['strike'], run: () => chain().toggleStrike().run() },
      { icon: 'code', title: 'Inline code', active: ['code'], run: () => chain().toggleCode().run() },
    ],
    [
      { icon: 'heading-2', title: 'Heading', active: ['heading', { level: 2 }], run: () => chain().toggleHeading({ level: 2 }).run() },
      { icon: 'heading-3', title: 'Subheading', active: ['heading', { level: 3 }], run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      { icon: 'bullet-list', title: 'Bullet list', active: ['bulletList'], run: () => chain().toggleBulletList().run() },
      { icon: 'ordered-list', title: 'Numbered list', active: ['orderedList'], run: () => chain().toggleOrderedList().run() },
      { icon: 'quote', title: 'Quote', active: ['blockquote'], run: () => chain().toggleBlockquote().run() },
      { icon: 'code-block', title: 'Code block', active: ['codeBlock'], run: () => chain().toggleCodeBlock().run() },
    ],
    [
      { icon: 'link', title: 'Link  ⌘K', active: ['link'], run: openLinkDialog },
      { icon: 'image', title: 'Insert image', run: () => bodyImageInput.value?.click() },
      { icon: 'rule', title: 'Divider', run: () => chain().setHorizontalRule().run() },
    ],
  ]
})
</script>

<template>
  <!--
    NO `overflow-hidden` HERE, deliberately.

    It is the obvious way to clip the toolbar to the rounded corners, and it
    silently breaks the sticky toolbar: `overflow` on an ancestor makes it the
    sticky element's containing scroll box, so the toolbar stops tracking the
    viewport and drifts down over the article text as you scroll. It looks like
    the toolbar has come loose from the editor.

    The corners are rounded on the toolbar and the content instead.
  -->
  <div class="rounded-md border border-border bg-panel focus-within:border-accent">
    <!-- Sticky so the controls stay reachable in a long article rather than
         scrolling away at the top of the document. `--header-h` is published by
         the layout; a hardcoded offset drifts the moment the header changes. -->
    <div
      v-if="editor"
      class="sticky top-[var(--header-h,0px)] z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-border bg-panel/95 px-2 py-1.5 backdrop-blur-sm"
    >
      <template v-for="(group, gi) in groups" :key="gi">
        <span
          v-if="gi > 0"
          class="mx-1 h-4 w-px bg-border"
          aria-hidden="true"
        />
        <button
          v-for="tool in group"
          :key="tool.icon"
          type="button"
          :title="tool.title"
          :aria-label="tool.title"
          :aria-pressed="tool.active ? isActive(tool.active) : undefined"
          :disabled="tool.icon === 'image' && uploadState.uploading"
          class="grid size-7 place-items-center rounded transition-colors hover:bg-bg-sunken disabled:opacity-50"
          :class="tool.active && isActive(tool.active) ? 'bg-bg-sunken text-fg' : 'text-fg-muted'"
          @click="tool.run()"
        >
          <!-- Upload progress replaces the icon in place, so the toolbar does
               not reflow mid-upload. -->
          <span v-if="tool.icon === 'image' && uploadState.uploading" class="tnum text-[0.625rem] font-medium">
            {{ uploadState.progress }}
          </span>
          <AppIcon v-else :name="tool.icon" :size="15" />
        </button>
      </template>
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
  padding: 1.5rem 1.5rem 3rem;
  /*
   * NO max-width here. The measure is controlled by the PANEL's width instead
   * (the editor column is capped at 46rem on the page), so the text fills its
   * container edge to edge and lands at roughly 72ch on its own.
   *
   * Capping the measure inside a much wider panel was the wrong lever twice
   * over: left aligned it hugged one edge with ~40% dead space, and centred it
   * read as a stray indent on short paragraphs. Sizing the container to the
   * content is what actually fits.
   */
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
