export interface ParsedPluginProcedurePath {
  normalizedPluginId: string;
  procedureName: string;
}

export function parsePluginProcedurePath(path: string): ParsedPluginProcedurePath | null {
  const prefix = 'pluginApis.';
  if (!path.startsWith(prefix)) return null;

  const remainder = path.slice(prefix.length);
  const firstDot = remainder.indexOf('.');
  if (firstDot <= 0 || firstDot === remainder.length - 1) return null;

  return {
    normalizedPluginId: remainder.slice(0, firstDot),
    procedureName: remainder.slice(firstDot + 1),
  };
}
