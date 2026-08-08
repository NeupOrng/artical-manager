/**
 * The three-step upload: presign → browser PUT → confirm.
 *
 * **The file never passes through this app's server.** It goes from the browser
 * straight to object storage. That is not an optimisation — managed hosts cap
 * request bodies around 4.5 MB and a photo off a phone clears that easily, so a
 * proxied upload does not merely add latency, it fails.
 * See core-engine/docs/media-and-uploads.md.
 *
 * Only step 1 and step 3 go through `/api/backend`. Step 2 targets the storage
 * host directly with the URL the API signed.
 */

export interface PresignResponse {
  uploadUrl: string
  /** Stable, no expiry. This is what og:image points at. */
  publicUrl: string
  mediaId: string
  objectKey: string
  expiresInSeconds: number
}

export interface MediaResponse {
  id: string
  url: string
  type: string
  size: number
  width: number | null
  height: number | null
  status: 'pending' | 'ready' | 'failed'
  variants: Record<string, { url: string, width: number, height: number }>
}

/** Mirrors the server-side allowlist. The API re-checks the stored bytes. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_UPLOAD_MB = 10

export interface UploadState {
  uploading: boolean
  /** 0–100. Real bytes-sent progress, not a fake animation. */
  progress: number
  error: string | null
}

export function useMediaUpload() {
  const state = reactive<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  })

  /**
   * XHR rather than fetch, purely for upload progress — `fetch` has no
   * equivalent of `upload.onprogress`, and on a slow connection a large image
   * with no feedback reads as a hung page.
   */
  function put(url: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      // Must match what the URL was signed against, or storage rejects it.
      xhr.setRequestHeader('Content-Type', file.type)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          state.progress = Math.round((e.loaded / e.total) * 100)
        }
      }
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Storage rejected the upload (${xhr.status}).`))
      xhr.onerror = () =>
        reject(new Error('Could not reach storage. Check your connection.'))
      xhr.send(file)
    })
  }

  /** Validates client-side for a fast, clear message. The API still enforces. */
  function validate(file: File): string | null {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return 'Images only — JPEG, PNG or WebP.'
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB} MB.`
    }
    return null
  }

  async function upload(file: File): Promise<MediaResponse | null> {
    const invalid = validate(file)
    if (invalid) {
      state.error = invalid
      return null
    }

    state.uploading = true
    state.progress = 0
    state.error = null

    try {
      const presigned = await $fetch<PresignResponse>(
        '/api/backend/media/presign',
        {
          method: 'POST',
          body: { filename: file.name, contentType: file.type, size: file.size },
        },
      )

      await put(presigned.uploadUrl, file)

      // Step 3 is what creates the database row. Skipping it leaves the object
      // in storage with nothing referencing it — and, worse, an article
      // pointing at a URL the system does not know about.
      const media = await $fetch<MediaResponse>(
        `/api/backend/media/${presigned.mediaId}/confirm`,
        {
          method: 'POST',
          body: { objectKey: presigned.objectKey, filename: file.name },
        },
      )

      return media
    }
    catch (e) {
      const { parse } = useApiError()
      state.error = parse(e).message
      return null
    }
    finally {
      state.uploading = false
    }
  }

  return { state, upload, validate }
}
