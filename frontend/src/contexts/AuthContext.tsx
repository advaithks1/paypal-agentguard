import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginRequest, RegisterRequest, User } from '@/types';
import { tokenStore } from '@/services/api';
import { authService } from '@/services/auth';

export interface AuthState {
  user: User | null;
  loading: boolean;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => void;
}
export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    authService
      .me()
      .then((u) => { if (alive) setUser(u); })
      .catch(() => { tokenStore.clear(); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    const res = await authService.login(req);
    tokenStore.set(res.access_token);
    setUser(res.user);
  }, []);
  const register = useCallback(async (req: RegisterRequest) => {
    const res = await authService.register(req);
    tokenStore.set(res.access_token);
    setUser(res.user);
  }, []);
  const logout = useCallback(() => {
    authService.logout();
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
