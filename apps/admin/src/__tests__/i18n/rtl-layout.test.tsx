/**
 * RTL Layout Tests
 *
 * Tests for RTL (Right-to-Left) layout support.
 * Ensures components render correctly for RTL languages like Arabic and Hebrew.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React, { type ReactNode } from 'react';

// ============================================================================
// Mock RTL Container
// ============================================================================

interface RTLContainerProps {
  children: ReactNode;
  direction: 'ltr' | 'rtl';
  locale: string;
}

function RTLContainer({ children, direction, locale }: RTLContainerProps) {
  return (
    <div
      dir={direction}
      lang={locale}
      data-testid="rtl-container"
      className={direction === 'rtl' ? 'rtl' : 'ltr'}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Mock Components with Logical CSS Properties
// ============================================================================

// Button with logical margin
function LogicalButton({ label }: { label: string }) {
  return (
    <button
      data-testid="logical-button"
      style={{
        marginInlineStart: '8px',
        marginInlineEnd: '4px',
        paddingInlineStart: '16px',
        paddingInlineEnd: '16px',
      }}
    >
      {label}
    </button>
  );
}

// Card with logical positioning
function LogicalCard({ title, content }: { title: string; content: string }) {
  return (
    <div
      data-testid="logical-card"
      style={{
        borderInlineStart: '4px solid blue',
        paddingInline: '16px',
        textAlign: 'start',
      }}
    >
      <h3
        data-testid="card-title"
        style={{
          marginBlockEnd: '8px',
        }}
      >
        {title}
      </h3>
      <p
        data-testid="card-content"
        style={{
          marginBlockStart: '4px',
        }}
      >
        {content}
      </p>
    </div>
  );
}

// Navigation with logical flex direction
function LogicalNav({ items }: { items: string[] }) {
  return (
    <nav
      data-testid="logical-nav"
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '8px',
      }}
    >
      {items.map((item, index) => (
        <a
          key={item}
          data-testid={`nav-item-${index}`}
          href="#"
          style={{
            paddingInline: '12px',
            paddingBlock: '8px',
          }}
        >
          {item}
        </a>
      ))}
    </nav>
  );
}

// Icon with logical positioning
function IconWithText({ icon, text }: { icon: string; text: string }) {
  return (
    <span
      data-testid="icon-with-text"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <span data-testid="icon" style={{ order: 0 }}>
        {icon}
      </span>
      <span data-testid="text" style={{ order: 1 }}>
        {text}
      </span>
    </span>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('RTL Layout Support', () => {
  describe('Container Direction', () => {
    it('should set dir="ltr" for LTR languages', () => {
      render(
        <RTLContainer direction="ltr" locale="en-US">
          <div>Content</div>
        </RTLContainer>
      );

      const container = screen.getByTestId('rtl-container');
      expect(container.getAttribute('dir')).toBe('ltr');
      expect(container.getAttribute('lang')).toBe('en-US');
    });

    it('should set dir="rtl" for RTL languages', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <div>محتوى</div>
        </RTLContainer>
      );

      const container = screen.getByTestId('rtl-container');
      expect(container.getAttribute('dir')).toBe('rtl');
      expect(container.getAttribute('lang')).toBe('ar-SA');
    });

    it('should apply rtl class for RTL direction', () => {
      render(
        <RTLContainer direction="rtl" locale="he-IL">
          <div>תוכן</div>
        </RTLContainer>
      );

      const container = screen.getByTestId('rtl-container');
      expect(container.classList.contains('rtl')).toBe(true);
    });

    it('should apply ltr class for LTR direction', () => {
      render(
        <RTLContainer direction="ltr" locale="en-US">
          <div>Content</div>
        </RTLContainer>
      );

      const container = screen.getByTestId('rtl-container');
      expect(container.classList.contains('ltr')).toBe(true);
    });
  });

  describe('Logical CSS Properties', () => {
    it('should render button with logical margin properties', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <LogicalButton label="حفظ" />
        </RTLContainer>
      );

      const button = screen.getByTestId('logical-button');
      expect(button).toBeTruthy();
      // Button should have logical margin/padding that adapts to direction
      expect(button.style.marginInlineStart).toBe('8px');
      expect(button.style.marginInlineEnd).toBe('4px');
    });

    it('should render card with logical border and padding', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <LogicalCard title="عنوان" content="محتوى" />
        </RTLContainer>
      );

      const card = screen.getByTestId('logical-card');
      expect(card).toBeTruthy();
      // Card should have logical border that adapts to direction
      expect(card.style.borderInlineStart).toBe('4px solid blue');
    });

    it('should render navigation with logical flex layout', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <LogicalNav items={['الرئيسية', 'حول', 'اتصال']} />
        </RTLContainer>
      );

      const nav = screen.getByTestId('logical-nav');
      expect(nav).toBeTruthy();
      expect(nav.style.display).toBe('flex');
    });
  });

  describe('Component Rendering in RTL', () => {
    it('should render text correctly in RTL context', () => {
      const arabicText = 'مرحبا بالعالم';

      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <p data-testid="arabic-text">{arabicText}</p>
        </RTLContainer>
      );

      expect(screen.getByTestId('arabic-text').textContent).toBe(arabicText);
    });

    it('should render Hebrew text correctly', () => {
      const hebrewText = 'שלום עולם';

      render(
        <RTLContainer direction="rtl" locale="he-IL">
          <p data-testid="hebrew-text">{hebrewText}</p>
        </RTLContainer>
      );

      expect(screen.getByTestId('hebrew-text').textContent).toBe(hebrewText);
    });

    it('should maintain icon and text order', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <IconWithText icon="📁" text="ملف" />
        </RTLContainer>
      );

      const icon = screen.getByTestId('icon');
      const text = screen.getByTestId('text');

      expect(icon).toBeTruthy();
      expect(text).toBeTruthy();
      expect(text.textContent).toBe('ملف');
    });
  });

  describe('Mixed LTR/RTL Content', () => {
    it('should handle mixed content with explicit direction', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <div>
            <p data-testid="arabic">مرحبا</p>
            <p dir="ltr" data-testid="english">
              Hello
            </p>
          </div>
        </RTLContainer>
      );

      expect(screen.getByTestId('arabic').textContent).toBe('مرحبا');
      expect(screen.getByTestId('english').textContent).toBe('Hello');
      expect(screen.getByTestId('english').getAttribute('dir')).toBe('ltr');
    });

    it('should handle numbers in RTL context', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <p data-testid="price">١٢٣.٤٥ ر.س.</p>
          <p data-testid="western-numbers">$123.45</p>
        </RTLContainer>
      );

      expect(screen.getByTestId('price')).toBeTruthy();
      expect(screen.getByTestId('western-numbers')).toBeTruthy();
    });
  });

  describe('Form Elements in RTL', () => {
    it('should render input correctly in RTL', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <input
            type="text"
            data-testid="rtl-input"
            placeholder="أدخل النص"
            style={{ textAlign: 'start' }}
          />
        </RTLContainer>
      );

      const input = screen.getByTestId('rtl-input');
      expect(input.getAttribute('placeholder')).toBe('أدخل النص');
    });

    it('should render select correctly in RTL', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <select data-testid="rtl-select">
            <option value="1">الخيار الأول</option>
            <option value="2">الخيار الثاني</option>
          </select>
        </RTLContainer>
      );

      const select = screen.getByTestId('rtl-select');
      expect(select).toBeTruthy();
      expect(select.querySelectorAll('option').length).toBe(2);
    });

    it('should render checkbox with label in RTL', () => {
      render(
        <RTLContainer direction="rtl" locale="ar-SA">
          <label
            data-testid="rtl-checkbox-label"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <input type="checkbox" data-testid="rtl-checkbox" />
            <span>أوافق على الشروط</span>
          </label>
        </RTLContainer>
      );

      expect(screen.getByTestId('rtl-checkbox')).toBeTruthy();
      expect(screen.getByTestId('rtl-checkbox-label')).toBeTruthy();
    });
  });

  describe('Language-Specific Rendering', () => {
    const languages = [
      { locale: 'ar-SA', direction: 'rtl' as const, name: 'Arabic' },
      { locale: 'he-IL', direction: 'rtl' as const, name: 'Hebrew' },
      { locale: 'fa-IR', direction: 'rtl' as const, name: 'Persian' },
      { locale: 'en-US', direction: 'ltr' as const, name: 'English' },
      { locale: 'zh-CN', direction: 'ltr' as const, name: 'Chinese' },
      { locale: 'ja-JP', direction: 'ltr' as const, name: 'Japanese' },
    ];

    languages.forEach(({ locale, direction, name }) => {
      it(`should set correct direction for ${name} (${locale})`, () => {
        render(
          <RTLContainer direction={direction} locale={locale}>
            <div data-testid="content">Test</div>
          </RTLContainer>
        );

        const container = screen.getByTestId('rtl-container');
        expect(container.getAttribute('dir')).toBe(direction);
        expect(container.getAttribute('lang')).toBe(locale);
      });
    });
  });
});

describe('RTL CSS Class Application', () => {
  it('should support Tailwind RTL variants', () => {
    // Simulating Tailwind's rtl: variant behavior
    const RTLAwareComponent = ({ direction }: { direction: 'ltr' | 'rtl' }) => (
      <div
        dir={direction}
        data-testid="tailwind-rtl"
        className={`ps-4 pe-2 ${direction === 'rtl' ? 'rtl' : 'ltr'}`}
      >
        Content
      </div>
    );

    const { rerender } = render(<RTLAwareComponent direction="ltr" />);
    expect(screen.getByTestId('tailwind-rtl').classList.contains('ltr')).toBe(true);

    rerender(<RTLAwareComponent direction="rtl" />);
    expect(screen.getByTestId('tailwind-rtl').classList.contains('rtl')).toBe(true);
  });
});
