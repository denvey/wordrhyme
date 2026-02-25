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
