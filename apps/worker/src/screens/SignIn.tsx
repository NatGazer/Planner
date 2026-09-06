import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '@ui/lib/session';
import { Button } from '@ui/components/Button';
import { TextField } from '@ui/components/Field';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { spring } from '@ui/anim/motion';

export function SignIn() {
  const { signIn, error } = useSession();
  const reduced = usePrefersReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await signIn(email.trim(), password); }
    catch { setShake((n) => n + 1); }
    finally { setBusy(false); }
  };

  return (
    <div className="w-signin">
      <motion.div
        className="w-signin__mark"
        initial={reduced ? false : { scale: 0.6, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ ...spring.pop, delay: 0.05 }}
      >
        <svg viewBox="0 0 56 56" width="56" height="56" fill="none" aria-hidden="true">
          <motion.circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.3"
            initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
          <motion.path d="m17 28.5 7.8 7.8L40 21" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
        </svg>
      </motion.div>

      <motion.h1
        className="w-signin__title"
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.glide, delay: 0.14 }}
      >
        Maintenance
      </motion.h1>
      <motion.p
        className="w-signin__lede"
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.glide, delay: 0.2 }}
      >
        Sign in to see what needs doing today.
      </motion.p>

      <motion.form
        className="w-signin__form"
        onSubmit={submit}
        key={shake}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 22, filter: 'blur(8px)' }}
        animate={shake && !reduced
          ? { opacity: 1, y: 0, filter: 'blur(0px)', x: [0, -10, 8, -5, 0] }
          : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={shake ? { x: { duration: 0.4 }, default: { ...spring.glide, delay: 0.26 } } : { ...spring.glide, delay: 0.26 }}
      >
        <TextField label="Email" type="email" inputMode="email" autoComplete="username" required
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        <TextField label="Password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" error={error} />
        <Button type="submit" variant="primary" size="xl" block loading={busy}>Sign in</Button>
      </motion.form>

      <motion.p className="w-signin__demo"
        initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        Demo — <code>tomas@fieldworks.example</code> · <code>worker1234</code>
      </motion.p>
    </div>
  );
}
