import { AnimatePresence, motion } from 'framer-motion';
import { RouterProvider, useMatch, useRouter } from '@ui/lib/router';
import { SessionProvider, useSession } from '@ui/lib/session';
import { ThemeProvider } from '@ui/lib/theme';
import { ToasterProvider } from '@ui/components/Toaster';
import { BootScreen } from '@ui/components/states';
import { AuroraField } from '@ui/components/AuroraField';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { SignIn } from './screens/SignIn';
import { TaskList } from './screens/TaskList';
import { TaskDetail } from './screens/TaskDetail';

function Screens() {
  const match = useMatch(['/task/:id', '/']);
  const { path } = useRouter();
  const reduced = usePrefersReducedMotion();
  const deep = match?.pattern === '/task/:id';

  // A task detail slides in from the right over the list, the way every
  // phone app does it, so "back" always feels like going back.
  const variants = reduced
    ? { hidden: { opacity: 0 }, shown: { opacity: 1 }, exit: { opacity: 0 } }
    : deep
      ? {
        hidden: { opacity: 0, x: '18%', filter: 'blur(6px)' },
        shown: { opacity: 1, x: 0, filter: 'blur(0px)' },
        exit: { opacity: 0, x: '22%', filter: 'blur(5px)', transition: { duration: 0.2 } },
      }
      : {
        hidden: { opacity: 0, x: -22, scale: 0.985, filter: 'blur(6px)' },
        shown: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, x: -16, scale: 0.99, filter: 'blur(4px)', transition: { duration: 0.18 } },
      };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={deep ? path : '/'}
        className="screen"
        variants={variants}
        initial="hidden"
        animate="shown"
        exit="exit"
        transition={{ type: 'spring', stiffness: 300, damping: 34, mass: 0.9 }}
      >
        {deep ? <TaskDetail id={match!.params.id} /> : <TaskList />}
      </motion.main>
    </AnimatePresence>
  );
}

function Gate() {
  const { status } = useSession();
  const reduced = usePrefersReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        className="app-root"
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.985, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.008, filter: 'blur(8px)' }}
        transition={{ type: 'spring', stiffness: 260, damping: 32 }}
      >
        {status === 'checking' ? <BootScreen label="Maintenance" />
          : status === 'signed-out' ? <SignIn />
            : <Screens />}
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  return (
    <ThemeProvider storageKey="mm.worker.theme">
      <AuroraField colorA="#1f7bff" colorB="#12c6a6" colorC="#6f5cff" base="#05070e" intensity={0.9} />
      <ToasterProvider>
        <SessionProvider>
          <RouterProvider>
            <Gate />
          </RouterProvider>
        </SessionProvider>
      </ToasterProvider>
    </ThemeProvider>
  );
}
