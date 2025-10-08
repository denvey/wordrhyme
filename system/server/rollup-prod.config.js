import {
  getServerBuildMonitorPath,
  getServerBuildPath,
  getServerBuildProxyPath,
  getServerBuildResizeImagePath,
} from '@cromwell/core-backend';
import nodeResolve from '@rollup/plugin-node-resolve';
import { isAbsolute, resolve } from 'path';
import typescript from 'rollup-plugin-ts-compiler';

const external = (id) => !id.startsWith('\0') && !id.startsWith('.') && !id.startsWith('/') && !isAbsolute(id);

const sharedState = {};

const getPlugins = () => [
  typescript({
    monorepo: true,
    sharedState,
  }),
  nodeResolve({
    extensions: ['js', 'ts'],
    preferBuiltins: false,
  }),
];

export default [
  {
    input: resolve(__dirname, 'src/main.ts'),
    output: [
      {
        file: getServerBuildPath(),
        format: 'cjs',
      },
    ],
    external: external,
    plugins: [...getPlugins()],
  },
  {
    input: resolve(__dirname, 'src/proxy.ts'),
    output: [
      {
        file: getServerBuildProxyPath(),
        format: 'cjs',
      },
    ],
    external: external,
    plugins: [...getPlugins()],
  },
  {
    input: resolve(__dirname, 'src/monitor.ts'),
    output: [
      {
        file: getServerBuildMonitorPath(),
        format: 'cjs',
      },
    ],
    external: external,
    plugins: [...getPlugins()],
  },
  {
    input: resolve(__dirname, 'src/resize-image.ts'),
    output: [
      {
        file: getServerBuildResizeImagePath(),
        format: 'cjs',
      },
    ],
    external: external,
    plugins: [...getPlugins()],
  },
];
