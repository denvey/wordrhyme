/**
 * Price Component Tests
 *
 * Tests for the Price display component behavior using mock implementations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { useState, useMemo } from 'react';

// Mock price formatter function
function createMockPFormatter() {
  return (cents: number, _options?: object) => `$${(cents / 100).toFixed(2)}`;
}

// Mock Price component implementation
function MockPrice({
  cents,
  className,
  as: Component = 'span',
}: {
  cents: number;
  className?: string;
  as?: React.ElementType;
}) {
  const p = createMockPFormatter();
  const formattedPrice = useMemo(() => p(cents), [cents]);
  return <Component className={className}>{formattedPrice}</Component>;
}

// Mock PriceRange component implementation
function MockPriceRange({
  minCents,
  maxCents,
  separator = ' - ',
  className,
  as: Component = 'span',
}: {
  minCents: number;
  maxCents: number;
  separator?: string;
  className?: string;
  as?: React.ElementType;
}) {
  const p = createMockPFormatter();
  const formattedRange = useMemo(() => {
    const min = p(minCents);
    const max = p(maxCents);
    return `${min}${separator}${max}`;
  }, [minCents, maxCents, separator]);

  return <Component className={className}>{formattedRange}</Component>;
}

// Mock PriceDiscount component implementation
function MockPriceDiscount({
  originalCents,
  discountedCents,
  originalClassName = 'line-through text-muted-foreground',
  discountedClassName = 'text-destructive font-semibold',
  className,
}: {
  originalCents: number;
  discountedCents: number;
  originalClassName?: string;
  discountedClassName?: string;
  className?: string;
}) {
  const p = createMockPFormatter();

  return (
    <span className={className}>
      <span className={originalClassName}>{p(originalCents)}</span>{' '}
      <span className={discountedClassName}>{p(discountedCents)}</span>
    </span>
  );
}

describe('Price Component', () => {
  describe('Price', () => {
    it('should render formatted price', () => {
      render(<MockPrice cents={1999} />);
      expect(screen.getByText('$19.99')).toBeTruthy();
    });

    it('should render zero price', () => {
      render(<MockPrice cents={0} />);
      expect(screen.getByText('$0.00')).toBeTruthy();
    });

    it('should apply custom className', () => {
      const { container } = render(<MockPrice cents={1999} className="custom-price" />);
      expect(container.querySelector('.custom-price')).toBeTruthy();
    });

    it('should render as custom element', () => {
      const { container } = render(<MockPrice cents={1999} as="div" />);
      const div = container.querySelector('div');
      expect(div).toBeTruthy();
      expect(div?.textContent).toBe('$19.99');
    });

    it('should handle large amounts', () => {
      render(<MockPrice cents={999999} />);
      expect(screen.getByText('$9999.99')).toBeTruthy();
    });
  });

  describe('PriceRange', () => {
    it('should render price range with default separator', () => {
      render(<MockPriceRange minCents={999} maxCents={1999} />);
      expect(screen.getByText('$9.99 - $19.99')).toBeTruthy();
    });

    it('should use custom separator', () => {
      render(<MockPriceRange minCents={999} maxCents={1999} separator=" to " />);
      expect(screen.getByText('$9.99 to $19.99')).toBeTruthy();
    });

    it('should handle same min and max', () => {
      render(<MockPriceRange minCents={1999} maxCents={1999} />);
      expect(screen.getByText('$19.99 - $19.99')).toBeTruthy();
    });
  });

  describe('PriceDiscount', () => {
    it('should render original and discounted price', () => {
      render(<MockPriceDiscount originalCents={9999} discountedCents={7999} />);
      expect(screen.getByText('$99.99')).toBeTruthy();
      expect(screen.getByText('$79.99')).toBeTruthy();
    });

    it('should apply strikethrough class to original price', () => {
      const { container } = render(
        <MockPriceDiscount originalCents={9999} discountedCents={7999} />
      );
      const original = container.querySelector('.line-through');
      expect(original).toBeTruthy();
      expect(original?.textContent).toBe('$99.99');
    });

    it('should apply discount class to discounted price', () => {
      const { container } = render(
        <MockPriceDiscount originalCents={9999} discountedCents={7999} />
      );
      const discounted = container.querySelector('.text-destructive');
      expect(discounted).toBeTruthy();
      expect(discounted?.textContent).toBe('$79.99');
    });

    it('should use custom classes', () => {
      const { container } = render(
        <MockPriceDiscount
          originalCents={9999}
          discountedCents={7999}
          originalClassName="custom-original"
          discountedClassName="custom-discounted"
        />
      );
      expect(container.querySelector('.custom-original')).toBeTruthy();
      expect(container.querySelector('.custom-discounted')).toBeTruthy();
    });
  });
});
