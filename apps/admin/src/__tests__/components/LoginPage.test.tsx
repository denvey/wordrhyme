import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../../pages/Login';

const mockNavigate = vi.fn();
const mockSetSearchParams = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: React.ComponentProps<'a'> & { to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: '/login', state: { from: '/dashboard' } }),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
}));

vi.mock('../../lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../lib/auth-client', () => ({
  signIn: {
    social: vi.fn(),
  },
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    oauthSettings: {
      getEnabledProviders: {
        useQuery: () => ({ data: [] }),
      },
    },
  },
}));

vi.mock('@wordrhyme/ui', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('../../components/icons/SocialIcons', () => ({
  GoogleIcon: () => null,
  GitHubIcon: () => null,
  AppleIcon: () => null,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects authenticated users away from /login', async () => {
    mockUseAuth.mockReturnValue({
      login: vi.fn(),
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('does not redirect while auth state is still loading', () => {
    mockUseAuth.mockReturnValue({
      login: vi.fn(),
      isAuthenticated: false,
      isLoading: true,
    });

    render(<LoginPage />);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
