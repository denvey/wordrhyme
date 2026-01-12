import { Module, Global } from '@nestjs/common';
import { QueueService } from './queue.service.js';

@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
