import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PluginStatusController } from './plugin-status.controller';
import { PluginModule } from '../plugins/plugin.module';

@Module({
    imports: [PluginModule],
    controllers: [HealthController, PluginStatusController],
})
export class CoreRoutesModule { }
