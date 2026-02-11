/**
 * Search Service Unit Tests
 *
 * Tests for the search service facade and provider integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the provider registry
const mockGetActiveProvider = vi.fn();
const mockShutdownAll = vi.fn();
const mockList = vi.fn();
const mockGetMetadata = vi.fn();

vi.mock('../../search/providers/provider.registry', () => ({
  SearchProviderRegistry: class MockRegistry {
    getActiveProvider = mockGetActiveProvider;
    shutdownAll = mockShutdownAll;
    list = mockList;
    getMetadata = mockGetMetadata;
  },
}));

// Import after mocking
import { SearchService } from '../../search/search.service';
import { SearchProviderRegistry } from '../../search/providers/provider.registry';
import type { SearchProvider, SearchQuery, SearchResult } from '../../search/providers/provider.interface';

describe('SearchService', () => {
  let service: SearchService;
  let mockProvider: SearchProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      metadata: {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        capabilities: ['full-text'],
        pluginId: 'test',
      },
      indexDocument: vi.fn().mockResolvedValue(undefined),
      bulkIndex: vi.fn().mockResolvedValue(undefined),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({ hits: [], total: 0, took: 1 }),
      healthCheck: vi.fn().mockResolvedValue({ status: 'ok' }),
    };

    mockGetActiveProvider.mockResolvedValue(mockProvider);
    mockShutdownAll.mockResolvedValue(undefined);
    mockList.mockReturnValue([mockProvider.metadata]);
    mockGetMetadata.mockReturnValue(mockProvider.metadata);

    const registry = new SearchProviderRegistry() as any;
    service = new SearchService(registry);
  });

  describe('indexDocument()', () => {
    it('should delegate to active provider', async () => {
      await service.indexDocument(
        'products',
        'prod-123',
        { name: 'Test Product', price: 99 },
        'org-1'
      );

      expect(mockGetActiveProvider).toHaveBeenCalledWith('org-1');
      expect(mockProvider.indexDocument).toHaveBeenCalledWith(
        'products',
        'prod-123',
        { name: 'Test Product', price: 99 },
        'org-1'
      );
    });

    it('should use tenant-specific provider', async () => {
      await service.indexDocument('items', 'item-1', {}, 'tenant-a');
      expect(mockGetActiveProvider).toHaveBeenCalledWith('tenant-a');

      await service.indexDocument('items', 'item-2', {}, 'tenant-b');
      expect(mockGetActiveProvider).toHaveBeenCalledWith('tenant-b');
    });
  });

  describe('bulkIndex()', () => {
    it('should delegate bulk operations to provider', async () => {
      const docs = [
        { id: 'doc-1', doc: { title: 'First' } },
        { id: 'doc-2', doc: { title: 'Second' } },
      ];

      await service.bulkIndex('articles', docs, 'org-1');

      expect(mockProvider.bulkIndex).toHaveBeenCalledWith('articles', docs, 'org-1');
    });
  });

  describe('deleteDocument()', () => {
    it('should delegate delete to provider', async () => {
      await service.deleteDocument('products', 'prod-123', 'org-1');

      expect(mockProvider.deleteDocument).toHaveBeenCalledWith(
        'products',
        'prod-123',
        'org-1'
      );
    });
  });

  describe('search()', () => {
    it('should delegate search to provider', async () => {
      const expectedResult: SearchResult = {
        hits: [
          { id: 'doc-1', score: 0.95, source: { title: 'Match' } },
        ],
        total: 1,
        took: 5,
      };

      (mockProvider.search as any).mockResolvedValue(expectedResult);

      const query: SearchQuery = {
        term: 'test',
        organizationId: 'org-1',
        pagination: { limit: 10, offset: 0 },
      };

      const result = await service.search('products', query);

      expect(result).toEqual(expectedResult);
      expect(mockProvider.search).toHaveBeenCalledWith('products', query);
    });

    it('should pass filters to provider', async () => {
      const query: SearchQuery = {
        term: 'laptop',
        organizationId: 'org-1',
        filters: { category: 'electronics', inStock: true },
      };

      await service.search('products', query);

      expect(mockProvider.search).toHaveBeenCalledWith('products', query);
    });

    it('should pass sort options to provider', async () => {
      const query: SearchQuery = {
        term: '',
        organizationId: 'org-1',
        sort: [{ field: 'createdAt', direction: 'desc' }],
      };

      await service.search('products', query);

      expect(mockProvider.search).toHaveBeenCalledWith('products', query);
    });
  });

  describe('listProviders()', () => {
    it('should return list of registered providers', () => {
      const providers = service.listProviders();

      expect(providers).toEqual([mockProvider.metadata]);
      expect(mockList).toHaveBeenCalled();
    });
  });

  describe('getProviderMetadata()', () => {
    it('should return metadata for specific provider', () => {
      const metadata = service.getProviderMetadata('test-provider');

      expect(metadata).toEqual(mockProvider.metadata);
      expect(mockGetMetadata).toHaveBeenCalledWith('test-provider');
    });

    it('should return null for unknown provider', () => {
      mockGetMetadata.mockReturnValue(null);

      const metadata = service.getProviderMetadata('unknown');

      expect(metadata).toBeNull();
    });
  });

  describe('healthCheck()', () => {
    it('should return ok for healthy provider', async () => {
      const result = await service.healthCheck('org-1');

      expect(result).toEqual({ status: 'ok' });
    });

    it('should return ok for provider without healthCheck method', async () => {
      delete (mockProvider as any).healthCheck;

      const result = await service.healthCheck('org-1');

      expect(result).toEqual({ status: 'ok' });
    });

    it('should return error on provider failure', async () => {
      mockGetActiveProvider.mockRejectedValue(new Error('Provider unavailable'));

      const result = await service.healthCheck('org-1');

      expect(result.status).toBe('error');
      expect(result.details).toBeDefined();
    });
  });

  describe('onModuleDestroy()', () => {
    it('should shutdown all providers', async () => {
      await service.onModuleDestroy();

      expect(mockShutdownAll).toHaveBeenCalled();
    });
  });
});
