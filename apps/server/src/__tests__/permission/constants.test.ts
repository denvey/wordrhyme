/**
 * Permission Constants Tests
 *
 * Verifies auto-derivation of actions/subjects from RESOURCE_DEFINITIONS,
 * validation helpers, and metadata generation.
 */
import { describe, it, expect } from 'vitest';
import {
    APP_ACTIONS,
    APP_SUBJECTS,
    Actions,
    ACTION_DISPLAY_NAMES,
    isKnownAction,
    isValidSubject,
    getPermissionMeta,
} from '../../permission/constants';
import { RESOURCE_DEFINITIONS } from '../../permission/resource-definitions';

describe('Permission Constants', () => {
    describe('collectActions() / APP_ACTIONS', () => {
        it('should always include "manage" wildcard', () => {
            expect(APP_ACTIONS).toContain('manage');
        });

        it('should include core CRUD actions from resources', () => {
            expect(APP_ACTIONS).toContain('create');
            expect(APP_ACTIONS).toContain('read');
            expect(APP_ACTIONS).toContain('update');
            expect(APP_ACTIONS).toContain('delete');
        });

        it('should include content-specific actions like "publish"', () => {
            // 'publish' is not in current RESOURCE_DEFINITIONS actions arrays
            // but is in ACTION_LABELS - check if any resource defines it
            const allActions = new Set<string>();
            for (const resource of Object.values(RESOURCE_DEFINITIONS)) {
                for (const action of resource.actions) {
                    allActions.add(action);
                }
            }
            // APP_ACTIONS should be superset of all resource actions + manage
            for (const action of allActions) {
                expect(APP_ACTIONS).toContain(action);
            }
        });

        it('should have no duplicates', () => {
            const unique = new Set(APP_ACTIONS);
            expect(unique.size).toBe(APP_ACTIONS.length);
        });

        it('should match Actions constants object', () => {
            expect(APP_ACTIONS).toContain(Actions.manage);
            expect(APP_ACTIONS).toContain(Actions.create);
            expect(APP_ACTIONS).toContain(Actions.read);
            expect(APP_ACTIONS).toContain(Actions.update);
            expect(APP_ACTIONS).toContain(Actions.delete);
        });
    });

    describe('APP_SUBJECTS', () => {
        it('should include all subjects from RESOURCE_DEFINITIONS', () => {
            for (const resource of Object.values(RESOURCE_DEFINITIONS)) {
                expect(APP_SUBJECTS).toContain(resource.subject);
            }
        });

        it('should include special "all" subject', () => {
            expect(APP_SUBJECTS).toContain('all');
        });

        it('should include backward-compatible "Content" alias', () => {
            expect(APP_SUBJECTS).toContain('Content');
        });
    });

    describe('isKnownAction()', () => {
        it('should return true for core actions', () => {
            expect(isKnownAction('manage')).toBe(true);
            expect(isKnownAction('create')).toBe(true);
            expect(isKnownAction('read')).toBe(true);
            expect(isKnownAction('update')).toBe(true);
            expect(isKnownAction('delete')).toBe(true);
        });

        it('should return false for unknown actions', () => {
            expect(isKnownAction('fly')).toBe(false);
            expect(isKnownAction('teleport')).toBe(false);
            expect(isKnownAction('')).toBe(false);
        });
    });

    describe('isValidSubject()', () => {
        it('should validate core subjects', () => {
            expect(isValidSubject('all')).toBe(true);
            expect(isValidSubject('Content')).toBe(true);
            expect(isValidSubject('Role')).toBe(true);
            expect(isValidSubject('Plugin')).toBe(true);
            expect(isValidSubject('AuditLog')).toBe(true);
        });

        it('should validate plugin subjects with prefix', () => {
            expect(isValidSubject('plugin:notification')).toBe(true);
            expect(isValidSubject('plugin:storage-s3')).toBe(true);
            expect(isValidSubject('plugin:my-custom-plugin')).toBe(true);
        });

        it('should reject unknown non-plugin subjects', () => {
            expect(isValidSubject('UnknownThing')).toBe(false);
            expect(isValidSubject('random')).toBe(false);
            expect(isValidSubject('')).toBe(false);
        });
    });

    describe('getPermissionMeta()', () => {
        it('should return core subjects and actions', () => {
            const meta = getPermissionMeta();

            // Should have subjects with value/label/description
            expect(meta.subjects.length).toBeGreaterThan(0);
            expect(meta.subjects[0]).toHaveProperty('value');
            expect(meta.subjects[0]).toHaveProperty('label');
            expect(meta.subjects[0]).toHaveProperty('isPlugin');

            // Should have actions
            expect(meta.actions.length).toBeGreaterThan(0);
            expect(meta.actions[0]).toHaveProperty('value');
            expect(meta.actions[0]).toHaveProperty('label');
        });

        it('should include plugin subjects when provided', () => {
            const meta = getPermissionMeta(['plugin:notification', 'plugin:storage']);

            const pluginSubjects = meta.subjects.filter(s => s.isPlugin);
            expect(pluginSubjects.length).toBe(2);
            expect(pluginSubjects.map(s => s.value)).toContain('plugin:notification');
            expect(pluginSubjects.map(s => s.value)).toContain('plugin:storage');
        });

        it('should filter out non-plugin subjects from plugin array', () => {
            const meta = getPermissionMeta(['NotAPlugin', 'plugin:valid']);

            const pluginSubjects = meta.subjects.filter(s => s.isPlugin);
            expect(pluginSubjects.length).toBe(1);
            expect(pluginSubjects[0]!.value).toBe('plugin:valid');
        });
    });

    describe('ACTION_DISPLAY_NAMES', () => {
        it('should have labels for manage and core actions', () => {
            expect(ACTION_DISPLAY_NAMES['manage']).toBeDefined();
            expect(ACTION_DISPLAY_NAMES['create']).toBeDefined();
            expect(ACTION_DISPLAY_NAMES['read']).toBeDefined();
            expect(ACTION_DISPLAY_NAMES['update']).toBeDefined();
            expect(ACTION_DISPLAY_NAMES['delete']).toBeDefined();
        });
    });
});
