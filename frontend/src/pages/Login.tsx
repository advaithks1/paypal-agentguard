import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FormField, inputClass } from '@/components/FormField';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/services/api';
import { AuthShell } from './AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email)) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Welcome back to AgentGuard.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {errors.form && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{errors.form}</p>}
        <FormField label="Email" htmlFor="email" error={errors.email} required>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass(!!errors.email)} aria-invalid={!!errors.email} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password} required>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass(!!errors.password)} aria-invalid={!!errors.password} />
        </FormField>
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-muted">New here? <Link to="/register" className="font-medium text-brand hover:underline">Create an account</Link></p>
    </AuthShell>
  );
}
