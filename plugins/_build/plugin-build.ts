import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readPluginId(pluginDir: string): string {
  const manifestPath = resolve(pluginDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
    pluginId?: string;
  };

  if (!manifest.pluginId) {
    throw new Error(`Missing pluginId in ${manifestPath}`);
  }

  return manifest.pluginId;
}
