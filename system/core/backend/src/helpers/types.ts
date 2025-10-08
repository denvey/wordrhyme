import { TCmsSettings, TOrderPaymentSession, TRole } from '@cromwell/core';
import { FastifyRequest } from 'fastify';

export type TBackendModule = {
  controllers?: unknown[];
  entities?: unknown[];
  resolvers?: unknown[];
  providers?: unknown[];
  migrations?: unknown[];
};

export type Action<PayloadType, OutputType = any> = {
  payload: PayloadType;
  output: OutputType;
};

export type ActionTypes = {
  install_plugin: Action<{ pluginName: string }>;
  update_plugin: Action<{ pluginName: string }>;
  uninstall_plugin: Action<{ pluginName: string }>;

  install_theme: Action<{ themeName: string }>;
  update_theme: Action<{ themeName: string }>;
  uninstall_theme: Action<{ themeName: string }>;
  change_theme: Action<{ themeName: string }>;

  update_cms_settings: Action<TCmsSettings>;

  create_payment: Action<
    TOrderPaymentSession,
    {
      link: string;
      name: string;
    }
  >;
};

export type ActionNames = keyof ActionTypes;

export type TAuthUserInfo = {
  id: number;
  email?: string | null;
  roles: TRole[];
};

export type TTokenPayloadInput = {
  sub: number;
  username: string;
  roles: string;
};

export type TTokenPayloadOutput = {
  sub: number;
  username?: string | null;
  roles: string;
  iat: number;
  exp: number;
};

export type TRequestWithUser = FastifyRequest & {
  user: TAuthUserInfo;
  cookies: any;
};

export type TTokenInfo = {
  token: string;
  maxAge: string;
  cookie: string;
};

export type TGraphQLContext = {
  user?: TAuthUserInfo;
};
