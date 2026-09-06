import { useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RouterProvider, useMatch, useRouter } from '@ui/lib/router';
import { SessionProvider, useSession } from '@ui/lib/session';
import { ThemeProvider } from '@ui/lib/theme';
import { ToasterProvider } from '@ui/components/Toaster';
import { BootScreen } from '@ui/components/states';
import { AuroraField } from '@ui/components/AuroraField';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { pageIn, still } from '@ui/anim/motion';

import { SignIn } from './screens/SignIn';
import { Dashboard } from './screens/Dashboard';
import { TaskBoard } from './screens/TaskBoard';
import { EquipmentList } from './screens/EquipmentList';
import { EquipmentDetail } from './screens/EquipmentDetail';
import { RuleList } from './screens/RuleList';
import { RuleDetail } from './screens/RuleDetail';
import { TypeList } from './screens/TypeList';
import { HistoryScreen } from './screens/HistoryScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { Chrome } from './components/Chrome';

const ROUTES = [
  '/equipment/:id',
  '/rules/:id',
  '/equipment',
  '/rules',
  '/types',
  '/tasks',
  '/history',
  '/activity',
  '/',
] as const;

function Screens() {
  const match = useMatch([...ROUTES]);
  const { path } = useRouter();
  const reduced = usePrefersReducedMotion();

  // Detail views sit one level deeper, so they arrive from the right and
  // leave to the right; siblings cross-fade in place.
  const depth = useMemo(() => (path.split('/').filter(Boolean).length >= 2 ? 1 : 0), [path]);
  const variants = reduced ? still : pageIn(depth ? 1 : 0.35);

  const screen = (() => {
    switch (match?.pattern) {
      case '/equipment/:id': return <EquipmentDetail id={match.params.id} />;
      case '/rules/:id': return <RuleDetail id={match.params.id} />;
      case '/equipment': return <EquipmentList />;
      case '/rules': return <RuleList />;
      case '/types': return <TypeList />;
      case '/tasks': return <TaskBoard />;
      case '/history': return <HistoryScreen />;
      case '/activity': return <ActivityScreen />;
      default: return <Dashboard />;
    }
  })();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={match?.pattern === '/equipment/:id' || match?.pattern === '/rules/:id' ? path : (match?.pattern ?? '/')}
        className="screen"
        variants={variants}
        initial="hidden"
        animate="shown"
        exit="exit"
      >
        {screen}
      </motion.main>
    </AnimatePresence>
  );
}

function Authenticated() {
  const { status } = useSession();
  const reduced = usePrefersReducedMotion();

  const body = useCallback(() => {
    if (status === 'checking') return <BootScreen label="Maintenance Control" />;
    if (status === 'signed-out') return <SignIn />;
    return (
      <Chrome>
        <Screens />
      </Chrome>
    );
  }, [status]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        className="app-root"
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.988, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.006, filter: 'blur(8px)' }}
        transition={{ type: 'spring', stiffness: 260, damping: 32, mass: 0.9 }}
      >
        {body()}
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  return (
    <ThemeProvider storageKey="mm.admin.theme">
      <AuroraField
        base="var-base"
        colorA="#2f6bff"
        colorB="#17d8bd"
        colorC="#8a5cff"
      />
      <ToasterProvider>
        <SessionProvider>
          <RouterProvider>
            <Authenticated />
          </RouterProvider>
        </SessionProvider>
      </ToasterProvider>
    </ThemeProvider>
  );
}
