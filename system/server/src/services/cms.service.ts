import {
  findRedirect,
  getRandStr,
  resolvePageRoute,
  setStoreItem,
  sleep,
  TCCSVersion,
  TCmsDashboardLayout,
  TDefaultPageName,
  TPackageCromwellConfig,
} from '@cromwell/core';
import {
  BasePageEntity,
  cmsPackageName,
  DashboardEntity,
  DashboardLayout,
  getCmsConfig,
  getCmsEntity,
  getCmsInfo,
  getCmsModuleInfo,
  getCmsSettings,
  getLogger,
  getModulePackage,
  getNodeModuleDir,
  getPublicDir,
  getServerDir,
  getThemeConfigs,
  PostRepository,
  ProductCategoryRepository,
  ProductRepository,
  readCmsModules,
  RoleRepository,
  runShellCommand,
  TagRepository,
  User,
} from '@cromwell/core-backend';
import { getCentralServerClient } from '@cromwell/core-frontend';
import { HttpException, HttpStatus } from '@nestjs/common';
import archiver from 'archiver';
import { format } from 'date-fns';
import { FastifyReply, FastifyRequest } from 'fastify';
import multer from 'fastify-multer';
import fs from 'fs-extra';
import { join, resolve } from 'path';
import { Service } from 'typedi';
import { getConnection, getCustomRepository, Repository } from 'typeorm';
import mime from 'mime-types';

import { AdminCmsSettingsDto } from '../dto/admin-cms-settings.dto';
import { CmsStatusDto } from '../dto/cms-status.dto';
import { DashboardSettingsDto } from '../dto/dashboard-settings.dto';
import { SetupFirstStepDto, SetupSecondStepDto } from '../dto/setup.dto';
import { multerPublicStorage } from '../helpers/constants';
import { resetAllPagesCache } from '../helpers/reset-page';
import { serverFireAction } from '../helpers/server-fire-action';
import { childSendMessage } from '../helpers/server-manager';
import {
  endTransaction,
  restartService,
  setPendingKill,
  setPendingRestart,
  startTransaction,
} from '../helpers/state-manager';
import { getDIService } from '../helpers/utils';
import { AuthService } from './auth.service';
import { MockService } from './mock.service';
import { PluginService } from './plugin.service';
import { ThemeService } from './theme.service';
import { resizeImage } from '../helpers/resize-image-client';

const logger = getLogger();

@Service()
export class CmsService {
  private themeService = getDIService(ThemeService);
  private pluginService = getDIService(PluginService);
  private mockService = getDIService(MockService);
  private authService = getDIService(AuthService);

  private isRunningNpm = false;
  private checkedYarn = false;

  constructor() {
    this.init();
  }

  private async init() {
    await sleep(1);
    if (!getConnection()?.isConnected) return;

    // Schedule sitemap re-build once in a day
    setInterval(() => this.buildSitemap, 1000 * 60 * 60 * 24);
  }

  public async getIsRunningNpm() {
    return this.isRunningNpm;
  }

  public async setIsRunningNpm(isRunning) {
    this.isRunningNpm = isRunning;
  }

  public async checkYarn() {
    if (this.checkedYarn) return;
    this.checkedYarn = true;
    try {
      await runShellCommand(`npm i -g yarn`);
    } catch (error) {
      logger.error(error);
    }
  }

  public async setThemeName(themeName: string) {
    const entity = await getCmsEntity();
    if (entity) {
      entity.publicSettings = {
        ...(entity.publicSettings ?? {}),
        themeName,
      };
      await entity.save();
      return true;
    }
    return false;
  }

  async uploadFile(req: FastifyRequest, reply: FastifyReply): Promise<{ success: boolean; error?: string }> {
    const uploadHandler = (req: FastifyRequest, reply: FastifyReply, done: (err?: any) => void) => {
      (multer({ storage: multerPublicStorage }).array('files') as any)(req, reply, done);
    };

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      uploadHandler(req, reply, (err) => {
        if (err instanceof multer.MulterError) {
          // A Multer error occurred when uploading.
          logger.error('Failed to upload files', err);
          resolve({ success: false, error: err + '' });
          return;
        } else if (err) {
          // An unknown error occurred when uploading.
          logger.error('Failed to upload files', err);
          resolve({ success: false, error: err + '' });
          return;
        }

        // Everything went fine.
        resolve({ success: true });
        return;
      });
    });
  }

  async downloadFile(response: FastifyReply, inPath: string, fileName: string) {
    const fullPath = join(getPublicDir(), inPath ?? '', fileName);

    if (!(await fs.pathExists(fullPath))) {
      response.code(404).send({ message: 'File not found' });
      return;
    }

    if ((await fs.stat(fullPath)).isFile()) {
      response.header('Content-Disposition', `attachment; filename=${fileName}`);
      const mimeType = mime.lookup(fullPath);
      if (mimeType) response.type(mimeType);

      try {
        const readStream = fs.createReadStream(fullPath);
        response.send(readStream);
      } catch (error) {
        logger.error(error);
        response.code(500).send({ message: error + '' });
      }
    } else {
      response.header('Content-Disposition', `attachment; filename=${fileName}.zip`);
      response.type('application/zip');

      // zip the directory
      const archive = archiver('zip', {
        zlib: { level: 9 },
      });
      archive.directory(fullPath, '/' + fileName);
      response.send(archive);
      await archive.finalize();
    }
  }

  public async parseModuleConfigImages(moduleInfo: TPackageCromwellConfig, moduleName: string) {
    if (!moduleInfo) return;

    if (moduleInfo.icon) {
      const moduleDir = await getNodeModuleDir(moduleName);
      // Read icon and convert to base64
      if (moduleDir) {
        const imgPath = resolve(moduleDir, moduleInfo?.icon);
        if (await fs.pathExists(imgPath)) {
          const data = (await fs.readFile(imgPath))?.toString('base64');
          if (data) moduleInfo.icon = data;
        }
      }
    }

    if (!moduleInfo.images) moduleInfo.images = [];

    if (moduleInfo.image) {
      // Read image and convert to base64
      const moduleDir = await getNodeModuleDir(moduleName);
      if (moduleDir) {
        const imgPath = resolve(moduleDir, moduleInfo.image);
        if (await fs.pathExists(imgPath)) {
          const data = (await fs.readFile(imgPath))?.toString('base64');
          if (data) moduleInfo.image = data;
        }
      }

      if (!moduleInfo.images.includes(moduleInfo.image)) moduleInfo.images.push(moduleInfo.image);
    }
  }

  public async setupCmsFirstStep(input: SetupFirstStepDto): Promise<User> {
    const config = await getCmsSettings();
    if (!config) {
      throw new HttpException('Failed to read CMS Config', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (config.installed) throw new HttpException('CMS is already installed', HttpStatus.BAD_REQUEST);

    if (!input.user) throw new HttpException('User info is not provided', HttpStatus.BAD_REQUEST);

    const roles = await getCustomRepository(RoleRepository).getAll();
    if (!roles?.length) {
      await this.mockService.mockRoles();
    }

    const adminRole = (await getCustomRepository(RoleRepository).getAll()).find((r) => r.permissions?.includes('all'));
    if (!adminRole?.name) throw new HttpException('No administrator role found in DB', HttpStatus.BAD_REQUEST);

    input.user.roles = [adminRole.name];

    return await this.authService.createUser(input.user);
  }

  public async setupCmsSecondStep(input: SetupSecondStepDto) {
    const config = await getCmsSettings();
    if (!config) {
      throw new HttpException('Failed to read CMS Config', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (config.installed) throw new HttpException('CMS is already installed', HttpStatus.BAD_REQUEST);

    if (!input.url) throw new HttpException('URL is not provided', HttpStatus.BAD_REQUEST);

    const settings = await getCmsSettings();

    await this.mockService.mockRoles();

    try {
      await this.mockService.mockUsers();

      if (input.modules?.blog ?? settings?.modules?.blog) {
        await this.mockService.mockTags();
        await this.mockService.mockPosts();
      }
      if (input.modules?.ecommerce ?? settings?.modules?.ecommerce) {
        await this.mockService.mockAttributes();
        await this.mockService.mockCategories();
        await this.mockService.mockProducts();
        await this.mockService.mockReviews();
        await this.mockService.mockOrders();
      }
    } catch (error) {
      logger.error(error);
    }

    const cmsEntity = await getCmsEntity();

    cmsEntity.internalSettings = {
      ...(cmsEntity.internalSettings ?? {}),
      installed: true,
    };

    cmsEntity.publicSettings = {
      ...(cmsEntity.publicSettings ?? {}),
      url: input.url,
      modules: input.modules,
    };
    await cmsEntity.save();
    await getCmsSettings();

    const serverDir = getServerDir();
    const publicDir = getPublicDir();
    if (!serverDir || !publicDir) return false;

    const robotsSource = resolve(serverDir, 'static/robots.txt');
    let robotsContent = await (await fs.readFile(robotsSource)).toString();
    robotsContent += `\n\nSitemap: ${input.url}/default_sitemap.xml`;
    await fs.outputFile(resolve(publicDir, 'robots.txt'), robotsContent, {
      encoding: 'UTF-8',
    });

    resetAllPagesCache();

    if (!input.modules?.blog || !input.modules?.ecommerce) {
      const transactionId = getRandStr(8);
      startTransaction(transactionId);
      setPendingRestart(2000);
      endTransaction(transactionId);
    }
    return true;
  }

  public async buildSitemap() {
    const settings = await getCmsSettings();
    if (!settings?.url) throw new HttpException("Could not find website's URL", HttpStatus.INTERNAL_SERVER_ERROR);
    if (!settings.themeName)
      throw new HttpException("Could not find website's themeName", HttpStatus.INTERNAL_SERVER_ERROR);
    const configs = await getThemeConfigs(settings.themeName);
    setStoreItem('defaultPages', configs.themeConfig?.defaultPages);

    const urls: string[] = [];
    let content = '';

    const addPage = (route: string, updDate: Date) => {
      if (!route.startsWith('/')) route = '/' + route;
      const redirect = findRedirect(route);
      if (redirect?.type === 'redirect' && redirect.to) {
        route = redirect.to;
      }

      if (redirect?.type === 'rewrite' && redirect.from === '/404') return;

      if (!route.startsWith('http')) {
        route = settings.url + route;
      }

      if (urls.includes(route)) return;
      urls.push(route);

      content += `  <url>
    <loc>${route}</loc>
    <lastmod>${format(updDate, 'yyyy-MM-dd')}</lastmod>
  </url>\n`;
    };

    configs.themeConfig?.pages?.forEach((page) => {
      if (
        !page.route ||
        page.route.includes('[slug]') ||
        page.route.includes('[id]') ||
        page.route === 'index' ||
        page.route === '404'
      )
        return;

      addPage(page.route, new Date(Date.now()));
    });

    const outputEntity = async (
      repo: Repository<any>,
      pageName: TDefaultPageName,
      conditions?: Record<string, any>,
    ) => {
      const entities: BasePageEntity[] = await repo.find({
        select: ['slug', 'id', 'updateDate', 'createDate'],
        where: {
          isEnabled: true,
          ...(conditions ?? {}),
        },
      });

      entities.forEach((ent) => {
        const updDate = ent.updateDate ?? ent.createDate;
        addPage(resolvePageRoute(pageName, { slug: ent.slug ?? ent.id + '' }), updDate ?? new Date(Date.now()));
      });
    };

    await outputEntity(getCustomRepository(PostRepository), 'post', { published: true });
    await outputEntity(getCustomRepository(ProductRepository), 'product');
    await outputEntity(getCustomRepository(ProductCategoryRepository), 'category');
    await outputEntity(getCustomRepository(TagRepository), 'tag');

    content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${content}
</urlset>`;

    await fs.outputFile(resolve(getPublicDir(), 'default_sitemap.xml'), content, {
      encoding: 'UTF-8',
    });
    return true;
  }

  public async readPlugins(): Promise<TPackageCromwellConfig[]> {
    const out: TPackageCromwellConfig[] = [];

    const pluginModules = (await readCmsModules()).plugins;

    for (const pluginName of pluginModules) {
      const moduleInfo = await getCmsModuleInfo(pluginName);
      delete moduleInfo?.frontendDependencies;
      delete moduleInfo?.bundledDependencies;
      delete moduleInfo?.firstLoadedDependencies;

      if (moduleInfo) {
        await this.parseModuleConfigImages(moduleInfo, pluginName);
        out.push(moduleInfo);
      }
    }
    return out;
  }

  public async readThemes(): Promise<TPackageCromwellConfig[]> {
    const out: TPackageCromwellConfig[] = [];

    const themeModuleNames = (await readCmsModules()).themes;

    for (const themeName of themeModuleNames) {
      const moduleInfo = await getCmsModuleInfo(themeName);

      if (moduleInfo) {
        delete moduleInfo.frontendDependencies;
        delete moduleInfo.bundledDependencies;
        delete moduleInfo.firstLoadedDependencies;

        await this.parseModuleConfigImages(moduleInfo, themeName);
        out.push(moduleInfo);
      }
    }
    return out;
  }

  public async getAdminSettings() {
    const settings = await getCmsSettings();
    const info = await getCmsInfo();
    const dto = new AdminCmsSettingsDto().parseSettings(settings);
    dto.cmsInfo = info;
    try {
      const robotsPath = resolve(getPublicDir(), 'robots.txt');
      if (await fs.pathExists(robotsPath)) dto.robotsContent = (await fs.readFile(robotsPath)).toString();
    } catch (error) {
      logger.error(error);
    }
    return dto;
  }

  private async getFallbackDashboardLayout(): Promise<DashboardSettingsDto> {
    const repo = getCustomRepository(DashboardLayout.repository);
    const config = await getCmsConfig();

    const dashboard = await repo.findOne({
      where: {
        type: 'template',
        for: 'system',
      },
    });

    if (!dashboard) {
      return config!.defaultSettings!.dashboardSettings as DashboardSettingsDto;
    }

    return dashboard;
  }

  public async getDashboardLayout(userId: number): Promise<DashboardSettingsDto | undefined> {
    const repo = getCustomRepository(DashboardLayout.repository);
    let dashboard: DashboardSettingsDto | undefined = await repo.findOne({
      where: {
        userId,
      },
    });

    if (!dashboard) {
      dashboard = await this.getFallbackDashboardLayout();
    }

    const layout = dashboard.layout;

    return {
      type: dashboard.type,
      layout: layout,
    };
  }

  public async setDashboardLayout(
    userId: number,
    layout: TCmsDashboardLayout,
  ): Promise<DashboardSettingsDto | undefined> {
    const repo = getCustomRepository(DashboardLayout.repository);
    let existingEntity = await repo.findOne({
      where: {
        userId,
      },
    });

    if (!existingEntity) {
      existingEntity = new DashboardEntity();
      existingEntity.for = 'user';
      existingEntity.type = 'user';
    }

    existingEntity!.layout = layout;
    existingEntity.userId = userId;

    await existingEntity.save();

    return existingEntity;
  }

  public async updateCmsSettings(input: AdminCmsSettingsDto): Promise<AdminCmsSettingsDto> {
    const entity = await getCmsEntity();
    if (!entity) throw new HttpException('CMS settings not found', HttpStatus.INTERNAL_SERVER_ERROR);

    if (typeof input.currencies === 'string') {
      try {
        input.currencies = JSON.parse(input.currencies);
      } catch (error) {
        logger.error(error);
      }
    }

    entity.publicSettings = {
      url: input.url,
      defaultPageSize: input.defaultPageSize,
      currencies: input.currencies,
      timezone: input.timezone,
      language: input.language,
      favicon: input.favicon,
      logo: input.logo,
      headHtml: input.headHtml,
      footerHtml: input.footerHtml,
      defaultShippingPrice: input.defaultShippingPrice,
      disablePayLater: input.disablePayLater,
      customMeta: input.customMeta,
      themeName: input.themeName,
      modules: {
        ecommerce: !!input.modules?.ecommerce,
        blog: !!input.modules?.blog,
      },
    };

    entity.adminSettings = {
      sendFromEmail: input.sendFromEmail,
      sendMailFromName: input.sendMailFromName,
      smtpConnectionString: input.smtpConnectionString,
      customFields: input.customFields,
      customEntities: input.customEntities,
      signupEnabled: input.signupEnabled,
      signupRoles: input.signupRoles,
      revalidateCacheAfter: input.revalidateCacheAfter,
      clearCacheOnDataUpdate: input.clearCacheOnDataUpdate,
    };

    await entity.save();

    if (input.robotsContent) {
      await fs.outputFile(resolve(getPublicDir(), 'robots.txt'), input.robotsContent, {
        encoding: 'UTF-8',
      });
    }

    await serverFireAction('update_cms_settings');

    const settings = await getCmsSettings({ throttled: false });
    return new AdminCmsSettingsDto().parseSettings(settings);
  }

  async checkCmsUpdate(): Promise<TCCSVersion | undefined> {
    const settings = await getCmsSettings();
    const cmsPckg = await getModulePackage(cmsPackageName);
    const isBeta = !!settings?.beta;
    try {
      return await getCentralServerClient().checkCmsUpdate(settings?.version ?? cmsPckg?.version ?? '0', isBeta);
    } catch (error) {}
  }

  async getCmsStatus(): Promise<CmsStatusDto> {
    const status = new CmsStatusDto();
    const settings = await getCmsSettings();
    const availableUpdate = await this.checkCmsUpdate();
    status.updateAvailable = !!availableUpdate;
    status.updateInfo = availableUpdate;
    status.isUpdating = settings?.isUpdating;
    status.currentVersion = settings?.version;

    status.notifications = [];

    if (!settings?.smtpConnectionString) {
      status.notifications.push({
        type: 'warning',
        message: 'Setup SMTP settings',
        documentationLink: 'https://cromwellcms.com/docs/features/mail',
        pageLink: '/admin/settings',
      });
    }

    return status;
  }

  async handleUpdateCms() {
    const transactionId = getRandStr(8);
    startTransaction(transactionId);
    if (await this.getIsRunningNpm()) {
      throw new HttpException('Only one install/update available at the time', HttpStatus.METHOD_NOT_ALLOWED);
    }
    this.setIsRunningNpm(true);
    await this.checkYarn();

    let success = false;
    let error: any;
    try {
      success = await this.updateCms();
    } catch (err) {
      error = err;
    }

    await this.setIsRunningNpm(false);
    endTransaction(transactionId);

    if (!success) {
      logger.error(error);
      throw new HttpException(error?.message, error?.status);
    }
    return true;
  }

  async updateCms(): Promise<boolean> {
    const availableUpdate = await this.checkCmsUpdate();
    if (!availableUpdate?.packageVersion)
      throw new HttpException(`Update failed: update info is not valid`, HttpStatus.INTERNAL_SERVER_ERROR);
    if (availableUpdate.onlyManualUpdate)
      throw new HttpException(
        `Update failed: Cannot launch automatic update. Please update using npm install command and restart CMS`,
        HttpStatus.FORBIDDEN,
      );

    const pckg = await getModulePackage();
    if (!pckg?.dependencies?.[cmsPackageName])
      throw new HttpException(
        `Update failed: Could not find ${cmsPackageName} in package.json`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

    const cmsPckgOld = await getModulePackage(cmsPackageName);
    const versionOld = cmsPckgOld?.version;
    if (!versionOld)
      throw new HttpException(
        `Update failed: Could not find ${cmsPackageName} package`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

    await runShellCommand(`yarn upgrade ${cmsPackageName}@${availableUpdate.packageVersion} --exact --non-interactive`);
    await sleep(1);

    const cmsPckg = await getModulePackage(cmsPackageName);
    if (!cmsPckg?.version || cmsPckg.version !== availableUpdate.packageVersion)
      throw new HttpException(
        `Update failed: cmsPckg.version !== availableUpdate.packageVersion`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

    const cmsEntity = await getCmsEntity();
    cmsEntity.internalSettings = {
      ...(cmsEntity.internalSettings ?? {}),
      version: availableUpdate.version,
    };

    await cmsEntity.save();
    await getCmsSettings();

    for (const service of availableUpdate?.restartServices ?? []) {
      // Restarts entire service by Manager service
      await restartService(service);
    }
    await sleep(1);

    if ((availableUpdate?.restartServices ?? []).includes('api-server')) {
      // Restart API server by Proxy manager
      const resp1 = await childSendMessage('make-new');
      if (resp1.message !== 'success') {
        // Rollback
        await runShellCommand(`yarn upgrade ${cmsPackageName}@${versionOld} --save --non-interactive`);
        await sleep(1);

        throw new HttpException('Could not start server after update', HttpStatus.INTERNAL_SERVER_ERROR);
      } else {
        const resp2 = await childSendMessage('apply-new', resp1.payload);

        if (resp2.message !== 'success')
          throw new HttpException('Could not apply new server after update', HttpStatus.INTERNAL_SERVER_ERROR);

        setPendingKill(2000);
      }
    }

    return true;
  }

  async installModuleDependencies(moduleName: string) {
    const pckg = await getModulePackage(moduleName);

    for (const pluginName of pckg?.cromwell?.plugins ?? []) {
      const pluginPckg = await getModulePackage(pluginName);
      if (pluginPckg) continue;

      try {
        await this.pluginService.handleInstallPlugin(pluginName);
      } catch (error) {
        logger.error(error);
      }
    }

    for (const themeName of pckg?.cromwell?.themes ?? []) {
      const themePckg = await getModulePackage(themeName);
      if (themePckg) continue;

      try {
        await this.themeService.handleInstallTheme(themeName);
      } catch (error) {
        logger.error(error);
      }
    }
  }

  async getUerRoles() {
    return getCustomRepository(RoleRepository).getAll();
  }

  async generateThumbnail(args: {
    skipIfGenerated?: boolean;
    width: number;
    height: number;
    src: string;
    quality?: number;
  }) {
    if (!args.width || !args.height) {
      throw new HttpException('Width and height are required', HttpStatus.BAD_REQUEST);
    }
    if (!args.src) {
      throw new HttpException('Source image is required', HttpStatus.BAD_REQUEST);
    }

    const result = await resizeImage({
      ...args,
      outPublicDir: 'thumbnails',
      quality: args.quality ?? 90,
    });

    return {
      error: result.error,
      path: result.outFilePublicPath,
    };
  }
}
