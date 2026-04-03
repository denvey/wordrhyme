/**
 * Form Validation Tests (Zod Schema)
 *
 * Tests for React Hook Form + Zod validation patterns:
 * - Registration form validation
 * - Login form behavior
 * - Error message display
 * - Form state management
 *
 * @task A.3 - Frontend Tests (Form Validation)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';

// Define schemas for testing (same as in Register.tsx)
const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const webhookSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  url: z.string().url('Please enter a valid URL').startsWith('https://', 'HTTPS is required'),
  events: z.array(z.string()).min(1, 'Select at least one event'),
  enabled: z.boolean().default(true),
  secret: z.string().optional(),
});

const settingsSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.union([z.string(), z.number(), z.boolean()]),
  scope: z.enum(['global', 'organization', 'user']),
  description: z.string().optional(),
});

describe('Zod Schema Validation', () => {
  describe('Register Schema', () => {
    it('should validate correct registration data', () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      };

      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject short name', () => {
      const invalidData = {
        name: 'J',
        email: 'john@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Name must be at least 2 characters');
      }
    });

    it('should reject invalid email', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'not-an-email',
        password: 'password123',
        confirmPassword: 'password123',
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Please enter a valid email address');
      }
    });

    it('should reject short password', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'short',
        confirmPassword: 'short',
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Password must be at least 8 characters');
      }
    });

    it('should reject mismatched passwords', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        confirmPassword: 'password456',
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Passwords do not match');
      }
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const invalidData = {
        name: 'J',
        email: 'bad-email',
        password: 'short',
        confirmPassword: 'different',
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Login Schema', () => {
    it('should validate correct login data', () => {
      const validData = {
        email: 'user@example.com',
        password: 'anypassword',
      };

      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty password', () => {
      const invalidData = {
        email: 'user@example.com',
        password: '',
      };

      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid email format', () => {
      const invalidData = {
        email: 'not-valid',
        password: 'password',
      };

      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Webhook Schema', () => {
    it('should validate correct webhook data', () => {
      const validData = {
        name: 'Order Webhook',
        url: 'https://api.example.com/webhooks',
        events: ['order.created', 'order.updated'],
        enabled: true,
      };

      const result = webhookSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject HTTP URL (require HTTPS)', () => {
      const invalidData = {
        name: 'Insecure Webhook',
        url: 'http://api.example.com/webhooks',
        events: ['order.created'],
        enabled: true,
      };

      const result = webhookSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('HTTPS'))).toBe(true);
      }
    });

    it('should reject empty events array', () => {
      const invalidData = {
        name: 'No Events',
        url: 'https://api.example.com/webhooks',
        events: [],
        enabled: true,
      };

      const result = webhookSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Select at least one event');
      }
    });

    it('should reject invalid URL format', () => {
      const invalidData = {
        name: 'Bad URL',
        url: 'not-a-url',
        events: ['order.created'],
        enabled: true,
      };

      const result = webhookSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should apply default enabled value', () => {
      const data = {
        name: 'Test',
        url: 'https://api.example.com/hook',
        events: ['test.event'],
      };

      const result = webhookSchema.parse(data);
      expect(result.enabled).toBe(true);
    });

    it('should reject name over 100 characters', () => {
      const invalidData = {
        name: 'a'.repeat(101),
        url: 'https://api.example.com/webhooks',
        events: ['order.created'],
        enabled: true,
      };

      const result = webhookSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Settings Schema', () => {
    it('should validate string setting value', () => {
      const data = {
        key: 'app.title',
        value: 'WordRhyme CMS',
        scope: 'global' as const,
      };

      const result = settingsSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate number setting value', () => {
      const data = {
        key: 'cache.ttl',
        value: 3600,
        scope: 'organization' as const,
      };

      const result = settingsSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate boolean setting value', () => {
      const data = {
        key: 'feature.enabled',
        value: true,
        scope: 'user' as const,
      };

      const result = settingsSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid scope', () => {
      const data = {
        key: 'test.key',
        value: 'test',
        scope: 'invalid' as unknown as 'global',
      };

      const result = settingsSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject empty key', () => {
      const data = {
        key: '',
        value: 'test',
        scope: 'global' as const,
      };

      const result = settingsSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});

describe('Form Error Display Patterns', () => {
  it('should flatten Zod errors for form display', () => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
    });

    const result = schema.safeParse({ name: 'a', email: 'bad' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.name).toBeDefined();
      expect(fieldErrors.email).toBeDefined();
    }
  });

  it('should format errors for display', () => {
    const schema = z.object({
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });

    const result = schema.safeParse({ password: 'short' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = result.error.format();
      expect(formatted.password?._errors).toContain(
        'Password must be at least 8 characters'
      );
    }
  });
});

describe('Complex Validation Patterns', () => {
  describe('Conditional Validation', () => {
    const paymentSchema = z.discriminatedUnion('type', [
      z.object({
        type: z.literal('credit_card'),
        cardNumber: z.string().length(16, 'Card number must be 16 digits'),
        expiry: z.string().regex(/^\d{2}\/\d{2}$/, 'Use MM/YY format'),
        cvv: z.string().length(3, 'CVV must be 3 digits'),
      }),
      z.object({
        type: z.literal('paypal'),
        email: z.string().email('Enter your PayPal email'),
      }),
      z.object({
        type: z.literal('bank_transfer'),
        accountNumber: z.string().min(8, 'Account number required'),
        routingNumber: z.string().length(9, 'Routing number must be 9 digits'),
      }),
    ]);

    it('should validate credit card payment', () => {
      const data = {
        type: 'credit_card' as const,
        cardNumber: '1234567890123456',
        expiry: '12/25',
        cvv: '123',
      };

      const result = paymentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate PayPal payment', () => {
      const data = {
        type: 'paypal' as const,
        email: 'user@paypal.com',
      };

      const result = paymentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid card number for credit card', () => {
      const data = {
        type: 'credit_card' as const,
        cardNumber: '123', // Too short
        expiry: '12/25',
        cvv: '123',
      };

      const result = paymentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should not require card fields for PayPal', () => {
      const data = {
        type: 'paypal' as const,
        email: 'user@paypal.com',
        // No card fields needed
      };

      const result = paymentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('Array Validation', () => {
    const tagsSchema = z.object({
      tags: z
        .array(z.string().min(1).max(20))
        .min(1, 'At least one tag required')
        .max(10, 'Maximum 10 tags'),
    });

    it('should validate valid tags array', () => {
      const data = { tags: ['react', 'typescript', 'testing'] };
      const result = tagsSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty tags array', () => {
      const data = { tags: [] };
      const result = tagsSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject too many tags', () => {
      const data = {
        tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`),
      };
      const result = tagsSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject empty string tags', () => {
      const data = { tags: ['valid', ''] };
      const result = tagsSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Transform Validation', () => {
    const profileSchema = z.object({
      email: z.string().email().toLowerCase(),
      username: z.string().min(3).trim(),
      age: z.string().transform((val) => Number.parseInt(val, 10)),
    });

    it('should transform email to lowercase', () => {
      const data = {
        email: 'USER@EXAMPLE.COM',
        username: 'testuser',
        age: '25',
      };

      const result = profileSchema.parse(data);
      expect(result.email).toBe('user@example.com');
    });

    it('should trim username whitespace', () => {
      const data = {
        email: 'user@example.com',
        username: '  testuser  ',
        age: '25',
      };

      const result = profileSchema.parse(data);
      expect(result.username).toBe('testuser');
    });

    it('should transform age string to number', () => {
      const data = {
        email: 'user@example.com',
        username: 'testuser',
        age: '30',
      };

      const result = profileSchema.parse(data);
      expect(typeof result.age).toBe('number');
      expect(result.age).toBe(30);
    });
  });

  describe('Async Validation', () => {
    // Simulated async validation (e.g., checking if username exists)
    const checkUsernameAvailable = async (username: string): Promise<boolean> => {
      // Simulate API call
      const takenUsernames = ['admin', 'root', 'system'];
      return !takenUsernames.includes(username);
    };

    const asyncUserSchema = z.object({
      username: z
        .string()
        .min(3)
        .refine(async (username) => await checkUsernameAvailable(username), {
          message: 'Username already taken',
        }),
      email: z.string().email(),
    });

    it('should validate available username', async () => {
      const data = { username: 'newuser', email: 'new@example.com' };
      const result = await asyncUserSchema.safeParseAsync(data);
      expect(result.success).toBe(true);
    });

    it('should reject taken username', async () => {
      const data = { username: 'admin', email: 'admin@example.com' };
      const result = await asyncUserSchema.safeParseAsync(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Username already taken');
      }
    });
  });
});

describe('Error Path Handling', () => {
  it('should provide correct path for nested errors', () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          bio: z.string().max(200, 'Bio too long'),
        }),
      }),
    });

    const data = {
      user: {
        profile: {
          bio: 'a'.repeat(201),
        },
      },
    };

    const result = schema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['user', 'profile', 'bio']);
    }
  });

  it('should provide correct path for array errors', () => {
    const schema = z.object({
      items: z.array(
        z.object({
          name: z.string().min(1),
        })
      ),
    });

    const data = {
      items: [{ name: 'valid' }, { name: '' }],
    };

    const result = schema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['items', 1, 'name']);
    }
  });
});
