import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { EncryptedValue } from '../db/schema/settings.js';

/**
 * Encryption keys configuration from environment
 */
interface EncryptionKeysConfig {
  keys: Record<string, string>; // version -> base64 key
  current: number; // current version for new encryptions
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Encryption Service
 *
 * Provides AES-256-GCM encryption/decryption for sensitive settings.
 * Supports multiple key versions for key rotation.
 *
 * Environment variable format:
 * SETTINGS_ENCRYPTION_KEYS={"keys":{"1":"base64-key-v1","2":"base64-key-v2"},"current":2}
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private keysConfig: EncryptionKeysConfig | null = null;

  onModuleInit() {
    this.loadKeys();
  }

  /**
   * Load encryption keys from environment variable
   */
  private loadKeys(): void {
    const keysEnv = process.env['SETTINGS_ENCRYPTION_KEYS'];

    if (!keysEnv) {
      this.logger.warn(
        'SETTINGS_ENCRYPTION_KEYS not configured. Encryption will not be available.'
      );
      return;
    }

    try {
      const config = JSON.parse(keysEnv) as EncryptionKeysConfig;

      // Validate configuration
      if (!config.keys || typeof config.keys !== 'object') {
        throw new Error('Missing or invalid "keys" property');
      }

      if (typeof config.current !== 'number') {
        throw new Error('Missing or invalid "current" property');
      }

      const currentKeyStr = String(config.current);
      if (!config.keys[currentKeyStr]) {
        throw new Error(`Current key version ${config.current} not found in keys`);
      }

      // Validate key lengths
      for (const [version, key] of Object.entries(config.keys)) {
        const keyBuffer = Buffer.from(key, 'base64');
        if (keyBuffer.length !== KEY_LENGTH) {
          throw new Error(
            `Key version ${version} has invalid length: ${keyBuffer.length} (expected ${KEY_LENGTH})`
          );
        }
      }

      this.keysConfig = config;
      this.logger.log(
        `Loaded ${Object.keys(config.keys).length} encryption key(s), current version: ${config.current}`
      );
    } catch (error) {
      this.logger.error(`Failed to parse SETTINGS_ENCRYPTION_KEYS: ${error}`);
      throw new Error('Invalid encryption keys configuration');
    }
  }

  /**
   * Check if encryption is available
   */
  isAvailable(): boolean {
    return this.keysConfig !== null;
  }

  /**
   * Get the current key version
   */
  getCurrentKeyVersion(): number {
    if (!this.keysConfig) {
      throw new Error('Encryption not configured');
    }
    return this.keysConfig.current;
  }

  /**
   * Encrypt a value using AES-256-GCM
   *
   * @param value - Value to encrypt (will be JSON serialized)
   * @returns Encrypted value structure
   */
  encrypt(value: unknown): EncryptedValue {
    if (!this.keysConfig) {
      throw new Error('Encryption not configured');
    }

    const keyVersion = this.keysConfig.current;
    const keyStr = this.keysConfig.keys[String(keyVersion)];
    if (!keyStr) {
      throw new Error(`Key version ${keyVersion} not found`);
    }
    const key = Buffer.from(keyStr, 'base64');

    // Generate random IV
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    // Encrypt
    const plaintext = JSON.stringify(value);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    // Get auth tag
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyVersion,
    };
  }

  /**
   * Decrypt an encrypted value
   *
   * @param encrypted - Encrypted value structure
   * @returns Decrypted value
   */
  decrypt(encrypted: EncryptedValue): unknown {
    if (!this.keysConfig) {
      throw new Error('Encryption not configured');
    }

    const keyStr = String(encrypted.keyVersion);
    if (!this.keysConfig.keys[keyStr]) {
      throw new Error(`Unknown key version: ${encrypted.keyVersion}`);
    }

    const key = Buffer.from(this.keysConfig.keys[keyStr], 'base64');
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Re-encrypt a value with the current key version
   *
   * Useful for key rotation - decrypt with old key, encrypt with new key.
   *
   * @param encrypted - Value encrypted with any known key version
   * @returns Value encrypted with current key version
   */
  reencrypt(encrypted: EncryptedValue): EncryptedValue {
    if (!this.keysConfig) {
      throw new Error('Encryption not configured');
    }

    // Already using current key version
    if (encrypted.keyVersion === this.keysConfig.current) {
      return encrypted;
    }

    // Decrypt with old key, encrypt with new key
    const value = this.decrypt(encrypted);
    return this.encrypt(value);
  }

  /**
   * Check if an encrypted value needs re-encryption (using old key version)
   */
  needsReencryption(encrypted: EncryptedValue): boolean {
    if (!this.keysConfig) {
      return false;
    }
    return encrypted.keyVersion !== this.keysConfig.current;
  }

  /**
   * Generate a new encryption key (for setup/rotation)
   *
   * @returns Base64-encoded 256-bit key
   */
  static generateKey(): string {
    return randomBytes(KEY_LENGTH).toString('base64');
  }
}

/**
 * Check if a value is an encrypted value structure
 */
export function isEncryptedValue(value: unknown): value is EncryptedValue {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v['ciphertext'] === 'string' &&
    typeof v['iv'] === 'string' &&
    typeof v['authTag'] === 'string' &&
    typeof v['keyVersion'] === 'number'
  );
}
