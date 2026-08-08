import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { ImageProcessor, ProcessedImage } from '../application/ports';

@Injectable()
export class SharpImageProcessor implements ImageProcessor {
  async inspect(input: Buffer): Promise<{ width: number; height: number; format: string }> {
    const meta = await sharp(input).metadata();
    return {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      format: meta.format ?? 'unknown',
    };
  }

  async resize(
    input: Buffer,
    width: number,
    height: number,
    quality: number,
  ): Promise<ProcessedImage> {
    const buffer = await sharp(input)
      // `cover` + `withoutEnlargement: false`: social cards need exact
      // dimensions, so a smaller source is upscaled rather than yielding an
      // off-ratio og:image that renders with letterboxing in the feed.
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .webp({ quality })
      .toBuffer();

    return { buffer, width, height, size: buffer.byteLength };
  }
}
