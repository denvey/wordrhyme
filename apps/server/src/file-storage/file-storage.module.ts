import { Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { DatabaseModule } from '../db/database.module';
import { env } from '../config/env';
import { SettingsModule } from '../settings/settings.module';
import { AuditModule } from '../audit/audit.module';
import { FILE_STORAGE_REDIS } from './file-storage.constants';
import { StorageProviderRegistry } from './storage-provider.registry';
import { StorageProviderFactory } from './storage-provider.factory';
import { MultipartUploadService } from './multipart-upload.service';
import { FileController } from './file.controller';
import { MediaService } from '../media/media.service';

@Injectable()
class FileStorageRedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(FILE_STORAGE_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

@Module({
  imports: [DatabaseModule, SettingsModule, AuditModule],
  controllers: [FileController],
  providers: [
    {
      provide: FILE_STORAGE_REDIS,
      useFactory: () => new Redis(env.REDIS_URL || 'redis://localhost:6379'),
    },
    FileStorageRedisLifecycle,
    StorageProviderRegistry,
    StorageProviderFactory,
    MultipartUploadService,
    MediaService,
  ],
  exports: [
    StorageProviderRegistry,
    StorageProviderFactory,
    MultipartUploadService,
    MediaService,
  ],
})
export class FileStorageModule {}
