/**
 * Media Capability - Unified media operations for plugins
 *
 * Replaces file.capability + asset.capability with a single unified API.
 * All operations are automatically scoped to:
 * - Current tenant (organizationId)
 * - Plugin's declared capabilities
 */
import type {
  PluginMediaCapability,
  PluginMediaUploadInput,
  PluginMediaInfo,
  PluginMediaUpdateData,
  PluginMediaQuery,
  PluginMediaVariant,
  PluginPaginatedResult,
} from '@wordrhyme/plugin';
import type { MediaService } from '../../media/media.service';

/**
 * Media capability configuration
 */
export interface MediaCapabilityConfig {
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Allowed MIME types (default: all) */
  allowedMimeTypes?: string[];
  /** Maximum files per request */
  maxFilesPerRequest?: number;
}

/**
 * Create media capability for a plugin
 *
 * @param pluginId - Plugin ID
 * @param organizationId - Tenant ID for scoping
 * @param mediaService - Core MediaService instance
 * @param config - Capability configuration
 * @returns PluginMediaCapability
 */
export function createPluginMediaCapability(
  pluginId: string,
  organizationId: string | undefined,
  mediaService: MediaService,
  config: MediaCapabilityConfig = {}
): PluginMediaCapability {
  const {
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    allowedMimeTypes,
  } = config;

  /**
   * Validate organization context
   */
  function requireOrganization(): string {
    if (!organizationId) {
      throw new Error('Media operations require organization context');
    }
    return organizationId;
  }

  /**
   * Validate file before upload
   */
  function validateUpload(input: PluginMediaUploadInput): void {
    if (input.content.length > maxFileSize) {
      throw new Error(
        `File size ${input.content.length} exceeds maximum ${maxFileSize} bytes`
      );
    }

    if (allowedMimeTypes && allowedMimeTypes.length > 0) {
      const isAllowed = allowedMimeTypes.some((pattern) => {
        if (pattern.endsWith('/*')) {
          const category = pattern.slice(0, -2);
          return input.mimeType.startsWith(category + '/');
        }
        return input.mimeType === pattern;
      });

      if (!isAllowed) {
        throw new Error(
          `File type ${input.mimeType} is not allowed for this plugin`
        );
      }
    }
  }

  /**
   * Convert internal Media to PluginMediaInfo
   */
  function toPluginMediaInfo(m: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    isPublic: boolean;
    alt?: string | null;
    title?: string | null;
    tags?: string[] | null;
    folderPath?: string | null;
    width?: number | null;
    height?: number | null;
    format?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  }): PluginMediaInfo {
    const info: PluginMediaInfo = {
      id: m.id,
      filename: m.filename,
      mimeType: m.mimeType,
      size: m.size,
      isPublic: m.isPublic,
      tags: m.tags ?? [],
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
    if (m.alt != null) info.alt = m.alt;
    if (m.title != null) info.title = m.title;
    if (m.folderPath != null) info.folderPath = m.folderPath;
    if (m.width != null) info.width = m.width;
    if (m.height != null) info.height = m.height;
    if (m.format != null) info.format = m.format;
    if (m.metadata != null) info.metadata = m.metadata;
    return info;
  }

  return {
    async upload(input: PluginMediaUploadInput): Promise<PluginMediaInfo> {
      const orgId = requireOrganization();
      validateUpload(input);

      const uploadOpts: Parameters<typeof mediaService.upload>[1] = {
        filename: input.filename,
        contentType: input.mimeType,
        organizationId: orgId,
        createdBy: `plugin:${pluginId}`,
        metadata: {
          ...input.metadata,
          _sourcePlugin: pluginId,
        },
      };
      if (input.isPublic != null) uploadOpts.isPublic = input.isPublic;
      if (input.alt != null) uploadOpts.alt = input.alt;
      if (input.title != null) uploadOpts.title = input.title;
      if (input.tags != null) uploadOpts.tags = input.tags;
      if (input.folderPath != null) uploadOpts.folderPath = input.folderPath;

      const result = await mediaService.upload(input.content, uploadOpts);

      return toPluginMediaInfo(result);
    },

    async get(mediaId: string): Promise<PluginMediaInfo | null> {
      const orgId = requireOrganization();
      const result = await mediaService.get(mediaId, orgId);
      if (!result) return null;
      return toPluginMediaInfo(result);
    },

    async update(
      mediaId: string,
      data: PluginMediaUpdateData
    ): Promise<PluginMediaInfo> {
      const orgId = requireOrganization();
      const updateData: Parameters<typeof mediaService.update>[2] = {};
      if (data.alt != null) updateData.alt = data.alt;
      if (data.title != null) updateData.title = data.title;
      if (data.tags != null) updateData.tags = data.tags;
      if (data.folderPath != null) updateData.folderPath = data.folderPath;
      const result = await mediaService.update(mediaId, orgId, updateData);
      return toPluginMediaInfo(result);
    },

    async download(mediaId: string): Promise<Buffer> {
      const orgId = requireOrganization();
      return mediaService.download(mediaId, orgId);
    },

    async getSignedUrl(
      mediaId: string,
      options?: { expiresIn?: number }
    ): Promise<{ url: string; expiresIn: number }> {
      const orgId = requireOrganization();
      const expiresIn = options?.expiresIn || 3600;
      const url = await mediaService.getSignedUrl(mediaId, orgId, {
        expiresIn,
        operation: 'get',
      });
      return { url, expiresIn };
    },

    async delete(mediaId: string): Promise<void> {
      const orgId = requireOrganization();
      await mediaService.delete(mediaId, orgId);
    },

    async list(
      query?: PluginMediaQuery
    ): Promise<PluginPaginatedResult<PluginMediaInfo>> {
      const orgId = requireOrganization();
      const listOpts: Parameters<typeof mediaService.list>[1] = {};
      if (query?.mimeType != null) listOpts.mimeType = query.mimeType;
      if (query?.tags != null) listOpts.tags = query.tags;
      if (query?.folderPath != null) listOpts.folderPath = query.folderPath;
      if (query?.search != null) listOpts.search = query.search;
      if (query?.sortBy != null) listOpts.sortBy = query.sortBy;
      if (query?.sortOrder != null) listOpts.sortOrder = query.sortOrder;
      if (query?.page != null) listOpts.page = query.page;
      if (query?.pageSize != null) listOpts.pageSize = query.pageSize;
      const result = await mediaService.list(orgId, listOpts);

      return {
        items: result.items.map(toPluginMediaInfo),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      };
    },

    async getVariantUrl(mediaId: string, variant: string): Promise<string> {
      const orgId = requireOrganization();
      return mediaService.getVariantUrl(mediaId, orgId, variant);
    },

    async getVariants(mediaId: string): Promise<PluginMediaVariant[]> {
      const orgId = requireOrganization();
      const variants = await mediaService.getVariants(mediaId, orgId);
      return variants.map((v) => ({
        name: v.variantName ?? 'original',
        mediaId: v.id,
        width: v.width ?? undefined,
        height: v.height ?? undefined,
        format: v.format ?? undefined,
      }));
    },
  };
}
