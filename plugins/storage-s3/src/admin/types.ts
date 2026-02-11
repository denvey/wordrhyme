/**
 * Extension type definitions for plugin UI
 */
import type { ComponentType } from 'react';

export interface ExtensionBase {
    id: string;
    pluginId: string;
    order?: number;
}

export interface SettingsTabExtension extends ExtensionBase {
    type: 'settings_tab';
    label: string;
    component: ComponentType;
}

export type Extension = SettingsTabExtension;

/**
 * S3 Instance Configuration
 */
export interface S3Instance {
    providerId: string;
    displayName: string;
    preset: 'aws' | 'r2' | 'minio' | 'custom';
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey?: string;
    publicUrlBase?: string;
    forcePathStyle: boolean;
    status: 'unconfigured' | 'healthy' | 'error';
    lastTestedAt?: string;
    lastError?: string;
}

/**
 * Form data for creating/editing an instance
 */
export interface S3InstanceFormData {
    providerId: string;
    displayName: string;
    preset: 'aws' | 'r2' | 'minio' | 'custom';
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicUrlBase: string;
    forcePathStyle: boolean;
}

/**
 * Test connection result
 */
export interface TestConnectionResult {
    ok: boolean;
    latencyMs?: number;
    error?: string;
}
