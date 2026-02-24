/**
 * Drizzle Relations Definitions
 *
 * Defines relationships between tables for use with Drizzle's relational queries.
 * These relations enable .with() queries and type-safe joins.
 *
 * @example
 * ```typescript
 * import { db } from './db';
 * import { relations } from '@wordrhyme/db/relations';
 *
 * const userWithOrgs = await db.query.user.findFirst({
 *   with: { organizationsViaMember: true }
 * });
 * ```
 */

import { defineRelations } from 'drizzle-orm';
import * as schema from '../schema';

export const relations = defineRelations(schema, (r) => ({
  // ============================================
  // Auth & User Relations
  // ============================================
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },

  user: {
    accounts: r.many.account(),
    organizationsViaInvitation: r.many.organization({
      from: r.user.id.through(r.invitation.inviterId),
      to: r.organization.id.through(r.invitation.organizationId),
      alias: 'user_id_organization_id_via_invitation',
    }),
    organizationsViaMember: r.many.organization({
      alias: 'organization_id_user_id_via_member',
    }),
    sessions: r.many.session(),
    teams: r.many.team(),
  },

  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },

  // ============================================
  // Organization Relations
  // ============================================
  organization: {
    entityOwnerships: r.many.entityOwnerships(),
    i18nLanguages: r.many.i18nLanguages(),
    i18nMessages: r.many.i18nMessages(),
    usersViaInvitation: r.many.user({
      alias: 'user_id_organization_id_via_invitation',
    }),
    usersViaMember: r.many.user({
      from: r.organization.id.through(r.member.organizationId),
      to: r.user.id.through(r.member.userId),
      alias: 'organization_id_user_id_via_member',
    }),
    relationships: r.many.relationship(),
    roles: r.many.roles(),
    teams: r.many.team(),
  },

  // ============================================
  // Team Relations
  // ============================================
  team: {
    organization: r.one.organization({
      from: r.team.organizationId,
      to: r.organization.id,
    }),
    users: r.many.user({
      from: r.team.id.through(r.teamMember.teamId),
      to: r.user.id.through(r.teamMember.userId),
    }),
  },

  // ============================================
  // RBAC Relations
  // ============================================
  roles: {
    organization: r.one.organization({
      from: r.roles.organizationId,
      to: r.organization.id,
    }),
    rolePermissions: r.many.rolePermissions(),
  },

  rolePermissions: {
    role: r.one.roles({
      from: r.rolePermissions.roleId,
      to: r.roles.id,
    }),
  },

  menus: {},

  // ============================================
  // Entity Ownership Relations
  // ============================================
  entityOwnerships: {
    organization: r.one.organization({
      from: r.entityOwnerships.organizationId,
      to: r.organization.id,
    }),
  },

  relationship: {
    organization: r.one.organization({
      from: r.relationship.organizationId,
      to: r.organization.id,
    }),
  },

  // ============================================
  // Media Relations (unified replacement)
  // ============================================
  media: {
    parent: r.one.media({
      from: r.media.parentId,
      to: r.media.id,
      alias: 'media_parent',
    }),
    variants: r.many.media({
      alias: 'media_parent',
    }),
  },

  // ============================================
  // i18n Relations
  // ============================================
  i18nLanguages: {
    organization: r.one.organization({
      from: r.i18nLanguages.organizationId,
      to: r.organization.id,
    }),
  },

  i18nMessages: {
    organization: r.one.organization({
      from: r.i18nMessages.organizationId,
      to: r.organization.id,
    }),
  },

  // ============================================
  // Feature Flag Relations
  // ============================================
  featureFlagOverrides: {
    featureFlag: r.one.featureFlags({
      from: r.featureFlagOverrides.flagId,
      to: r.featureFlags.id,
    }),
  },

  featureFlags: {
    featureFlagOverrides: r.many.featureFlagOverrides(),
  },

  // ============================================
  // Billing Relations
  // ============================================
  planItems: {
    plan: r.one.plans({
      from: r.planItems.planId,
      to: r.plans.id,
    }),
  },

  plans: {
    planItems: r.many.planItems(),
    planSubscriptionsPlanId: r.many.planSubscriptions({
      alias: 'planSubscriptions_planId_plans_id',
    }),
    planSubscriptionsScheduledPlanId: r.many.planSubscriptions({
      alias: 'planSubscriptions_scheduledPlanId_plans_id',
    }),
  },

  planSubscriptions: {
    transactionInitialTransactionId: r.one.transactions({
      from: r.planSubscriptions.initialTransactionId,
      to: r.transactions.id,
      alias: 'planSubscriptions_initialTransactionId_transactions_id',
    }),
    transactionLatestTransactionId: r.one.transactions({
      from: r.planSubscriptions.latestTransactionId,
      to: r.transactions.id,
      alias: 'planSubscriptions_latestTransactionId_transactions_id',
    }),
    planPlanId: r.one.plans({
      from: r.planSubscriptions.planId,
      to: r.plans.id,
      alias: 'planSubscriptions_planId_plans_id',
    }),
    planScheduledPlanId: r.one.plans({
      from: r.planSubscriptions.scheduledPlanId,
      to: r.plans.id,
      alias: 'planSubscriptions_scheduledPlanId_plans_id',
    }),
  },

  transactions: {
    planSubscriptionsInitialTransactionId: r.many.planSubscriptions({
      alias: 'planSubscriptions_initialTransactionId_transactions_id',
    }),
    planSubscriptionsLatestTransactionId: r.many.planSubscriptions({
      alias: 'planSubscriptions_latestTransactionId_transactions_id',
    }),
  },

  // ============================================
  // Webhook Relations
  // ============================================
  webhookDeliveries: {
    webhookEndpoint: r.one.webhookEndpoints({
      from: r.webhookDeliveries.endpointId,
      to: r.webhookEndpoints.id,
    }),
  },

  webhookEndpoints: {
    webhookDeliveries: r.many.webhookDeliveries(),
    webhookOutboxes: r.many.webhookOutbox(),
  },

  webhookOutbox: {
    webhookEndpoint: r.one.webhookEndpoints({
      from: r.webhookOutbox.endpointId,
      to: r.webhookEndpoints.id,
    }),
  },
}));
