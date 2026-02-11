/**
 * Asset Capability - Scoped asset operations for plugins
 *
 * Provides plugins with controlled access to CMS asset management.
 * All operations are automatically scoped to:
 * - Current tenant (organizationId)
 * - Plugin's declared capabilities
 */
import type {
  PluginAssetCapability,
  PluginAssetCreateOptions,
  PluginAssetUpdateData,
  PluginAssetInfo,
  PluginAssetQuery,
  PluginAssetVariant,
  PluginPaginatedResult,
} from '@wordrhyme/plugin';
import type { AssetService } from '../../asset/asset.service';

/**
 * Create asset capability for a plugin
 *
 * @param pluginId - Plugin ID
 * @param organizationId - Tenant ID for scoping
 * @param assetService - Core AssetService instance
 * @param auditService - Optional audit service for logging
 * @returns PluginAssetCapability
 */
export function createPluginAssetCapability(
  pluginId: string,
  organizationId: string | undefined,
  assetService: AssetService,
  auditService?: AuditService
): PluginAssetCapability {
  /**
   * Validate organization context
   */
  function requireOrganization(): string {
    if (!organizationId) {
      throw new Error('Asset operations require organization context');
    }
    return organizationId;
  }

  /**
   * Convert internal Asset to PluginAssetInfo
   */
  function toPluginAssetInfo(asset: {
    id: string;
    fileId: string;
    type: 'image' | 'video' | 'document' | 'other';
    alt?: string | null;
    title?: string | null;
    tags: string[];
    folderPath?: string | null;
    width?: number | null;
    height?: number | null;
    format?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PluginAssetInfo {
    return {
      id: asset.id,
      fileId: asset.fileId,
      type: asset.type,
      alt: asset.alt ?? undefined,
      title: asset.title ?? undefined,
      tags: asset.tags,
      folderPath: asset.folderPath ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      format: asset.format ?? undefined,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  return {
    async create(
      fileId: string,
      options?: PluginAssetCreateOptions
    ): Promise<PluginAssetInfo> {
      const orgId = requireOrganization();

      const asset = await assetService.create(
        fileId,
        orgId,
        `plugin:${pluginId}`,
        {
          type: options?.type,
          alt: options?.alt,
          title: options?.title,
          tags: options?.tags,
          folderPath: options?.folderPath,
        }
      );

      // Audit log for plugin asset creation
      await auditService?.log({
        entityType: 'asset',
        entityId: asset.id,
        organizationId: orgId,
        action: 'plugin_create',
        metadata: {
          pluginId,
          fileId,
        },
      });

      return toPluginAssetInfo(asset);
    },

    async get(assetId: string): Promise<PluginAssetInfo | null> {
      const orgId = requireOrganization();

      const asset = await assetService.get(assetId, orgId);
      if (!asset) {
        return null;
      }

      return toPluginAssetInfo(asset);
    },

    async update(
      assetId: string,
      data: PluginAssetUpdateData
    ): Promise<PluginAssetInfo> {
      const orgId = requireOrganization();

      const asset = await assetService.update(assetId, orgId, {
        alt: data.alt,
        title: data.title,
        tags: data.tags,
        folderPath: data.folderPath,
      });

      // Audit log for plugin asset update
      await auditService?.log({
        entityType: 'asset',
        entityId: assetId,
        organizationId: orgId,
        action: 'plugin_update',
        metadata: {
          pluginId,
          changes: data,
        },
      });

      return toPluginAssetInfo(asset);
    },

    async delete(assetId: string): Promise<void> {
      const orgId = requireOrganization();

      await assetService.delete(assetId, orgId);

      // Audit log for plugin asset deletion
      await auditService?.log({
        entityType: 'asset',
        entityId: assetId,
        organizationId: orgId,
        action: 'plugin_delete',
        metadata: { pluginId },
      });
    },

    async list(
      query?: PluginAssetQuery
    ): Promise<PluginPaginatedResult<PluginAssetInfo>> {
      const orgId = requireOrganization();

      const result = await assetService.list(orgId, {
        type: query?.type,
        tags: query?.tags,
        folderPath: query?.folderPath,
        search: query?.search,
        sortBy: query?.sortBy,
        sortOrder: query?.sortOrder,
        page: query?.page,
        pageSize: query?.pageSize,
      });

      return {
        items: result.items.map(toPluginAssetInfo),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      };
    },

    async getVariantUrl(assetId: string, variant: string): Promise<string> {
      const orgId = requireOrganization();
      return assetService.getVariantUrl(assetId, orgId, variant);
    },

    async getVariants(assetId: string): Promise<PluginAssetVariant[]> {
      const orgId = requireOrganization();

      const variants = await assetService.getVariants(assetId, orgId);

      return variants.map((v) => ({
        name: v.name,
        fileId: v.fileId,
        width: v.width,
        height: v.height,
        format: v.format,
      }));
    },
  };
}

/**
 * Audit service interface (minimal for capability use)
 */
interface AuditService {
  log: (event: {
    entityType: string;
    entityId: string;
    organizationId: string;
    action: string;
    changes?: unknown;
    metadata?: unknown;
  }) => Promise<void>;
}
