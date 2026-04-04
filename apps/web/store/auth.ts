import { create } from 'zustand';

interface AuthState {
  token: string | null;
  user: { id: string; username: string; email: string; role: string } | null;
  setAuth: (token: string, user: { id: string; username: string; email: string; role: string }) => void;
  logout: () => void;
}

const readStoredUser = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem('user');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      id?: string;
      username?: string;
      email?: string;
      role?: string;
    };

    if (!parsed.email || !parsed.role) {
      return null;
    }

    return {
      id: parsed.id ?? '',
      username: parsed.username ?? parsed.email.split('@')[0],
      email: parsed.email,
      role: parsed.role,
    };
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  user: readStoredUser(),
  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },
}));