import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { AuditModule } from '../audit/audit.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { AssetService } from './asset.service';
import { ImageProcessorService } from './image-processor.service';

@Module({
  imports: [DatabaseModule, AuditModule, FileStorageModule],
  providers: [AssetService, ImageProcessorService],
  exports: [AssetService, ImageProcessorService],
})
export class AssetModule {}
