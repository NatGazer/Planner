import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '@ui/lib/session';
import { useT } from '@ui/lib/i18n';
import { Button } from '@ui/components/Button';
import { TextField } from '@ui/components/Field';
import { Icon } from '@ui/components/Icon';
import { LanguagePicker } from '@ui/components/LanguagePicker';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { spring } from '@ui/anim/motion';

/**
 * The first thing anyone sees. The mark draws itself, the panel rises through
 * focus, and a wrong password shakes the card rather than shouting in red.
 */
export function SignIn() {
  const { signIn, error } = useSession();
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <motion.div
        className="signin__panel"
        key={shake}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.96, filter: 'blur(14px)' }}
        animate={shake && !reduced
          ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', x: [0, -11, 9, -6, 3, 0] }
          : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={shake ? { x: { duration: 0.42 }, default: spring.settle } : spring.settle}
      >
        <motion.div
          className="signin__mark"
          initial={reduced ? false : { scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring.pop, delay: 0.08 }}
        >
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden="true">
            <motion.circle
              cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.28"
              initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.path
              d="m14.5 24.5 6.6 6.6L34 17.8" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.62, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
        </motion.div>

        <h1 className="signin__title">Maintenance Control</h1>
        <p className="signin__lede">{t('admin.signIn.lede')}</p>

        <form className="signin__form" onSubmit={submit}>
          <TextField
            label={t('admin.signIn.email')}
            type="email"
            autoComplete="username"
            inputMode="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('admin.signIn.email.placeholder')}
          />
          <TextField
            label={t('admin.signIn.password')}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            error={error}
          />
          <Button type="submit" variant="primary" size="lg" block loading={busy} iconAfter="arrowRight">
            {t('common.signIn')}
          </Button>
        </form>

        <div className="signin__hint">
          <Icon name="info" size={13} />
          <span>
            {t('admin.signIn.workerHint')}
          </span>
        </div>

        {/* Inside the card, under the form: the language has to be reachable
            before signing in, not only from the account menu afterwards. */}
        <div className="signin__lang">
          <LanguagePicker />
        </div>
      </motion.div>

      <motion.p
        className="signin__demo"
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
      >
        {t('admin.signIn.demo')} <code>ana@fieldworks.example</code> · <code>admin1234</code>
      </motion.p>
    </div>
  );
}
