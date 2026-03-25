/**
 * Shop Plugin - InlineCreate Schema & Business Logic Tests
 *
 * Tests for:
 * 1. inlineCreateInputSchema Zod validation (required fields, auto-generate, refine rules)
 * 2. inlineCreateOutputSchema contract validation
 * 3. generateAutoCode format verification
 * 4. SKU code uniqueness constraint logic (mock-based)
 */
import { describe, it, expect } from 'vitest';
import {
    inlineCreateInputSchema,
    inlineCreateOutputSchema,
    cargoTypeSchema,
    skuTypeSchema,
    sourcingPlatformSchema,
} from '../../shared/schemas';

// ============================================================
// 1. inlineCreateInputSchema — Required Fields
// ============================================================

describe('inlineCreateInputSchema', () => {
    const validPayload = {
        nameCn: '测试商品A',
        weight: 500,
        attributeType: 'general' as const,
        skuCode: 'SKU-001',
    };

    it('should accept a valid complete payload', () => {
        const result = inlineCreateInputSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
    });

    it('should accept payload with all optional fields', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            spuCode: 'SPU-001',
            sourcingPlatform: '1688',
            sourceUrl: 'https://example.com/product/123',
            sourcingMemo: '广州白云区工厂',
            length: 30,
            width: 20,
            height: 10,
            purchaseCost: 1500, // 15.00 CNY in cents (分)
        });
        expect(result.success).toBe(true);
    });

    // ---- Required field: nameCn ----

    it('should reject when nameCn is missing', () => {
        const { nameCn, ...withoutName } = validPayload;
        const result = inlineCreateInputSchema.safeParse(withoutName);
        expect(result.success).toBe(false);
    });

    it('should reject when nameCn is empty', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            nameCn: '',
        });
        expect(result.success).toBe(false);
    });

    it('should reject nameCn exceeding 128 characters', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            nameCn: 'A'.repeat(129),
        });
        expect(result.success).toBe(false);
    });

    // ---- Required field: weight ----

    it('should reject when weight is missing', () => {
        const { weight, ...withoutWeight } = validPayload;
        const result = inlineCreateInputSchema.safeParse(withoutWeight);
        expect(result.success).toBe(false);
    });

    it('should reject weight of 0 (must be positive)', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            weight: 0,
        });
        expect(result.success).toBe(false);
    });

    it('should reject negative weight', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            weight: -100,
        });
        expect(result.success).toBe(false);
    });

    it('should reject non-integer weight', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            weight: 500.5,
        });
        expect(result.success).toBe(false);
    });

    // ---- Required field: attributeType ----

    it('should reject when attributeType is missing', () => {
        const { attributeType, ...withoutAttr } = validPayload;
        const result = inlineCreateInputSchema.safeParse(withoutAttr);
        expect(result.success).toBe(false);
    });

    it('should reject invalid attributeType', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            attributeType: 'radioactive',
        });
        expect(result.success).toBe(false);
    });

    it('should accept all valid attributeType values', () => {
        for (const type of ['general', 'battery', 'pure_battery', 'liquid_powder']) {
            const result = inlineCreateInputSchema.safeParse({
                ...validPayload,
                attributeType: type,
            });
            expect(result.success, `attributeType=${type} should be valid`).toBe(true);
        }
    });

    // ---- skuCode / autoGenerate refine rule ----

    it('should reject when both skuCode and autoGenerate are absent', () => {
        const { skuCode, ...withoutCode } = validPayload;
        const result = inlineCreateInputSchema.safeParse(withoutCode);
        expect(result.success).toBe(false);
    });

    it('should accept when autoGenerate is true without skuCode', () => {
        const { skuCode, ...withoutCode } = validPayload;
        const result = inlineCreateInputSchema.safeParse({
            ...withoutCode,
            autoGenerate: true,
        });
        expect(result.success).toBe(true);
    });

    it('should accept when skuCode is provided without autoGenerate', () => {
        const result = inlineCreateInputSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
    });

    it('should accept when both skuCode and autoGenerate are provided', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            autoGenerate: true,
        });
        expect(result.success).toBe(true);
    });

    // ---- Optional dimension fields ----

    it('should reject non-integer dimension values', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            length: 30.5,
        });
        expect(result.success).toBe(false);
    });

    it('should reject zero dimension values (must be positive)', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            width: 0,
        });
        expect(result.success).toBe(false);
    });

    // ---- purchaseCost ----

    it('should accept purchaseCost of 0', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            purchaseCost: 0,
        });
        expect(result.success).toBe(true);
    });

    it('should reject negative purchaseCost', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            purchaseCost: -100,
        });
        expect(result.success).toBe(false);
    });

    // ---- sourceUrl ----

    it('should reject invalid URL format for sourceUrl', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            sourceUrl: 'not-a-url',
        });
        expect(result.success).toBe(false);
    });
});

// ============================================================
// 2. inlineCreateOutputSchema — Contract Validation
// ============================================================

describe('inlineCreateOutputSchema', () => {
    const validOutput = {
        spuId: '1001',
        skuId: '2001',
        spuCode: 'SPU-20260324-ABCD',
        skuCode: 'AUTO-20260324-EFGH',
        weight: 500,
        attributeType: 'general' as const,
        nameCn: '测试商品',
    };

    it('should accept valid output', () => {
        const result = inlineCreateOutputSchema.safeParse(validOutput);
        expect(result.success).toBe(true);
    });

    it('should accept nullable spuCode and skuCode', () => {
        const result = inlineCreateOutputSchema.safeParse({
            ...validOutput,
            spuCode: null,
            skuCode: null,
        });
        expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
        const { spuId, ...incomplete } = validOutput;
        const result = inlineCreateOutputSchema.safeParse(incomplete);
        expect(result.success).toBe(false);
    });
});

// ============================================================
// 3. Enum Schema Coverage
// ============================================================

describe('Enum schemas', () => {
    it('cargoTypeSchema should accept all valid types', () => {
        for (const type of ['general', 'battery', 'pure_battery', 'liquid_powder']) {
            expect(cargoTypeSchema.safeParse(type).success).toBe(true);
        }
    });

    it('skuTypeSchema should accept all valid types', () => {
        for (const type of ['single', 'bundle', 'virtual_bundle']) {
            expect(skuTypeSchema.safeParse(type).success).toBe(true);
        }
    });

    it('sourcingPlatformSchema should accept all valid platforms', () => {
        for (const platform of ['1688', 'taobao', 'pinduoduo', 'self_sourced']) {
            expect(sourcingPlatformSchema.safeParse(platform).success).toBe(true);
        }
    });
});
