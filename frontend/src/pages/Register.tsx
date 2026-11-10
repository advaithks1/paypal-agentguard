import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { FormField, inputClass } from '@/components/FormField';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/services/api';
import { AuthShell } from './AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Errors = Partial<Record<'full_name' | 'email' | 'password' | 'confirm' | 'form', string>>;

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (!form.full_name.trim()) next.full_name = 'Enter your full name.';
    if (!EMAIL_RE.test(form.email)) next.email = 'Enter a valid email address.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await register({ full_name: form.full_name.trim(), email: form.email.trim(), password: form.password });
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Registration failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Set up spending rules for your AI agents.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {errors.form && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{errors.form}</p>}
        <FormField label="Full name" htmlFor="full_name" error={errors.full_name} required>
          <input id="full_name" autoComplete="name" value={form.full_name} onChange={set('full_name')} className={inputClass(!!errors.full_name)} />
        </FormField>
        <FormField label="Email" htmlFor="email" error={errors.email} required>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} className={inputClass(!!errors.email)} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters." required>
          <input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} className={inputClass(!!errors.password)} />
        </FormField>
        <FormField label="Confirm password" htmlFor="confirm" error={errors.confirm} required>
          <input id="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} className={inputClass(!!errors.confirm)} />
        </FormField>
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-muted">Already registered? <Link to="/login" className="font-medium text-brand hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
