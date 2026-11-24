import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, ArrowLeft, RotateCw } from 'lucide-react';
import { linkError, onLinkLogin, sendCode, verifyCode } from '../lib/auth';
import { toast } from '../lib/ui';
import { cx } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import { InkBrand, InkButton, InkHeader, LOGIN_SHAPE, useSplash } from '../components/Entry';

const LAST_EMAIL = 'rudge:last-email';

export function Login() {
  const splash = useSplash();
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
    navigator.vibrate?.([30, 40, 30]);
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
    // deu certo: a cortina cobre a tela e o app aparece (o botão segue carregando até lá)
    if (!res.ok) {
      setBusy(false);
      return fail(res.error);
    }
    if (res.migrated) toast({ title: 'Conta conectada', body: 'Seus avisos agora ficam na sua conta Rudge.', icon: 'check' });
  }

  return (
    <div className={cx('entry entry-login', splash && 'is-splash')}>
      <InkHeader d={LOGIN_SHAPE} splash={splash}>
        <InkBrand splash={splash} splashLine="Seu sistema pessoal de organização" line="Bem-vindo de volta! Entre para continuar." />
      </InkHeader>
      <div className="corner entry-corner">
        <ThemeToggle />
      </div>

      <motion.div
        className="entry-body"
        initial={{ opacity: 0, y: 24 }}
        animate={splash ? { opacity: 0, y: 24 } : { opacity: 1, y: 0 }}
        transition={{ delay: splash ? 0 : 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="entry-title">Entrar</h2>
        <form onSubmit={submit} noValidate className={cx('entry-form', shake && 'shake')}>
          <AnimatePresence mode="wait" initial={false}>
            {step === 'email' ? (
              <motion.div key="email" className="entry-step" initial={{ opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.25 }}>
                <label className="entry-field">
                  <span>E-mail</span>
                  <input
                    className={cx('entry-input', error && 'is-err')}
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="Digite seu e-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <p className="entry-hint">Use sua conta Rudge, a mesma do Rudge Music. Enviamos um link e um código de acesso.</p>
              </motion.div>
            ) : (
              <motion.div key="code" className="entry-step" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }} transition={{ duration: 0.25 }}>
                <label className="entry-field">
                  <span>E-mail</span>
                  <input className="entry-input" value={email.trim()} disabled />
                </label>
                <label className="entry-field">
                  <span>Código do e-mail</span>
                  <input
                    className={cx('entry-input otp', error && 'is-err')}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    autoFocus
                    required
                  />
                </label>
                <div className="entry-row">
                  <button type="button" className="entry-link" onClick={() => (setStep('email'), setError(''))}>
                    <ArrowLeft /> Trocar e-mail
                  </button>
                  <button
                    type="button"
                    className="entry-link"
                    disabled={busy}
                    onClick={async () => {
                      const r = await sendCode(email);
                      if (r.ok) toast({ title: 'E-mail reenviado', icon: 'check' });
                      else fail(r.error);
                    }}
                  >
                    <RotateCw /> Reenviar
                  </button>
                </div>
                <p className="entry-hint">
                  Enviamos para <b>{email.trim()}</b>. Toque no link neste aparelho ou digite o código.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div className="entry-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <AlertCircle /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <InkButton busy={busy} disabled={step === 'email' ? !email : code.length < 6}>
            {step === 'email' ? 'Continuar' : 'Entrar'}
          </InkButton>
        </form>

        <p className="entry-foot">
          Ainda não tem conta? <b>Peça um convite</b> ao Rudge.
        </p>
      </motion.div>
    </div>
  );
}
