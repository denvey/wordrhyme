/**
 * Capability Parser Tests
 *
 * Tests the dual API format parsing:
 * - Legacy three-segment format: "content:read:space"
 * - CASL-style format: ("read", "Content")
 * - Plugin capability format: "plugin:com.vendor.seo:settings.read"
 */
import { describe, it, expect } from 'vitest';
import {
    parseCapability,
    isLegacyFormat,
    legacyToCasl,
    pluginPermissionToCasl,
} from '../../permission/capability-parser';

describe('parseCapability', () => {
    describe('CASL-style format (action, subject)', () => {
        it('should parse action and subject', () => {
            const result = parseCapability('read', 'Content');
            expect(result).toEqual({
                action: 'read',
                subject: 'Content',
                subjectInstance: undefined,
            });
        });

        it('should include subject instance when provided', () => {
            const instance = { id: '123', ownerId: 'user-1' };
            const result = parseCapability('update', 'Content', instance);
            expect(result).toEqual({
                action: 'update',
                subject: 'Content',
                subjectInstance: instance,
            });
        });

        it('should handle any action string', () => {
            expect(parseCapability('customAction', 'CustomSubject')).toEqual({
                action: 'customAction',
                subject: 'CustomSubject',
                subjectInstance: undefined,
            });
        });
    });

    describe('legacy three-segment format (resource:action:scope)', () => {
        it('should parse content:read:space', () => {
            const result = parseCapability('content:read:space');
            expect(result).toEqual({
                action: 'read',
                subject: 'Content',
            });
        });

        it('should parse content:update:project', () => {
            const result = parseCapability('content:update:project');
            expect(result).toEqual({
                action: 'update',
                subject: 'Content',
            });
        });

        it('should parse user:manage:org', () => {
            const result = parseCapability('user:manage:org');
            expect(result).toEqual({
                action: 'manage',
                subject: 'User',
            });
        });

        it('should handle wildcard superadmin (*:*:*)', () => {
            const result = parseCapability('*:*:*');
            expect(result).toEqual({
                action: 'manage',
                subject: 'all',
            });
        });

        it('should normalize action aliases', () => {
            expect(parseCapability('content:*:space').action).toBe('manage');
        });

        it('should capitalize unknown resources', () => {
            const result = parseCapability('customresource:read:space');
            expect(result.subject).toBe('Customresource');
        });

        it('should map known resources to proper subjects', () => {
            expect(parseCapability('organization:read:*').subject).toBe('Organization');
            expect(parseCapability('team:read:*').subject).toBe('Team');
            expect(parseCapability('menu:read:*').subject).toBe('Menu');
            expect(parseCapability('role:read:*').subject).toBe('Role');
            expect(parseCapability('permission:read:*').subject).toBe('Permission');
            expect(parseCapability('audit:read:*').subject).toBe('AuditLog');
        });
    });

    describe('plugin capability format', () => {
        it('should parse plugin:pluginId:resource.action', () => {
            const result = parseCapability('plugin:com.vendor.seo:settings.read');
            expect(result).toEqual({
                action: 'read',
                subject: 'plugin:com.vendor.seo:settings',
            });
        });

        it('should parse plugin:pluginId:simpleAction', () => {
            const result = parseCapability('plugin:com.vendor.seo:manage');
            expect(result).toEqual({
                action: 'manage',
                subject: 'plugin:com.vendor.seo',
            });
        });

        it('should handle nested resource paths', () => {
            const result = parseCapability('plugin:com.vendor.analytics:reports.export.download');
            // Last dot splits action, everything before is resource
            expect(result).toEqual({
                action: 'download',
                subject: 'plugin:com.vendor.analytics:reports.export',
            });
        });
    });

    describe('invalid formats', () => {
        it('should handle single segment', () => {
            const result = parseCapability('invalid');
            expect(result).toEqual({
                action: 'manage',
                subject: 'invalid',
            });
        });

        it('should handle two segments', () => {
            const result = parseCapability('resource:action');
            expect(result).toEqual({
                action: 'action',
                subject: 'Resource',
            });
        });
    });
});

describe('isLegacyFormat', () => {
    it('should return true for legacy three-segment format', () => {
        expect(isLegacyFormat('content:read:space')).toBe(true);
        expect(isLegacyFormat('user:manage:org')).toBe(true);
    });

    it('should return false for plugin format', () => {
        expect(isLegacyFormat('plugin:com.vendor:action')).toBe(false);
    });

    it('should return false for invalid formats', () => {
        expect(isLegacyFormat('invalid')).toBe(false);
        expect(isLegacyFormat('two:parts')).toBe(false);
        expect(isLegacyFormat('too:many:parts:here')).toBe(false);
    });
});

describe('legacyToCasl', () => {
    it('should convert legacy to "action subject" string', () => {
        expect(legacyToCasl('content:read:space')).toBe('read Content');
        expect(legacyToCasl('*:*:*')).toBe('manage all');
        expect(legacyToCasl('user:delete:org')).toBe('delete User');
    });
});

describe('pluginPermissionToCasl', () => {
    it('should convert resource.action format', () => {
        const result = pluginPermissionToCasl('settings.read', 'com.vendor.seo');
        expect(result).toEqual({
            action: 'read',
            subject: 'plugin:com.vendor.seo:settings',
        });
    });

    it('should convert simple action format', () => {
        const result = pluginPermissionToCasl('manage', 'com.vendor.seo');
        expect(result).toEqual({
            action: 'manage',
            subject: 'plugin:com.vendor.seo',
        });
    });

    it('should handle nested resource paths', () => {
        const result = pluginPermissionToCasl('reports.analytics.export', 'com.vendor.bi');
        expect(result).toEqual({
            action: 'export',
            subject: 'plugin:com.vendor.bi:reports.analytics',
        });
    });

    it('should normalize actions', () => {
        const result = pluginPermissionToCasl('data.*', 'com.vendor.sync');
        expect(result.action).toBe('manage');
    });
});
