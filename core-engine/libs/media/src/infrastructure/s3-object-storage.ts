import { Inject, Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import type {
  ObjectStorage,
  PresignedUpload,
} from '../application/ports';
import type { AllowedContentType } from '../domain/media';

/**
 * MinIO is S3-compatible, so the AWS SDK works unchanged. forcePathStyle is
 * required — MinIO serves buckets as /bucket/key rather than as subdomains.
 */
@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  /** Server-side reads and writes. Internal endpoint, never leaves the network. */
  private readonly client: S3Client;
  /**
   * Signing only. Separate because a presigned URL's signature is bound to the
   * host it was signed against: sign with the internal `minio:9000` and the
   * browser cannot resolve it, while rewriting the host afterwards invalidates
   * the signature. Both clients share credentials; only the endpoint differs.
   */
  private readonly signingClient: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly presignTtl: number;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.bucket = config.getOrThrow<string>('MINIO_BUCKET');
    // The browser-reachable base. Deliberately separate from the internal
    // endpoint: the API talks to minio:9000 inside Docker, while og:image must
    // be an absolute URL a crawler on the public internet can fetch.
    this.publicBaseUrl = config.getOrThrow<string>('MEDIA_PUBLIC_BASE_URL').replace(/\/$/, '');
    this.presignTtl = config.get<number>('MEDIA_PRESIGN_TTL_SECONDS') ?? 300;

    const credentials = {
      accessKeyId: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretAccessKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    };
    const region = config.get<string>('MINIO_REGION') ?? 'us-east-1';

    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('MINIO_ENDPOINT'),
      region,
      forcePathStyle: true,
      credentials,
    });

    this.signingClient = new S3Client({
      endpoint: config.getOrThrow<string>('MINIO_PUBLIC_ENDPOINT'),
      region,
      forcePathStyle: true,
      credentials,
    });
  }

  async presignUpload(
    objectKey: string,
    contentType: AllowedContentType,
  ): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.signingClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: this.presignTtl, signableHeaders: new Set(['content-type']) },
    );

    return {
      uploadUrl: url,
      publicUrl: this.publicUrl(objectKey),
      objectKey,
      expiresInSeconds: this.presignTtl,
    };
  }

  async head(objectKey: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return {
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  async get(objectKey: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async put(objectKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        // Derivatives are immutable — the key changes if the source changes.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async remove(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  publicUrl(objectKey: string): string {
    return `${this.publicBaseUrl}/${this.bucket}/${objectKey}`;
  }
}
