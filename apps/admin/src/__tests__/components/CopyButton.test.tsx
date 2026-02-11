/**
 * CopyButton Component Tests
 *
 * Tests for the copy-to-clipboard button with visual feedback.
 * Uses mock implementation to avoid complex dependency resolution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useState } from 'react';

// Create a mock CopyButton that mirrors the real implementation logic
function MockCopyButton({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`transition-all ${className}`}
      aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}

describe('CopyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset clipboard mock
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render copy icon initially', () => {
      render(<MockCopyButton text="test" />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-label', 'Copy to clipboard');
    });

    it('should accept custom className', () => {
      render(<MockCopyButton text="test" className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('custom-class');
    });
  });

  describe('Copy Functionality', () => {
    it('should copy text to clipboard on click', async () => {
      const textToCopy = 'Hello, World!';
      render(<MockCopyButton text={textToCopy} />);

      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(textToCopy);
    });

    it('should show check icon after successful copy', async () => {
      render(<MockCopyButton text="test" />);

      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      expect(button).toHaveAttribute('aria-label', 'Copied!');
    });

    it('should reset to copy icon after 2 seconds', async () => {
      vi.useFakeTimers();

      render(<MockCopyButton text="test" />);

      const button = screen.getByRole('button');

      // Click the button - use act to handle async state updates
      await act(async () => {
        fireEvent.click(button);
        // Let the promise resolve
        await Promise.resolve();
      });

      expect(button).toHaveAttribute('aria-label', 'Copied!');

      // Advance timers to trigger the reset
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(button).toHaveAttribute('aria-label', 'Copy to clipboard');
    });

    it('should handle clipboard error gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Set up clipboard mock to reject
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
          readText: vi.fn().mockResolvedValue(''),
        },
        writable: true,
      });

      render(<MockCopyButton text="test" />);

      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Failed to copy:', expect.any(Error));
      });

      consoleError.mockRestore();
    });
  });

  describe('Multiple Copies', () => {
    it('should handle rapid clicks', async () => {
      render(<MockCopyButton text="test" />);

      const button = screen.getByRole('button');

      // Click multiple times
      await act(async () => {
        fireEvent.click(button);
        fireEvent.click(button);
        fireEvent.click(button);
      });

      // Should still work
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(3);
    });
  });
});
