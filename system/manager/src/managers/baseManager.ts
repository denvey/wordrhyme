import { getStoreItem, setStoreItem, sleep, TServiceVersions } from '@cromwell/core';
import { readCMSConfig } from '@cromwell/core-backend/dist/helpers/cms-settings';
import { cmsPackageName } from '@cromwell/core-backend/dist/helpers/constants';
import { getLogger } from '@cromwell/core-backend/dist/helpers/logger';
import {
  getCoreBackendDir,
  getCoreCommonDir,
  getCoreFrontendDir,
  getModulePackage,
} from '@cromwell/core-backend/dist/helpers/paths';
import { extractServiceVersion } from '@cromwell/core-backend/dist/helpers/service-versions';
import { getRestApiClient } from '@cromwell/core-frontend/dist/api/CRestApiClient';
import { ChildProcess, fork, spawn } from 'child_process';
import colorsdef from 'colors/safe';
import fs from 'fs-extra';
import isRunning from 'is-running';
import logSymbols from 'log-symbols';
import nodeCleanup from 'node-cleanup';
import tcpPortUsed from 'tcp-port-used';
import treeKill from 'tree-kill';

import managerConfig from '../config';
import { serviceNames, TScriptName, TServiceNames } from '../constants';
import { checkConfigs, checkModules } from '../tasks/checkModules';
import { getProcessPid as __getProcessPid, loadCache, saveProcessPid } from '../utils/cacheManager';
import { closeAdminPanel, closeAdminPanelManager, startAdminPanel } from './adminPanelManager';
import { closeNginx, startNginx } from './dockerManager';
import { closeRenderer, closeRendererManager, startRenderer } from './rendererManager';
import { closeServer, closeServerManager, startServer } from './serverManager';

const logger = getLogger();
const serviceProcesses: Record<string, ChildProcess> = {};
const { cacheKeys } = managerConfig;
const colors: any = colorsdef;

async function getProcessPid(name: string) {
  return new Promise<number | undefined>((done) => {
    __getProcessPid(name, (pid: number) => {
      done(pid);
    });
  });
}

export const closeService = async (name: string): Promise<boolean> => {
  await new Promise((resolve) => loadCache(resolve));

  const proc = serviceProcesses[name];
  let pid: number | undefined;

  if (proc) {
    pid = proc.pid;
    proc.disconnect();
  }
  if (!pid) {
    pid = await getProcessPid(name);
  }

  const kill = async (pid: number, signal: 'SIGTERM' | 'SIGKILL') => {
    return new Promise<void>((done) => {
      treeKill(pid, signal, async (err) => {
        if (err) logger.log(err);
        done();
      });
    });
  };

  if (!pid || !isRunning(pid)) {
    return true;
  }

  await kill(pid, 'SIGTERM');
  if (isRunning(pid)) await sleep(1);
  if (isRunning(pid)) await sleep(1);

  if (isRunning(pid)) {
    await kill(pid, 'SIGKILL');
    if (isRunning(pid)) await sleep(1);
  }

  if (isRunning(pid)) {
    logger.log(
      `BaseManager::closeService: failed to close service ${name} by pid. Service is still active! pid ${pid}`,
    );
    return false;
  }

  return true;
};

export const closeServiceAndManager = async (name: string): Promise<boolean> => {
  const successService = await closeService(name);
  const successManager = await closeService(`${name}_manager`);

  return successService && successManager;
};

export const startService = async ({
  path,
  name,
  args,
  dir,
  sync,
  command,
  watchName,
  onVersionChange,
}: {
  path: string;
  name: string;
  args?: string[];
  dir?: string;
  sync?: boolean;
  command?: string;
  watchName?: keyof TServiceVersions;
  onVersionChange?: () => Promise<void>;
}): Promise<ChildProcess> => {
  if (!(await fs.pathExists(path))) {
    logger.error('Base manager::startService: could not find startup script at: ', path);
    throw new Error();
  }

  const child = fork(path, args ?? [], {
    stdio: sync ? 'inherit' : 'pipe',
    cwd: dir ?? process.cwd(),
  });
  await saveProcessPid(name, process.pid, child.pid);
  serviceProcesses[name] = child;

  if (getStoreItem('environment')?.mode === 'dev' || command === 'build')
    child?.stdout?.on('data', (buff) => console.log(buff?.toString?.() ?? buff)); // eslint-disable-line

  child?.stderr?.on('data', (buff) => console.error(buff?.toString?.() ?? buff));

  if (watchName && onVersionChange) {
    startWatchService(watchName, onVersionChange);
  }
  return child;
};

export const isServiceRunning = async (name: string): Promise<boolean> => {
  const pid = await getProcessPid(name);
  return isRunning(pid);
};

export const isPortUsed = (port: number): Promise<boolean> => {
  return tcpPortUsed.check(parseInt(port as any), '127.0.0.1');
};

type TStartOptions = {
  scriptName: TScriptName;
  port?: string;
  serviceName?: TServiceNames;
  init?: boolean;
  startAll?: boolean;
  noLogInfo?: boolean;
};

export const startSystem = async (options: TStartOptions) => {
  const { scriptName } = options;
  const isDevelopment = scriptName === 'development';

  const cmsConfig = await readCMSConfig();
  const cmsPckg = await getModulePackage(cmsPackageName);
  await new Promise((resolve) => loadCache(resolve));

  setStoreItem('environment', {
    mode: (cmsConfig.env ?? isDevelopment) === 'dev' ? 'dev' : 'prod',
  });

  // eslint-disable-next-line
  console.log(
    colors.brightBlue('Starting Cromwell CMS...') +
      '\n\n' +
      colors.blue('● Start time:') +
      '....' +
      new Date(Date.now()).toISOString() +
      '\n' +
      colors.blue('● Environment:') +
      '...' +
      (getStoreItem('environment')?.mode === 'dev' ? 'development' : 'production') +
      '\n' +
      colors.blue('● CMS version:') +
      '...' +
      cmsPckg?.version +
      '\n',
  );

  await checkConfigs();

  if (scriptName === 'build') {
    await startServer('build');
    await startAdminPanel('build');
    await startRenderer('buildService');
    return;
  }

  if (isDevelopment) {
    spawn(`npx rollup -cw`, [], { shell: true, stdio: 'inherit', cwd: getCoreCommonDir() });
    spawn(`npx rollup -cw`, [], { shell: true, stdio: 'inherit', cwd: getCoreBackendDir() });
    spawn(`npx rollup -cw`, [], { shell: true, stdio: 'inherit', cwd: getCoreFrontendDir() });
  }

  const serverSuccess = await startServiceByName({
    ...options,
    serviceName: 'server',
    startAll: true,
  });
  const adminSuccess = await startServiceByName({
    ...options,
    serviceName: 'adminPanel',
    startAll: true,
  });
  const rendererSuccess = await startServiceByName({
    ...options,
    serviceName: 'renderer',
    startAll: true,
  });

  if (serverSuccess && adminSuccess && rendererSuccess) {
    // eslint-disable-next-line
    console.log(
      '\n' +
        logSymbols.success +
        colors.brightGreen(` CMS is running.\n\n`) +
        'To see frontend open:\n' +
        colors.brightBlue('http://localhost:4016') +
        '\n\n' +
        'To see admin panel open:\n' +
        colors.brightBlue('http://localhost:4016/admin') +
        '\n\n',
    );
  }
};

export const startServiceByName = async (options: TStartOptions) => {
  const { scriptName, port, serviceName, init, startAll } = options;
  const isDevelopment = scriptName === 'development';

  if (!serviceName || !serviceNames.includes(serviceName)) {
    logger.warn('Invalid service name. Available names are: ' + serviceNames);
  }

  const cmsConfig = await readCMSConfig();
  await new Promise((resolve) => loadCache(resolve));

  setStoreItem('environment', {
    mode: (cmsConfig.env ?? isDevelopment) === 'dev' ? 'dev' : 'prod',
  });

  await checkConfigs();

  if (serviceName === 'adminPanel' || serviceName === 'a') {
    await getModulePackage('@cromwell/admin-panel');
    const success = await startAdminPanel(isDevelopment ? 'dev' : 'prod', {
      port: !startAll ? port : undefined,
    });
    if (success && !startAll) {
      logger.info(`Admin Panel has started at http://localhost:${port ?? 4064}/admin/`);
    }
    return success;
  }

  if (serviceName === 'renderer' || serviceName === 'r') {
    await checkModules(isDevelopment);
    const success = await startRenderer(isDevelopment ? 'dev' : 'prod', {
      port: !startAll ? port : undefined,
    });
    if (success && !startAll) {
      logger.info(`Renderer has started at http://localhost:${port ?? 4128}`);
    }
    return success;
  }

  if (serviceName === 'server' || serviceName === 's') {
    const success = await startServer(isDevelopment ? 'dev' : 'prod', port, init);
    if (success && !startAll) {
      logger.info(`API server has started at http://localhost:${port ?? 4016}`);
    }
    return success;
  }

  if (serviceName === 'nginx' || serviceName === 'n') {
    return startNginx(isDevelopment);
  }
};

export const closeServiceByName = async (serviceName: TServiceNames) => {
  if (!serviceNames.includes(serviceName)) {
    logger.warn('Invalid service name. Available names are: ' + serviceNames);
  }

  if (serviceName === 'adminPanel' || serviceName === 'a') {
    await closeAdminPanel();
  }

  if (serviceName === 'renderer' || serviceName === 'r') {
    await closeRenderer();
  }

  if (serviceName === 'server' || serviceName === 's') {
    await closeServer();
  }

  if (serviceName === 'nginx' || serviceName === 'n') {
    await closeNginx();
  }
};

export const closeServiceAndManagerByName = async (serviceName: TServiceNames) => {
  if (!serviceNames.includes(serviceName)) {
    logger.warn('Invalid service name. Available names are: ' + serviceNames);
  }

  if (serviceName === 'adminPanel' || serviceName === 'a') {
    await closeAdminPanelManager();
  }

  if (serviceName === 'renderer' || serviceName === 'r') {
    await closeRendererManager();
  }

  if (serviceName === 'server' || serviceName === 's') {
    await closeServerManager();
  }

  if (serviceName === 'nginx' || serviceName === 'n') {
    await closeNginx();
  }
};

export const shutDownSystem = async () => {
  await Promise.all([
    closeAdminPanelManager().catch((e) => logger.error(e)),
    closeRendererManager().catch((e) => logger.error(e)),
    closeServerManager().catch((e) => logger.error(e)),
  ]).catch((e) => logger.error(e));
};

/**
 * Tries to fetch service's instance version from Server/DB to check it with current one in memory.
 * If the request succeeds (server can not be running at all) and versions are different
 * it'll trigger once callback that can handle, for instance, service restart.
 *
 * For example, this way we can change active Theme name in Admin panel, increment Renderer's version in DB
 * and Renderer will restart automatically with new Theme. Moreover it works with scaling,
 * if we host multiple instances of a service and do load-balancing. All instances of Renderer
 * wherever they are, can restart independently at once when theme has been changed.
 * This behavior can be disabled by setting `useWatch: false` in cmsconfig.json
 * @param serviceName
 */
export const startWatchService = async (serviceName: keyof TServiceVersions, onVersionChange: () => Promise<void>) => {
  const currentSettings = getStoreItem('cmsSettings');
  // currentVersion will be null, until request succeeds. If it does and version is not
  // set at server, it'll have undefined value. That allows to differ cases when
  // Server has not been launched or became unavalibele for some reason after launch
  let currentVersion: number | null | undefined = null;

  try {
    const remoteSettings = await getRestApiClient()?.getCmsSettings({ disableLog: true });
    if (remoteSettings) {
      const remoteVersion = extractServiceVersion(remoteSettings, serviceName);
      currentVersion = remoteVersion;
    } else {
      currentVersion = null;
    }
  } catch (e) {
    // console.error(e)
  }

  const watchService = async (serviceName: keyof TServiceVersions) => {
    const currentSettings = getStoreItem('cmsSettings');
    try {
      const remoteSettings = await getRestApiClient()?.getCmsSettings({ disableLog: true });
      const remoteVersion = extractServiceVersion(remoteSettings, serviceName);

      if (currentVersion !== null && remoteVersion && remoteVersion !== currentVersion) {
        // new version is set in DB, save it and restart service
        currentVersion = remoteVersion;
        onVersionChange();
        return;
      }

      if (currentVersion === null && remoteSettings) {
        currentVersion = remoteVersion;
      }
    } catch (e) {}

    setTimeout(() => {
      watchService(serviceName);
    }, currentSettings?.watchPoll ?? 2000);
  };

  setTimeout(() => {
    watchService(serviceName);
  }, currentSettings?.watchPoll ?? 2000);
};

nodeCleanup(() => {
  Object.values(serviceProcesses).forEach((child) => {
    try {
      child?.kill();
    } catch (error) {
      logger.error(error);
    }
  });
});

export const getServicesStatus = async () => {
  logger.info(
    `CMS services status:
  - API Server:..........${
    (await isServiceRunning(cacheKeys.serverMain)) ? colors.brightGreen('Active') : colors.brightRed('Inactive')
  }
  - Admin panel:.........${
    (await isServiceRunning(cacheKeys.adminPanel)) ? colors.brightGreen('Active') : colors.brightRed('Inactive')
  }
  - Renderer (Next.js):..${
    (await isServiceRunning(cacheKeys.renderer)) ? colors.brightGreen('Active') : colors.brightRed('Inactive')
  }
`,
  );
};
