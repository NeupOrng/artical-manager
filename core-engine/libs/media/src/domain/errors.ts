import { DomainError } from '@core/shared';
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from './media';

export class UnsupportedMediaTypeError extends DomainError {
  readonly code = 'MEDIA_UNSUPPORTED_TYPE';
  readonly kind = 'invariant' as const;

  constructor(contentType: string) {
    super(`Unsupported content type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}.`, {
      contentType,
    });
  }
}

export class MediaTooLargeError extends DomainError {
  readonly code = 'MEDIA_TOO_LARGE';
  readonly kind = 'invariant' as const;

  constructor(size: number) {
    super(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`, {
      size,
      maxBytes: MAX_UPLOAD_BYTES,
    });
  }
}

export class MediaObjectMissingError extends DomainError {
  readonly code = 'MEDIA_OBJECT_MISSING';
  readonly kind = 'conflict' as const;

  constructor(objectKey: string) {
    super('Upload was not found in storage. Confirm only after the PUT succeeds.', {
      objectKey,
    });
  }
}

export class MediaNotFoundError extends DomainError {
  readonly code = 'MEDIA_NOT_FOUND';
  readonly kind = 'not-found' as const;

  constructor(mediaId: string) {
    super('Media not found.', { mediaId });
  }
}
