import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { login } from '../lib/auth';
import { BrandMark, cx } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';

const LAST_EMAIL = 'rudge:last-email';

export function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL) ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const [res] = await Promise.all([login(email, password), new Promise((r) => setTimeout(r, 450))]);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    localStorage.setItem(LAST_EMAIL, email.trim());
  }

  return (
    <div className="login">
      <div className="corner">
        <ThemeToggle />
      </div>
      <div className="login-wrap">
        <BrandMark className="login-mark" />
        <h1 className="wordmark">Rudge</h1>
        <p className="login-tag">Seu sistema pessoal de organização, metas e lembretes.</p>

        <div className={cx('login-card glass liquid', shake && 'shake')}>
          <h2>Entrar</h2>
          <p className="sub">Acesse com seu e-mail e senha.</p>
          <form onSubmit={submit} noValidate>
            <label className="field">
              <span className="label">E-mail</span>
              <div className="input-wrap">
                <Mail />
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus={!email}
                  required
                />
              </div>
            </label>
            <label className="field">
              <span className="label">Senha</span>
              <div className="input-wrap">
                <Lock />
                <input
                  className="input"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus={!!email}
                  required
                />
                <button
                  type="button"
                  className="icon-btn sm"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {error && (
              <div className="login-error" role="alert">
                <AlertCircle /> {error}
              </div>
            )}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || !email || !password}>
              {busy ? <span className="spinner" /> : <>Entrar <ArrowRight /></>}
            </button>
          </form>
        </div>

        <div className="login-foot">
          <ShieldCheck /> Acesso pessoal · dados salvos neste dispositivo
        </div>
      </div>
    </div>
  );
}
