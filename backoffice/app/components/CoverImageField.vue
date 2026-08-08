<script setup lang="ts">
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_MB } from '~/composables/useMediaUpload'

/**
 * The cover image. Upload, not a URL field.
 *
 * This image is the SHARE PREVIEW — it feeds `og:image` at roughly 1200×630,
 * and it is what people see when the article is posted anywhere. So the preview
 * here is deliberately rendered at that aspect ratio: a cover that looks fine as
 * a thumbnail and loses the subject's head when cropped to a social card is the
 * failure this field exists to prevent.
 *
 * The file goes browser → storage directly. See useMediaUpload for why.
 */
const model = defineModel<string>({ required: true })

const { state, upload } = useMediaUpload()
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
/** Set when the URL exists but the browser cannot load it. */
const broken = ref(false)

async function handleFile(file: File | undefined | null) {
  if (!file) return
  broken.value = false
  const media = await upload(file)
  if (media) {
    // The ORIGINAL url, not a derived variant. Variants are produced by a
    // background sweep and are `pending` for a few seconds after confirm — and
    // og:image must be a stable URL that never 404s, so it points at the
    // original for good.
    model.value = media.url
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  handleFile(event.dataTransfer?.files?.[0])
}

function clear() {
  model.value = ''
  broken.value = false
  if (fileInput.value) fileInput.value.value = ''
}

const accept = ACCEPTED_IMAGE_TYPES.join(',')
</script>

<template>
  <div>
    <span class="text-[0.8125rem] font-medium">Cover image</span>

    <!-- Has an image: show it at share-card proportions. -->
    <div v-if="model && !broken" class="mt-1.5">
      <div class="relative overflow-hidden rounded-md border border-border">
        <img
          :src="model"
          alt=""
          class="aspect-[1200/630] w-full bg-bg-sunken object-cover"
          @error="broken = true"
        >
        <div
          v-if="state.uploading"
          class="absolute inset-0 grid place-items-center bg-bg/70 text-[0.8125rem] font-medium"
        >
          Uploading… {{ state.progress }}%
        </div>
      </div>

      <div class="mt-2 flex items-center gap-3 text-[0.8125rem]">
        <button
          type="button"
          class="text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          @click="fileInput?.click()"
        >
          Replace
        </button>
        <button
          type="button"
          class="text-danger underline-offset-2 hover:underline"
          @click="clear"
        >
          Remove
        </button>
      </div>
    </div>

    <!-- No image, or one that will not load. -->
    <div v-else class="mt-1.5">
      <button
        type="button"
        class="flex aspect-[1200/630] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 text-center transition-colors"
        :class="dragging
          ? 'border-accent bg-accent-subtle'
          : 'border-border-strong bg-bg hover:border-border-strong hover:bg-bg-sunken'"
        :disabled="state.uploading"
        @click="fileInput?.click()"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <template v-if="state.uploading">
          <span class="text-[0.8125rem] font-medium">Uploading… {{ state.progress }}%</span>
          <!-- A real progress bar driven by bytes sent, not a spinner that
               tells you nothing about whether a 9 MB file is moving. -->
          <span class="h-1 w-32 overflow-hidden rounded-full bg-bg-sunken">
            <span
              class="block h-full bg-accent transition-[width] duration-150"
              :style="{ width: `${state.progress}%` }"
            />
          </span>
        </template>
        <template v-else>
          <AppIcon name="media" :size="20" class="text-fg-subtle" />
          <span class="text-[0.8125rem] font-medium">
            {{ broken ? 'That image could not be loaded' : 'Upload a cover image' }}
          </span>
          <span class="text-xs text-fg-subtle">
            Drop it here or click to choose · JPEG, PNG or WebP · up to {{ MAX_UPLOAD_MB }} MB
          </span>
        </template>
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      class="sr-only"
      @change="handleFile(($event.target as HTMLInputElement).files?.[0])"
    >

    <p
      v-if="state.error"
      class="mt-2 flex items-start gap-1.5 text-xs text-danger"
      role="alert"
    >
      <AppIcon name="warning" :size="14" class="mt-px shrink-0" />
      {{ state.error }}
    </p>

    <p class="mt-1.5 text-xs text-fg-subtle">
      Shown at roughly 1200×630 when the article is shared. Mandatory before
      publishing.
    </p>
  </div>
</template>
