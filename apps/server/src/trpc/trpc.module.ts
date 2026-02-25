import { Module, OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { FastifyInstance } from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { getAppRouter } from "./router";
import { createContext, setPluginContextServices } from "./context";
import {
  SettingsModule,
  SettingsService,
  FeatureFlagService,
} from "../settings";
import { CacheModule } from "../cache/cache.module";
import { CacheManager } from "../cache/cache-manager";
import { SchedulerModule } from "../scheduler/scheduler.module";
import { SchedulerService } from "../scheduler/scheduler.service";
import { FileStorageModule } from "../file-storage/file-storage.module";
import { StorageProviderRegistry } from "../file-storage/storage-provider.registry";
import { MediaService } from "../media/media.service";
import { MultipartUploadService } from "../file-storage/multipart-upload.service";
import { SchedulerProviderRegistry } from "../scheduler/providers/provider.registry";
import { HookRegistry } from "../hooks/hook-registry";
import { setSettingsService } from "./routers/settings";
import { setFeatureFlagService } from "./routers/feature-flags";
import { setCacheManager } from "./routers/cache";
import {
  setSchedulerService,
  setSchedulerProviderRegistry,
} from "./routers/scheduler";
import { setHookRegistry } from "./routers/hooks";
import { setOAuthSettingsService } from "./routers/oauth-settings";
import {
  setSettingsService as setStorageSettingsService,
  setProviderRegistry,
} from "./routers/storage";
import { setInfraPolicyServices } from "./routers/infra-policy";
import {
  setMediaService,
  setMultipartService,
} from "./routers/media";
import { PluginModule } from "../plugins/plugin.module";
import { PluginManager } from "../plugins/plugin-manager";

/**
 * tRPC Module
 *
 * Registers tRPC router with Fastify.
 */
@Module({
  imports: [SettingsModule, CacheModule, SchedulerModule, PluginModule, FileStorageModule],
})
export class TrpcModule implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly settingsService: SettingsService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly cacheManager: CacheManager,
    private readonly schedulerService: SchedulerService,
    private readonly schedulerProviderRegistry: SchedulerProviderRegistry,
    private readonly hookRegistry: HookRegistry,
    private readonly pluginManager: PluginManager,
    private readonly storageProviderRegistry: StorageProviderRegistry,
    private readonly mediaService: MediaService,
    private readonly multipartUploadService: MultipartUploadService,
  ) {}

  async onModuleInit() {
    // Inject NestJS services into tRPC routers
    setSettingsService(this.settingsService);
    setFeatureFlagService(this.featureFlagService);
    setCacheManager(this.cacheManager);
    setSchedulerService(this.schedulerService);
    setSchedulerProviderRegistry(this.schedulerProviderRegistry);
    setHookRegistry(this.hookRegistry);
    setOAuthSettingsService(this.settingsService);
    setStorageSettingsService(this.settingsService);
    setProviderRegistry(this.storageProviderRegistry);
    setInfraPolicyServices(
      this.settingsService,
      (pluginId) => this.pluginManager.getPlugin(pluginId)?.manifest,
    );
    setMediaService(this.mediaService);
    setMultipartService(this.multipartUploadService);

    // Inject services needed for plugin API context
    setPluginContextServices({
      settingsService: this.settingsService,
      featureFlagService: this.featureFlagService,
      getPluginManifest: (pluginId) =>
        this.pluginManager.getPlugin(pluginId)?.manifest,
    });

    const fastify =
      this.httpAdapterHost.httpAdapter.getInstance() as FastifyInstance;

    await fastify.register(fastifyTRPCPlugin, {
      prefix: "/trpc",
      trpcOptions: {
        router: getAppRouter(),
        createContext,
        onError: ({ error, path }: { error: Error; path: string | undefined }) => {
          console.error(`[tRPC] Error in ${path}: ${error.message}`);
          if (error.cause) {
            console.error(
              `[tRPC]   cause: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`,
            );
          }
        },
      },
    });

    console.log("[tRPC] Router registered at /trpc");
  }
}
