import { describe, expect, it } from 'vitest';
import { parsePluginProcedurePath } from '../../billing/plugin-procedure-path';

describe('parsePluginProcedurePath', () => {
  it('parses a flat plugin procedure path', () => {
    expect(parsePluginProcedurePath('pluginApis.hello-world.sayHello')).toEqual({
      normalizedPluginId: 'hello-world',
      procedureName: 'sayHello',
    });
  });

  it('parses nested plugin procedure paths', () => {
    expect(parsePluginProcedurePath('pluginApis.hello-world.admin.generate.image')).toEqual({
      normalizedPluginId: 'hello-world',
      procedureName: 'admin.generate.image',
    });
  });

  it('returns null for invalid paths', () => {
    expect(parsePluginProcedurePath('currency.list')).toBeNull();
    expect(parsePluginProcedurePath('pluginApis.hello-world')).toBeNull();
  });
});
