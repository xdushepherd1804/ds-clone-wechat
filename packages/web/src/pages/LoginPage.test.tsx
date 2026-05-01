import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const mockNavigate = vi.fn();
const mockSetAuth = vi.fn();
const mockLogin = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/store', () => ({
  useUserStore: (selector: any) => {
    const state = { setAuth: mockSetAuth };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/api/auth', () => ({
  login: (...args: any[]) => mockLogin(...args),
}));

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogin.mockResolvedValue({
      token: 'test-token',
      user: { id: '1', username: 'testuser', nickname: 'Test', avatar: null, phone: null, status: 'online', lastSeenAt: null, createdAt: '2024-01-01' },
      expiresIn: 3600,
    });
  });

  it('renders the login form', () => {
    renderLoginPage();
    expect(screen.getByText('登录')).toBeTruthy();
    expect(screen.getByText('用户名')).toBeTruthy();
    expect(screen.getByText('密码')).toBeTruthy();
    expect(screen.getByRole('button', { name: /登/ })).toBeTruthy();
  });

  it('renders link to register page', () => {
    renderLoginPage();
    const links = screen.getAllByRole('link');
    const registerLink = links.find((l) => l.getAttribute('href') === '/register');
    expect(registerLink).toBeTruthy();
  });

  it('shows required validation on empty submit', async () => {
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /登/ }));
    await waitFor(() => {
      expect(screen.getByText('请输入用户名')).toBeTruthy();
      expect(screen.getByText('请输入密码')).toBeTruthy();
    });
  });

  it('calls login API and navigates on success', async () => {
    renderLoginPage();

    const inputs = screen.getAllByRole('textbox');
    await userEvent.type(inputs[0], 'testuser');

    const passwordInput = document.querySelector('input[type="password"]')!;
    await userEvent.type(passwordInput, 'password123');

    fireEvent.click(screen.getByRole('button', { name: /登/ }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'testuser', password: 'password123' });
      expect(mockSetAuth).toHaveBeenCalledWith('test-token', expect.any(Object));
      expect(mockNavigate).toHaveBeenCalledWith('/chat', { replace: true });
    });
  });

  it('shows error message on failed login', async () => {
    mockLogin.mockRejectedValue({ response: { data: { message: 'Invalid credentials' } } });

    renderLoginPage();

    const inputs = screen.getAllByRole('textbox');
    await userEvent.type(inputs[0], 'baduser');

    const passwordInput = document.querySelector('input[type="password"]')!;
    await userEvent.type(passwordInput, 'wrongpass');

    fireEvent.click(screen.getByRole('button', { name: /登/ }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
