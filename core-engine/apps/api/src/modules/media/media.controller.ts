import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import {
  MEDIA_REPOSITORY,
  OBJECT_STORAGE,
  MAX_UPLOAD_BYTES,
  MediaNotFoundError,
  MediaObjectMissingError,
  MediaTooLargeError,
  UnsupportedMediaTypeError,
  buildObjectKey,
  isAllowedContentType,
  type Media,
  type MediaRepository,
  type ObjectStorage,
} from '@core/media';
import { asMediaId, newId, type MediaId } from '@core/shared';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CurrentAuthor } from '../../common/decorators/current-principal.decorator';
import type { AuthorPrincipal } from '../../common/principal';
import {
  ListMediaQuery,
  MediaDto,
  MediaListDto,
  PresignUploadDto,
  PresignUploadResponseDto,
} from './dto/media.dto';

/**
 * ADMIN surface, behind the Kratos session.
 *
 * WAS guarded by TenantContextGuard (Kong's tenant API key) as interim
 * scaffolding while Kratos and Oathkeeper did not exist. That broke the moment
 * /admin/v1 moved behind Oathkeeper: Kong's key-auth plugin is what set
 * X-Consumer-Custom-ID, and removing it from the admin service left every route
 * here returning "Missing tenant credential".
 *
 * The lesson worth keeping — a controller's auth is coupled to the GATEWAY
 * config, not just to its own decorators. Changing which plugin fronts a route
 * can silently un-authenticate a controller nobody edited.
 *
 * `@CurrentAuthor()` rather than `@CurrentPrincipal()`: media is tenant-owned,
 * so a platform admin (who has no tenant) genuinely cannot act here and gets a
 * 403 instead of a crash.
 */
@ApiTags('admin/media')
@Controller('admin/v1/media')
@UseGuards(PrincipalGuard, PermissionGuard)
export class MediaController {
  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly repo: MediaRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * Step 1 of 3. Returns a short-lived URL the BROWSER uses to PUT the file
   * straight to MinIO.
   *
   * Uploads must never be proxied through the API or a frontend server route:
   * managed hosts cap request bodies around 4.5 MB and cover images routinely
   * exceed that. See docs/media-and-uploads.md.
   */
  @Post('presign')
  @RequirePermission('media.upload')
  @ApiOperation({ summary: 'Get a presigned URL for a direct browser upload' })
  @ApiOkResponse({ type: PresignUploadResponseDto })
  async presign(
    @CurrentAuthor() author: AuthorPrincipal,
    @Body() dto: PresignUploadDto,
  ): Promise<PresignUploadResponseDto> {
    if (!isAllowedContentType(dto.contentType)) {
      throw new UnsupportedMediaTypeError(dto.contentType);
    }

    const mediaId = newId<MediaId>();
    const objectKey = buildObjectKey(author.tenantId, mediaId, dto.contentType, new Date());

    const presigned = await this.storage.presignUpload(objectKey, dto.contentType);

    return {
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      mediaId,
      objectKey: presigned.objectKey,
      expiresInSeconds: presigned.expiresInSeconds,
    };
  }

  /**
   * Step 3 of 3, after the browser's PUT succeeds.
   *
   * The row is created HERE, not at presign time: an abandoned upload would
   * otherwise leave a row pointing at nothing, and og:image would break on a
   * live article.
   */
  @Post(':mediaId/confirm')
  @RequirePermission('media.upload')
  @ApiOperation({ summary: 'Confirm an upload; the worker sweep derives variants' })
  @ApiOkResponse({ type: MediaDto })
  async confirm(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() body: { objectKey: string; filename?: string },
  ): Promise<MediaDto> {
    const head = await this.storage.head(body.objectKey);
    if (!head) throw new MediaObjectMissingError(body.objectKey);

    // Everything the client told us at presign was a hint. THIS is the
    // enforcement point, checked against the bytes actually stored: the
    // browser PUTs straight to MinIO, so nothing before now saw the real file.
    if (!isAllowedContentType(head.contentType)) {
      throw new UnsupportedMediaTypeError(head.contentType);
    }
    if (head.size > MAX_UPLOAD_BYTES) {
      // Reject the row AND drop the object — otherwise an oversized upload
      // squats in the bucket with nothing referencing it.
      await this.storage.remove(body.objectKey);
      throw new MediaTooLargeError(head.size);
    }

    const id = asMediaId(mediaId);
    const item: Media = {
      id,
      tenantId: author.tenantId,
      url: this.storage.publicUrl(body.objectKey),
      objectKey: body.objectKey,
      type: head.contentType,
      size: head.size,
      originalFilename: body.filename ?? null,
      width: null,
      height: null,
      status: 'pending',
      variants: {},
    };

    // The row lands as `pending`; the worker's sweep picks it up. No queue —
    // the media table IS the work list, so Postgres stays the only source of
    // truth and nothing can be lost by a Redis restart.
    await this.repo.create(author.tenantId, item);

    return toDto(item);
  }

  @Get()
  @RequirePermission('media.read')
  @ApiOperation({ summary: 'List the tenant media library' })
  @ApiOkResponse({ type: MediaListDto })
  async list(
    @CurrentAuthor() author: AuthorPrincipal,
    @Query() query: ListMediaQuery,
  ): Promise<MediaListDto> {
    const { data, total } = await this.repo.list(
      author.tenantId,
      query.perPage,
      (query.page - 1) * query.perPage,
    );

    return {
      data: data.map(toDto),
      meta: { page: query.page, perPage: query.perPage, total },
    };
  }

  @Get(':mediaId')
  @RequirePermission('media.read')
  @ApiOperation({ summary: 'Fetch one media item (poll this for processing status)' })
  @ApiOkResponse({ type: MediaDto })
  async byId(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<MediaDto> {
    const item = await this.repo.findById(author.tenantId, asMediaId(mediaId));
    if (!item) throw new MediaNotFoundError(mediaId);
    return toDto(item);
  }

  @Delete(':mediaId')
  @RequirePermission('media.delete')
  @ApiOperation({ summary: 'Soft-delete a media item (the object is retained)' })
  async remove(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<{ deleted: true }> {
    const item = await this.repo.findById(author.tenantId, asMediaId(mediaId));
    if (!item) throw new MediaNotFoundError(mediaId);

    await this.repo.softDelete(author.tenantId, asMediaId(mediaId));
    return { deleted: true };
  }
}

function toDto(item: Media): MediaDto {
  return {
    id: item.id,
    url: item.url,
    type: item.type,
    size: item.size,
    width: item.width,
    height: item.height,
    status: item.status,
    variants: Object.fromEntries(
      Object.entries(item.variants).map(([name, v]) => [
        name,
        { url: v.url, width: v.width, height: v.height, size: v.size },
      ]),
    ),
  };
}
