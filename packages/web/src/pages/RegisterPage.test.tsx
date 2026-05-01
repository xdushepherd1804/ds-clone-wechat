import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';

const mockNavigate = vi.fn();
const mockSetAuth = vi.fn();
const mockRegister = vi.fn();

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
  register: (...args: any[]) => mockRegister(...args),
}));

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue({
      token: 'test-token',
      user: { id: '1', username: 'newuser', nickname: 'NewUser', avatar: null, phone: null, status: 'online', lastSeenAt: null, createdAt: '2024-01-01' },
      expiresIn: 3600,
    });
  });

  it('renders the registration form', () => {
    renderRegisterPage();
    expect(screen.getByText('注册')).toBeTruthy();
    expect(screen.getByText('昵称')).toBeTruthy();
    expect(screen.getByText('用户名')).toBeTruthy();
    expect(screen.getByText('密码')).toBeTruthy();
    expect(screen.getByText('确认密码')).toBeTruthy();
    expect(screen.getByRole('button', { name: /注/ })).toBeTruthy();
  });

  it('renders link to login page', () => {
    renderRegisterPage();
    const links = screen.getAllByRole('link');
    const loginLink = links.find((l) => l.getAttribute('href') === '/login');
    expect(loginLink).toBeTruthy();
  });

  it('shows required validation on empty submit', async () => {
    renderRegisterPage();
    fireEvent.click(screen.getByRole('button', { name: /注/ }));
    await waitFor(() => {
      expect(screen.getByText('请输入昵称')).toBeTruthy();
      expect(screen.getByText('请输入用户名')).toBeTruthy();
      expect(screen.getByText('请输入密码')).toBeTruthy();
      expect(screen.getByText('请确认密码')).toBeTruthy();
    });
  });

  it('validates password min length', async () => {
    renderRegisterPage();
    const inputs = screen.getAllByRole('textbox');
    await userEvent.type(inputs[0], 'nick');
    await userEvent.type(inputs[1], 'user');

    const pwInputs = document.querySelectorAll('input[type="password"]');
    await userEvent.type(pwInputs[0], '12345');
    await userEvent.type(pwInputs[1], '12345');

    fireEvent.click(screen.getByRole('button', { name: /注/ }));

    await waitFor(() => {
      expect(screen.getByText('密码至少6位')).toBeTruthy();
    });
  });

  it('validates confirm password match', async () => {
    renderRegisterPage();
    const inputs = screen.getAllByRole('textbox');
    await userEvent.type(inputs[0], 'nick');
    await userEvent.type(inputs[1], 'user');

    const pwInputs = document.querySelectorAll('input[type="password"]');
    await userEvent.type(pwInputs[0], 'password123');
    await userEvent.type(pwInputs[1], 'different');

    fireEvent.click(screen.getByRole('button', { name: /注/ }));

    await waitFor(() => {
      expect(screen.getByText('两次输入的密码不一致')).toBeTruthy();
    });
  });

  it('calls register API and auto-logins on success', async () => {
    renderRegisterPage();
    const inputs = screen.getAllByRole('textbox');
    await userEvent.type(inputs[0], 'newuser');
    await userEvent.type(inputs[1], 'newuser');
    await userEvent.type(inputs[2], '13800000000');

    const pwInputs = document.querySelectorAll('input[type="password"]');
    await userEvent.type(pwInputs[0], 'password123');
    await userEvent.type(pwInputs[1], 'password123');

    fireEvent.click(screen.getByRole('button', { name: /注/ }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        username: 'newuser',
        password: 'password123',
        nickname: 'newuser',
        phone: '13800000000',
      });
      expect(mockSetAuth).toHaveBeenCalledWith('test-token', expect.any(Object));
      expect(mockNavigate).toHaveBeenCalledWith('/chat', { replace: true });
    });
  });

  it('shows error message on failed registration', async () => {
    mockRegister.mockRejectedValue({ response: { data: { message: '用户名已存在' } } });

    renderRegisterPage();
    const inputs = screen.getAllByRole('textbox');
    await userEvent.type(inputs[0], 'nick');
    await userEvent.type(inputs[1], 'takenuser');

    const pwInputs = document.querySelectorAll('input[type="password"]');
    await userEvent.type(pwInputs[0], 'password123');
    await userEvent.type(pwInputs[1], 'password123');

    fireEvent.click(screen.getByRole('button', { name: /注/ }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
