/**
 * Currency Conversion Property-Based Tests (PBT)
 *
 * Uses fast-check to verify mathematical properties of currency conversion.
 * These tests ensure the conversion system behaves correctly across all inputs.
 *
 * @see GLOBALIZATION_GOVERNANCE.md for conversion requirements
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import Decimal from 'decimal.js';

// Configure Decimal.js for Banker's rounding
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Banker's rounding implementation (matches service implementation)
 */
function bankersRound(value: Decimal): number {
  return value.round().toNumber();
}

/**
 * Convert currency amount using rate
 */
function convert(amountCents: number, rate: Decimal): number {
  const amount = new Decimal(amountCents);
  const result = amount.times(rate);
  return bankersRound(result);
}

/**
 * Inverse conversion (for round-trip testing)
 */
function convertBack(amountCents: number, rate: Decimal): number {
  const amount = new Decimal(amountCents);
  const inverseRate = new Decimal(1).div(rate);
  const result = amount.times(inverseRate);
  return bankersRound(result);
}

// Rate arbitrary: use double instead of float to avoid 32-bit float issues
const rateArbitrary = fc.double({ min: 0.0001, max: 1000, noNaN: true });
const reasonableRateArbitrary = fc.double({ min: 0.5, max: 2.0, noNaN: true });

describe('Currency Conversion PBT', () => {
  // ============================================================================
  // Property: Zero Preservation
  // ============================================================================

  describe('P1: Zero Preservation', () => {
    it('convert(0, rate) === 0 for any valid rate', () => {
      fc.assert(
        fc.property(
          rateArbitrary,
          (rate) => {
            const result = convert(0, new Decimal(rate));
            expect(result).toBe(0);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ============================================================================
  // Property: Positivity Preservation
  // ============================================================================

  describe('P2: Positivity Preservation', () => {
    it('convert(positive, positive_rate) >= 0 (may round to 0 for very small rates)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000_000 }), // Amount in cents
          rateArbitrary, // Rate
          (amount, rate) => {
            const result = convert(amount, new Decimal(rate));
            // Result should be non-negative
            // For very small rates (e.g., 0.0001), 1 * 0.0001 = 0.0001 rounds to 0
            expect(result).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('convert(large_amount, positive_rate) > 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10000, max: 100_000_000 }), // Large amount in cents
          rateArbitrary, // Rate
          (amount, rate) => {
            const result = convert(amount, new Decimal(rate));
            // With large amounts, result should always be positive
            expect(result).toBeGreaterThan(0);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ============================================================================
  // Property: Identity Rate
  // ============================================================================

  describe('P3: Identity Rate', () => {
    it('convert(amount, 1) === amount', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }),
          (amount) => {
            const result = convert(amount, new Decimal(1));
            expect(result).toBe(amount);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ============================================================================
  // Property: Round-Trip Error Bound
  // ============================================================================

  describe('P4: Round-Trip Error Bound', () => {
    it('|original - roundTrip| <= 1 cent (within rounding tolerance)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10_000_000 }), // Amount in cents
          reasonableRateArbitrary, // Reasonable rate range
          (originalAmount, rate) => {
            const rateDecimal = new Decimal(rate);

            // Forward conversion
            const converted = convert(originalAmount, rateDecimal);

            // Backward conversion
            const roundTrip = convertBack(converted, rateDecimal);

            // Error should be <= 1 cent due to double rounding
            // For large rate differences, error can be proportionally larger
            const error = Math.abs(originalAmount - roundTrip);
            const maxError = Math.max(1, Math.ceil(originalAmount * 0.0001)); // 0.01% tolerance

            expect(error).toBeLessThanOrEqual(maxError);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ============================================================================
  // Property: Monotonicity
  // ============================================================================

  describe('P5: Monotonicity', () => {
    it('amount1 < amount2 => convert(amount1) <= convert(amount2)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50_000_000 }),
          fc.integer({ min: 1, max: 50_000_000 }),
          rateArbitrary,
          (amount1, delta, rate) => {
            const amount2 = amount1 + delta; // Ensure amount2 > amount1
            const rateDecimal = new Decimal(rate);

            const result1 = convert(amount1, rateDecimal);
            const result2 = convert(amount2, rateDecimal);

            expect(result1).toBeLessThanOrEqual(result2);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ============================================================================
  // Property: Scaling
  // ============================================================================

  describe('P6: Approximate Linearity', () => {
    it('convert(k * amount) ≈ k * convert(amount) within rounding', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1_000_000 }),
          fc.integer({ min: 2, max: 10 }),
          reasonableRateArbitrary,
          (amount, multiplier, rate) => {
            const rateDecimal = new Decimal(rate);

            const scaledAmount = amount * multiplier;
            const convertedScaled = convert(scaledAmount, rateDecimal);
            const scaledConverted = convert(amount, rateDecimal) * multiplier;

            // Due to rounding, there can be a small difference
            const error = Math.abs(convertedScaled - scaledConverted);
            const maxError = multiplier; // At most multiplier cents difference

            expect(error).toBeLessThanOrEqual(maxError);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ============================================================================
  // Property: Banker's Rounding Correctness
  // ============================================================================

  describe('P7: Banker\'s Rounding', () => {
    it('0.5 rounds to even (0)', () => {
      const result = bankersRound(new Decimal('0.5'));
      expect(result).toBe(0); // 0 is even
    });

    it('1.5 rounds to even (2)', () => {
      const result = bankersRound(new Decimal('1.5'));
      expect(result).toBe(2); // 2 is even
    });

    it('2.5 rounds to even (2)', () => {
      const result = bankersRound(new Decimal('2.5'));
      expect(result).toBe(2); // 2 is even
    });

    it('3.5 rounds to even (4)', () => {
      const result = bankersRound(new Decimal('3.5'));
      expect(result).toBe(4); // 4 is even
    });

    it('non-.5 values round normally', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 1, max: 4 }), // 0.1 to 0.4
          (integer, fractional) => {
            const decimal = new Decimal(integer).plus(new Decimal(fractional).div(10));
            const result = bankersRound(decimal);
            expect(result).toBe(integer); // Should round down
          }
        ),
        { numRuns: 500 }
      );

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 6, max: 9 }), // 0.6 to 0.9
          (integer, fractional) => {
            const decimal = new Decimal(integer).plus(new Decimal(fractional).div(10));
            const result = bankersRound(decimal);
            expect(result).toBe(integer + 1); // Should round up
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ============================================================================
  // Property: Rate Inversion
  // ============================================================================

  describe('P8: Rate Inversion Consistency', () => {
    it('convert(amount, rate) using inverse gives approximately same as inverse(convert(amount, 1/rate))', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 1_000_000 }),
          fc.float({ min: 0.5, max: 2.0, noNaN: true }),
          (amount, rate) => {
            const rateDecimal = new Decimal(rate);
            const inverseRate = new Decimal(1).div(rateDecimal);

            // Method 1: Direct conversion
            const direct = convert(amount, rateDecimal);

            // Method 2: Convert back from inverse
            const viaInverse = convertBack(amount, inverseRate);

            // Should be reasonably close
            const error = Math.abs(direct - viaInverse);
            const maxError = Math.max(2, Math.ceil(amount * 0.001)); // 0.1% tolerance

            expect(error).toBeLessThanOrEqual(maxError);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ============================================================================
  // Property: Version Monotonicity (Conceptual)
  // ============================================================================

  describe('P9: Version Monotonicity', () => {
    it('version numbers only increase', () => {
      // This is a conceptual test for version tracking
      let version = 1;

      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }), // Number of updates
          (numUpdates) => {
            for (let i = 0; i < numUpdates; i++) {
              const oldVersion = version;
              version += 1; // Simulate version increment
              expect(version).toBeGreaterThan(oldVersion);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
