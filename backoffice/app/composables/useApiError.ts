import type { ApiError } from '~/types/api'

/**
 * Pulls the API's error envelope out of a thrown fetch error.
 *
 * Nuxt's `$fetch` puts the parsed response body on `error.data`, so a raw
 * `error.message` is the HTTP status line rather than anything the API said.
 * Showing that is how a UI ends up displaying "500 Internal Server Error" when
 * the API sent a perfectly clear "Article needs an excerpt".
 *
 * Branch on `code`, display `message` — never parse the message, which is for
 * humans and is allowed to change.
 */
export function useApiError() {
  function parse(error: unknown): { code: string | null, message: string } {
    const data = (error as { data?: ApiError })?.data;

    if (data?.error?.message) {
      return { code: data.error.code ?? null, message: data.error.message }
    }

    // Validation failures come from class-validator through Nest's own
    // BadRequestException, which uses a different shape — an array of strings.
    const nest = (error as { data?: { message?: string | string[] } })?.data
    if (Array.isArray(nest?.message)) {
      return { code: null, message: nest.message.join('. ') }
    }
    if (typeof nest?.message === 'string') {
      return { code: null, message: nest.message }
    }

    const status = (error as { statusCode?: number })?.statusCode
    if (status === 403) {
      return { code: null, message: 'You do not have permission to do that.' }
    }

    return {
      code: null,
      message: 'Something went wrong. The change was not saved.',
    }
  }

  return { parse }
}
