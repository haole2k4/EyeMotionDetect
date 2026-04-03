import { create } from 'zustand';

interface AuthState {
  token: string | null;
  user: { email: string; role: string } | null;
  setAuth: (token: string, user: { email: string; role: string }) => void;
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
    return JSON.parse(raw) as { email: string; role: string };
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