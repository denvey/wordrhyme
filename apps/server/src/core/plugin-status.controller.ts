import { Controller, Get, Inject } from '@nestjs/common';
import { PluginManager, type PluginStatus } from '../plugins/plugin-manager';

interface PluginStatusResponse {
    total: number;
    enabled: number;
    disabled: number;
    plugins: {
        id: string;
        name: string;
        version: string;
        status: 'enabled' | 'disabled' | 'error';
    }[];
}

function toResponseStatus(status: PluginStatus): 'enabled' | 'disabled' | 'error' {
    if (status === 'enabled' || status === 'disabled') {
        return status;
    }

    return 'error';
}

@Controller('plugins/status')
export class PluginStatusController {
    constructor(
        @Inject(PluginManager)
        private readonly pluginManager: PluginManager,
    ) { }

    @Get()
    getStatus(): PluginStatusResponse {
        const plugins = this.pluginManager.getLoadedPlugins();
        const enabledCount = plugins.filter(p => p.status === 'enabled').length;

        return {
            total: plugins.length,
            enabled: enabledCount,
            disabled: plugins.length - enabledCount,
            plugins: plugins.map(p => ({
                id: p.manifest.pluginId,
                name: p.manifest.name,
                version: p.manifest.version,
                status: toResponseStatus(p.status),
            })),
        };
    }
}
