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
    sourceSchema,
} from '../../shared/schemas';

// ============================================================
// 1. inlineCreateInputSchema — Required Fields
// ============================================================

describe('inlineCreateInputSchema', () => {
    const validPayload = {
        name: { 'zh-CN': '测试商品A' },
        weight: 500,
        cargoType: 'general' as const,
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
            source: '1688',
            sourceUrl: 'https://example.com/product/123',
            memo: '广州白云区工厂',
            length: 30,
            width: 20,
            height: 10,
            purchaseCost: 1500, // 15.00 CNY in cents (分)
            inboundShippingCost: 200, // 2.00 CNY
            packagingCost: 100, // 1.00 CNY
        });
        expect(result.success).toBe(true);
    });

    // ---- Required field: name ----

    it('should reject when name is missing', () => {
        const { name, ...withoutName } = validPayload;
        const result = inlineCreateInputSchema.safeParse(withoutName);
        expect(result.success).toBe(false);
    });

    it('should reject when name is empty', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            name: { 'zh-CN': '' },
        });
        expect(result.success).toBe(false);
    });

    it('should reject name exceeding 128 characters', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            name: { 'zh-CN': 'A'.repeat(129) },
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

    // ---- Required field: cargoType ----

    it('should reject when cargoType is missing', () => {
        const { cargoType, ...withoutAttr } = validPayload;
        const result = inlineCreateInputSchema.safeParse(withoutAttr);
        expect(result.success).toBe(false);
    });

    it('should reject invalid cargoType', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            cargoType: 'radioactive',
        });
        expect(result.success).toBe(false);
    });

    it('should accept all valid cargoType values', () => {
        for (const type of ['general', 'battery', 'pure_battery', 'liquid_powder']) {
            const result = inlineCreateInputSchema.safeParse({
                ...validPayload,
                cargoType: type,
            });
            expect(result.success, `cargoType=${type} should be valid`).toBe(true);
        }
    });

    // ---- skuCode / autoSku refine rule ----

    it('should reject when both skuCode and autoSku are absent', () => {
        const { skuCode, ...withoutCode } = validPayload;
        const result = inlineCreateInputSchema.safeParse(withoutCode);
        expect(result.success).toBe(false);
    });

    it('should accept when autoSku is true without skuCode', () => {
        const { skuCode, ...withoutCode } = validPayload;
        const result = inlineCreateInputSchema.safeParse({
            ...withoutCode,
            autoSku: true,
        });
        expect(result.success).toBe(true);
    });

    it('should accept when skuCode is provided without autoSku', () => {
        const result = inlineCreateInputSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
    });

    it('should accept when both skuCode and autoSku are provided', () => {
        const result = inlineCreateInputSchema.safeParse({
            ...validPayload,
            autoSku: true,
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
        cargoType: 'general' as const,
        name: { 'zh-CN': '测试商品' },
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

    it('sourceSchema should accept all valid platforms', () => {
        ['1688', 'taobao', 'pinduoduo', 'self_sourced'].forEach((platform) => {
            expect(sourceSchema.safeParse(platform).success).toBe(true);
        });
    });
});
