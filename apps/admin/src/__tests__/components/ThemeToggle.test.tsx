/**
 * ThemeToggle Component Tests
 *
 * Tests for the dark/light theme toggle button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '../../components/ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset document class list
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  describe('Rendering', () => {
    it('should render toggle button', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should show moon icon when in light mode', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Switch to dark mode');
    });

    it('should show sun icon when in dark mode', () => {
      document.documentElement.classList.add('dark');

      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Switch to light mode');
    });
  });

  describe('Theme Switching', () => {
    it('should toggle to dark mode on click', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });

    it('should toggle to light mode on second click', () => {
      document.documentElement.classList.add('dark');

      render(<ThemeToggle />);

      const button = screen.getByRole('button');

      // First click - should switch to light
      fireEvent.click(button);

      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'light');
    });

    it('should update button title after toggle', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Switch to dark mode');

      fireEvent.click(button);

      expect(button).toHaveAttribute('title', 'Switch to light mode');
    });
  });

  describe('Initial State', () => {
    it('should detect initial dark mode from document class', () => {
      document.documentElement.classList.add('dark');

      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Switch to light mode');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button styling', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('p-2');
      expect(button.className).toContain('rounded-md');
    });
  });
});
