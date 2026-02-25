/**
 * @wordrhyme/plugin/server - Server-only exports
 *
 * Contains tRPC builders and utilities that depend on Node.js / @trpc/server.
 * Do NOT import this from browser/admin code.
 */
export { pluginRouter, pluginProcedure, createPluginContext } from './trpc';
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
