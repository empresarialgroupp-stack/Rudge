import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { linkError, onLinkLogin, sendCode, verifyCode } from '../lib/auth';
import { toast } from '../lib/ui';
import { BrandMark, cx } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';

const LAST_EMAIL = 'rudge:last-email';

export function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL) ?? '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  // login pelo link do e-mail (aberto neste navegador)
  useEffect(() => {
    const err = linkError();
    if (err) setError(err);
    return onLinkLogin((r) => {
      if (!r.ok) setError(r.error);
      else if (r.migrated) toast({ title: 'Conta conectada', body: 'Seus avisos agora ficam na sua conta Rudge.', icon: 'check' });
    });
  }, []);

  function fail(msg: string) {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    if (step === 'email') {
      const res = await sendCode(email);
      setBusy(false);
      if (!res.ok) return fail(res.error);
      localStorage.setItem(LAST_EMAIL, email.trim());
      setCode('');
      setStep('code');
      return;
    }
    const res = await verifyCode(email, code);
    setBusy(false);
    if (!res.ok) return fail(res.error);
    if (res.migrated) toast({ title: 'Conta conectada', body: 'Seus avisos agora ficam na sua conta Rudge.', icon: 'check' });
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
          <p className="sub">
            {step === 'email' ? (
              'Use sua conta Rudge, a mesma do Rudge Music.'
            ) : (
              <>
                Enviamos um e-mail para <b>{email.trim()}</b>. Toque no link de acesso neste aparelho ou digite o código, se
                ele vier no e-mail.
              </>
            )}
          </p>
          <form onSubmit={submit} noValidate>
            {step === 'email' ? (
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
                    autoFocus
                    required
                  />
                </div>
              </label>
            ) : (
              <label className="field">
                <span className="label">Código</span>
                <div className="input-wrap">
                  <KeyRound />
                  <input
                    className="input otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    autoFocus
                    required
                  />
                </div>
              </label>
            )}
            {error && (
              <div className="login-error" role="alert">
                <AlertCircle /> {error}
              </div>
            )}
            <button
              className="btn btn-primary btn-lg btn-block"
              type="submit"
              disabled={busy || (step === 'email' ? !email : code.length < 6)}
            >
              {busy ? <span className="spinner" /> : <>{step === 'email' ? 'Receber acesso por e-mail' : 'Entrar com o código'} <ArrowRight /></>}
            </button>
            {step === 'code' && (
              <div className="login-alt">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setStep('email'), setError(''))}>
                  <ArrowLeft /> Trocar e-mail
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    const r = await sendCode(email);
                    if (r.ok) toast({ title: 'E-mail reenviado', icon: 'check' });
                    else fail(r.error);
                  }}
                >
                  Reenviar e-mail
                </button>
              </div>
            )}
          </form>
        </div>

        <div className="login-foot">
          <ShieldCheck /> Conta Rudge · seus dados ficam salvos neste dispositivo
        </div>
      </div>
    </div>
  );
}
