import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@/types';
import { api, ApiError } from './api';
import { isDemoMode } from './config';

/**
 * DEMO MODE: no real authentication happens. A local preview session is created in
 * sessionStorage so the UI can be explored. Stage 2 switches VITE_DATA_MODE=api.
 */
const DEMO_USER_KEY = 'agentguard.demo.user';
const wait = (ms = 450) => new Promise<void>((r) => setTimeout(r, ms));

function demoUser(email: string, fullName?: string): User {
  const local = email.split('@')[0] ?? 'demo';
  const name = fullName?.trim() || local.charAt(0).toUpperCase() + local.slice(1);
  return { id: 'demo-user', email, full_name: name, created_at: new Date().toISOString() };
}
function demoSession(user: User): AuthResponse {
  sessionStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
  return { access_token: 'demo-preview-session', token_type: 'bearer', user };
}

export const authService = {
  async login(req: LoginRequest): Promise<AuthResponse> {
    if (!isDemoMode) return api.post<AuthResponse>('/auth/login', req);
    await wait();
    return demoSession(demoUser(req.email));
  },
  async register(req: RegisterRequest): Promise<AuthResponse> {
    if (!isDemoMode) return api.post<AuthResponse>('/auth/register', req);
    await wait();
    return demoSession(demoUser(req.email, req.full_name));
  },
  async me(): Promise<User> {
    if (!isDemoMode) return api.get<User>('/auth/me');
    const raw = sessionStorage.getItem(DEMO_USER_KEY);
    if (!raw) throw new ApiError(401, 'unauthenticated', 'No active session.');
    return JSON.parse(raw) as User;
  },
  logout(): void {
    sessionStorage.removeItem(DEMO_USER_KEY);
  },
};
