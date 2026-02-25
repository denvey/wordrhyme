/**
 * OverridableSettingsContainer Tests (Task 7.6)
 *
 * Tests three render states + loading state:
 * 1. allow_override + not custom → "Using platform default" banner + Switch button
 * 2. allow_override + custom → "Using custom configuration" banner + Reset button
 * 3. require_tenant + no custom → "Configuration required" warning banner
 * 4. Loading state → Skeleton placeholders
 * 5. unified mode → renders nothing
 * 6. High-risk confirmation dialog
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ─── Mock useInfraVisibility hook ───

let mockVisibilityData: {
  pluginId: string;
  mode: 'unified' | 'allow_override' | 'require_tenant';
  hasCustomConfig: boolean;
} | undefined;
let mockIsLoading = false;

vi.mock('../../hooks/use-infra-policy', () => ({
  useInfraVisibility: () => ({
    data: mockVisibilityData,
    isLoading: mockIsLoading,
  }),
}));

// ─── Mock @wordrhyme/ui components ───

vi.mock('@wordrhyme/ui', () => ({
  Button: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('button', { onClick, ...props }, children),
  Skeleton: ({ className }: { className?: string }) =>
    React.createElement('div', { 'data-testid': 'skeleton', className }),
  AlertDialog: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) =>
    open ? React.createElement('div', { 'data-testid': 'alert-dialog' }, children) : null,
  AlertDialogContent: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', { 'data-testid': 'alert-dialog-content' }, children),
  AlertDialogHeader: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', null, children),
  AlertDialogTitle: ({ children }: React.PropsWithChildren) =>
    React.createElement('h2', null, children),
  AlertDialogDescription: ({ children }: React.PropsWithChildren) =>
    React.createElement('p', null, children),
  AlertDialogFooter: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', null, children),
  AlertDialogCancel: ({ children }: React.PropsWithChildren) =>
    React.createElement('button', { 'data-testid': 'dialog-cancel' }, children),
  AlertDialogAction: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('button', { 'data-testid': 'dialog-confirm', onClick }, children),
}));

// ─── Mock lucide-react icons ───

vi.mock('lucide-react', () => ({
  Info: () => React.createElement('span', { 'data-testid': 'icon-info' }),
  AlertTriangle: () => React.createElement('span', { 'data-testid': 'icon-alert' }),
  RotateCcw: () => React.createElement('span', { 'data-testid': 'icon-reset' }),
  Settings2: () => React.createElement('span', { 'data-testid': 'icon-settings' }),
}));

import { OverridableSettingsContainer } from '../../components/settings/OverridableSettingsContainer';

describe('OverridableSettingsContainer (Task 7.6)', () => {
  const childContent = 'child-settings-form';
  const renderChildren = vi.fn(({ mode, isEditable }) =>
    React.createElement('div', { 'data-testid': childContent }, `mode=${mode},editable=${isEditable}`),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockVisibilityData = undefined;
    mockIsLoading = false;
  });

  describe('loading state', () => {
    it('should render skeleton placeholders while loading', () => {
      mockIsLoading = true;
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThanOrEqual(2);
      expect(renderChildren).not.toHaveBeenCalled();
    });
  });

  describe('unified mode', () => {
    it('should render nothing', () => {
      mockVisibilityData = { pluginId: 'storage-s3', mode: 'unified', hasCustomConfig: false };
      const { container } = render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(container.innerHTML).toBe('');
      expect(renderChildren).not.toHaveBeenCalled();
    });
  });

  describe('allow_override — using platform default', () => {
    beforeEach(() => {
      mockVisibilityData = { pluginId: 'storage-s3', mode: 'allow_override', hasCustomConfig: false };
    });

    it('should show "platform default" banner', () => {
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(screen.getByText(/platform default/i)).toBeInTheDocument();
    });

    it('should show Switch button', () => {
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(screen.getByText(/switch to custom/i)).toBeInTheDocument();
    });

    it('should render children with isEditable=false (form disabled)', () => {
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(renderChildren).toHaveBeenCalledWith({ mode: 'allow_override', isEditable: false });
    });
  });

  describe('allow_override — using custom configuration', () => {
    beforeEach(() => {
      mockVisibilityData = { pluginId: 'storage-s3', mode: 'allow_override', hasCustomConfig: true };
    });

    it('should show "custom configuration" banner', () => {
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(screen.getByText(/custom configuration/i)).toBeInTheDocument();
    });

    it('should show Reset button', () => {
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(screen.getByText(/reset to platform/i)).toBeInTheDocument();
    });

    it('should render children with isEditable=true', () => {
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(renderChildren).toHaveBeenCalledWith({ mode: 'allow_override', isEditable: true });
    });
  });

  describe('require_tenant — no custom config yet', () => {
    beforeEach(() => {
      mockVisibilityData = { pluginId: 'storage-s3', mode: 'require_tenant', hasCustomConfig: false };
    });

    it('should show "configuration required" warning', () => {
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(screen.getByText(/configuration required/i)).toBeInTheDocument();
    });

    it('should render children with isEditable=true (tenant must configure)', () => {
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(renderChildren).toHaveBeenCalledWith({ mode: 'require_tenant', isEditable: true });
    });
  });

  describe('high-risk confirmation dialog', () => {
    it('should show confirmation dialog when riskLevel=high and switching to custom', () => {
      mockVisibilityData = { pluginId: 'storage-s3', mode: 'allow_override', hasCustomConfig: false };
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          riskLevel: 'high',
          children: renderChildren,
        }),
      );

      // Click "Switch to custom configuration"
      fireEvent.click(screen.getByText(/switch to custom/i));

      // Dialog should appear
      expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
      expect(screen.getByText(/high-risk/i)).toBeInTheDocument();
    });

    it('should switch to custom after confirming dialog', () => {
      mockVisibilityData = { pluginId: 'storage-s3', mode: 'allow_override', hasCustomConfig: false };
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          riskLevel: 'high',
          children: renderChildren,
        }),
      );

      fireEvent.click(screen.getByText(/switch to custom/i));
      fireEvent.click(screen.getByTestId('dialog-confirm'));

      // After confirming, should show "You are using custom configuration" banner
      expect(screen.getByText(/you are using custom configuration/i)).toBeInTheDocument();
      // Reset button should appear
      expect(screen.getByText(/reset to platform/i)).toBeInTheDocument();
    });

    it('should NOT show confirmation dialog when riskLevel is not high', () => {
      mockVisibilityData = { pluginId: 'storage-s3', mode: 'allow_override', hasCustomConfig: false };
      render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          riskLevel: 'medium',
          children: renderChildren,
        }),
      );

      fireEvent.click(screen.getByText(/switch to custom/i));

      // No dialog, should immediately switch
      expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();
      // Should show "You are using custom configuration" banner (not just matching button text)
      expect(screen.getByText(/you are using custom configuration/i)).toBeInTheDocument();
    });
  });

  describe('no visibility data', () => {
    it('should render nothing when data is undefined', () => {
      mockVisibilityData = undefined;
      mockIsLoading = false;
      const { container } = render(
        React.createElement(OverridableSettingsContainer, {
          pluginId: 'storage-s3',
          children: renderChildren,
        }),
      );
      expect(container.innerHTML).toBe('');
    });
  });
});
