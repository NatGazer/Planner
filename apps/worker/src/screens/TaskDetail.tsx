import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { TextArea } from '@ui/components/Field';
import { PhotoCapture, type CapturedPhoto } from '@ui/components/PhotoCapture';
import { ErrorState, Skeleton } from '@ui/components/states';
import { useToaster } from '@ui/components/Toaster';
import { accentClass, STATUS } from '@ui/lib/status';
import { cadence, longDate } from '@ui/lib/format';
import { ApiError } from '@ui/lib/api';
import { spring } from '@ui/anim/motion';
import { workerApi } from '../data';
import { SuccessOverlay } from '../components/SuccessOverlay';

/**
 * One job, and the four things needed to close it: read what to do, tick that
 * it is done, attach one photo, submit. The button stays visibly locked until
 * both requirements are met and says which one is missing.
 */
export function TaskDetail({ id }: { id: string }) {
  const { navigate } = useRouter();
  const { signOut } = useSession();
  const toaster = useToaster();
  const reduced = usePrefersReducedMotion();

  const detail = useResource(() => workerApi.task(id), [id]);
  useSignOutOn401(detail.error, signOut);

  const [done, setDone] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ nextDue: string; title: string } | null>(null);
  const [nudge, setNudge] = useState(0);
  const checkRef = useRef<HTMLButtonElement | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);

  /**
   * Tapping Submit before it is ready is not an error — it is a question.
   * Answer it: shake once, scroll the missing control into view, and say which
   * one it is. Never a dead grey button that explains nothing.
   */
  const promptForMissing = useCallback(() => {
    setNudge((n) => n + 1);
    const target = !done ? checkRef.current : captureRef.current;
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    target?.classList.add('is-wanted');
    setTimeout(() => target?.classList.remove('is-wanted'), 1400);
  }, [done, reduced]);

  const submit = useCallback(async () => {
    if (!photo || !done || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await workerApi.complete(id, { photoId: photo.photoId, comment: comment.trim() || undefined });
      setSuccess({ nextDue: result.nextTask.dueDate, title: detail.data?.task.rule.title ?? 'Maintenance' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach the server. The job is still open — try again.';
      setFailure(message);
      if (err instanceof ApiError && (err.code === 'ALREADY_COMPLETED' || err.status === 404)) {
        toaster.info('Already done', 'Someone else submitted this one. Here is the up-to-date list.');
        setTimeout(() => navigate('/'), 900);
      }
    } finally {
      setBusy(false);
    }
  }, [photo, done, busy, id, comment, detail.data, toaster, navigate]);

  if (detail.error && !detail.data) {
    return (
      <div className="w-detail">
        <TopBar onBack={() => navigate('/')} />
        <div className="w-detail__body">
          <ErrorState
            message={detail.error.status === 404 ? 'This job is no longer outstanding.' : detail.error.message}
            detail={detail.error.status === 404 ? 'Somebody may have completed it, or it may have been deactivated.' : undefined}
            onRetry={detail.error.status === 404 ? undefined : () => void detail.reload()}
          />
          <Button variant="secondary" icon="chevronLeft" block onClick={() => navigate('/')}>Back to the list</Button>
        </div>
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="w-detail">
        <TopBar onBack={() => navigate('/')} />
        <div className="w-detail__body">
          <Skeleton height={150} radius={22} />
          <Skeleton height={120} radius={18} />
          <Skeleton height={190} radius={18} />
        </div>
      </div>
    );
  }

  const { task, today } = detail.data;
  const s = STATUS[task.due.bucket];
  const ready = done && !!photo;
  const satisfied = (done ? 1 : 0) + (photo ? 1 : 0);
  const missing = !done ? 'Tick “Maintenance completed” first'
    : 'Add one photo of the work';

  return (
    <div className={`w-detail ${accentClass(task.equipment.type?.accent ?? 'aurora')}`}>
      <TopBar onBack={() => navigate('/')} />

      <div className="w-detail__body">
        <motion.section
          className={`w-hero ${s.className}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring.glide}
        >
          <span className={`w-hero__due ${s.className}`}>
            <Icon name={s.icon} size={13} /> {task.due.label}
          </span>
          <h1 className="w-hero__title">{task.rule.title}</h1>
          <p className="w-hero__cadence">{cadence(task.rule.intervalValue, task.rule.intervalUnit)}</p>

          <div className="w-hero__ident">
            <span className="w-hero__glyph">
              {task.equipment.type ? <Icon name={task.equipment.type.icon as IconName} size={22} /> : null}
            </span>
            <div>
              <p className="w-hero__code">{task.equipment.code}</p>
              <p className="w-hero__name">{task.equipment.name}</p>
            </div>
          </div>

          <dl className="w-hero__facts">
            <div>
              <dt><Icon name="pin" size={12} /> Where</dt>
              <dd>{task.equipment.location ?? 'No location recorded'}</dd>
            </div>
            <div>
              <dt><Icon name="calendar" size={12} /> Due</dt>
              <dd>{longDate(task.dueDate)}</dd>
            </div>
          </dl>
        </motion.section>

        {task.rule.instructions ? (
          <motion.section
            className="w-instructions"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.glide, delay: 0.06 }}
          >
            <h2><Icon name="list" size={14} /> What to do</h2>
            <p>{task.rule.instructions}</p>
          </motion.section>
        ) : null}

        <motion.section
          className="w-submit"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.glide, delay: 0.12 }}
        >
          <h2 className="w-submit__title">Finish the job</h2>

          <button
            type="button"
            ref={checkRef}
            className={`w-check${done ? ' is-checked' : ''}`}
            onClick={() => setDone((v) => !v)}
            role="checkbox"
            aria-checked={done}
          >
            <motion.span className="w-check__box" animate={{ scale: done ? [1, 1.18, 1] : 1 }} transition={{ duration: 0.32 }}>
              <AnimatePresence>
                {done ? (
                  <motion.svg
                    viewBox="0 0 24 24" width="20" height="20" fill="none"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                  >
                    <motion.path
                      d="m5 12.5 4.6 4.6L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                      initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.26 }}
                    />
                  </motion.svg>
                ) : null}
              </AnimatePresence>
            </motion.span>
            <span className="w-check__label">Maintenance completed</span>
          </button>

          <div ref={captureRef}>
            <PhotoCapture
              value={photo}
              onChange={setPhoto}
              disabled={busy}
              hint="One photo showing the work. It is stored with the record and only administrators can see it."
            />
          </div>

          <TextArea
            label="Anything to add?"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional — parts used, something you noticed, anything worth knowing next time."
            maxLength={2000}
            disabled={busy}
          />

          <AnimatePresence initial={false}>
            {failure ? (
              <motion.p
                className="w-failure"
                role="alert"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Icon name="alert" size={15} /> {failure}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </motion.section>
      </div>

      <div className="w-submitbar">
        <AnimatePresence mode="wait" initial={false}>
          {!ready ? (
            <motion.p
              key="missing"
              id="submit-state"
              className="w-submitbar__hint"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {missing}
            </motion.p>
          ) : null}
        </AnimatePresence>
        <motion.div animate={nudge ? { x: [0, -9, 8, -5, 0] } : { x: 0 }} transition={{ duration: 0.36 }}>
          <Button
            variant="primary"
            size="xl"
            block
            loading={busy}
            onClick={() => (ready ? void submit() : promptForMissing())}
            className={ready ? '' : 'is-incomplete'}
            aria-describedby="submit-state"
            icon={ready ? 'check' : undefined}
          >
            {busy ? 'Submitting…' : ready ? 'Submit completion' : `Submit — ${satisfied} of 2 ready`}
          </Button>
        </motion.div>
      </div>

      <SuccessOverlay
        open={!!success}
        title={success?.title ?? ''}
        nextDue={success?.nextDue ?? ''}
        today={today}
        onDone={() => { setSuccess(null); navigate('/'); }}
      />
    </div>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <header className="w-topbar">
      <button type="button" className="w-back" onClick={onBack}>
        <Icon name="chevronLeft" size={20} />
        <span>All jobs</span>
      </button>
    </header>
  );
}
