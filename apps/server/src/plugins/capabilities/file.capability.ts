/**
 * File Capability - Scoped file operations for plugins
 *
 * Provides plugins with controlled access to file upload/download.
 * All operations are automatically scoped to:
 * - Current tenant (organizationId)
 * - Plugin's declared capabilities
 */
import type {
  PluginFileCapability,
  PluginFileUploadInput,
  PluginFileInfo,
  PluginFileQuery,
  PluginPaginatedResult,
} from '@wordrhyme/plugin';
import type { FileService } from '../../file-storage/file.service';

/**
 * File capability configuration
 */
export interface FileCapabilityConfig {
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Allowed MIME types (default: all) */
  allowedMimeTypes?: string[];
  /** Maximum files per request */
  maxFilesPerRequest?: number;
}

/**
 * Create file capability for a plugin
 *
 * @param pluginId - Plugin ID
 * @param organizationId - Tenant ID for scoping
 * @param fileService - Core FileService instance
 * @param config - Capability configuration
 * @returns PluginFileCapability
 */
export function createPluginFileCapability(
  pluginId: string,
  organizationId: string | undefined,
  fileService: FileService,
  config: FileCapabilityConfig = {}
): PluginFileCapability {
  const {
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    allowedMimeTypes,
    maxFilesPerRequest = 10,
  } = config;

  /**
   * Validate organization context
   */
  function requireOrganization(): string {
    if (!organizationId) {
      throw new Error('File operations require organization context');
    }
    return organizationId;
  }

  /**
   * Validate file before upload
   */
  function validateUpload(input: PluginFileUploadInput): void {
    // Check file size
    if (input.content.length > maxFileSize) {
      throw new Error(
        `File size ${input.content.length} exceeds maximum ${maxFileSize} bytes`
      );
    }

    // Check MIME type if restrictions are configured
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
   * Convert internal File to PluginFileInfo
   */
  function toPluginFileInfo(file: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    isPublic: boolean;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }): PluginFileInfo {
    return {
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      isPublic: file.isPublic,
      metadata: file.metadata,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  return {
    async upload(input: PluginFileUploadInput): Promise<PluginFileInfo> {
      const orgId = requireOrganization();

      // Validate upload
      validateUpload(input);

      // Upload via core service with plugin attribution
      const file = await fileService.upload(input.content, {
        filename: input.filename,
        contentType: input.mimeType,
        organizationId: orgId,
        uploadedBy: `plugin:${pluginId}`,
        metadata: {
          ...input.metadata,
          _sourcePlugin: pluginId,
        },
        isPublic: input.isPublic,
      });

      return toPluginFileInfo(file);
    },

    async get(fileId: string): Promise<PluginFileInfo | null> {
      const orgId = requireOrganization();

      const file = await fileService.get(fileId, orgId);
      if (!file) {
        return null;
      }

      return toPluginFileInfo(file);
    },

    async download(fileId: string): Promise<Buffer> {
      const orgId = requireOrganization();
      return fileService.download(fileId, orgId);
    },

    async getSignedUrl(
      fileId: string,
      options?: { expiresIn?: number }
    ): Promise<{ url: string; expiresIn: number }> {
      const orgId = requireOrganization();
      const expiresIn = options?.expiresIn || 3600;

      const url = await fileService.getSignedUrl(fileId, orgId, {
        expiresIn,
        operation: 'get',
      });

      return { url, expiresIn };
    },

    async delete(fileId: string): Promise<void> {
      const orgId = requireOrganization();
      await fileService.delete(fileId, orgId);
    },

    async list(
      query?: PluginFileQuery
    ): Promise<PluginPaginatedResult<PluginFileInfo>> {
      const orgId = requireOrganization();

      // Note: FileService.list would need to be implemented
      // For now, return empty result as placeholder
      // This would integrate with FileService.list() when available
      return {
        items: [],
        total: 0,
        page: query?.page || 1,
        pageSize: query?.pageSize || 20,
        totalPages: 0,
      };
    },
  };
}
