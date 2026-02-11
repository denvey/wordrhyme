/**
 * Storage Module
 *
 * Provides file storage services with support for multiple backends.
 */

import { Module, Global } from '@nestjs/common';
import { LocalStorageProvider } from './providers/local-storage.provider.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    LocalStorageProvider,
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
