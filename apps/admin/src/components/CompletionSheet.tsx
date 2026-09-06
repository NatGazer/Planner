import { motion } from 'framer-motion';
import { Sheet } from '@ui/components/Sheet';
import { Icon } from '@ui/components/Icon';
import { Skeleton, ErrorState } from '@ui/components/states';
import { useResource } from '@ui/lib/useResource';
import { errorMessage } from '@ui/lib/errors';
import { useT } from '@ui/lib/i18n';
import { cadence, instantLong, longDate } from '@ui/lib/format';
import { spring } from '@ui/anim/motion';
import { adminApi } from '../data';

/**
 * A completed record, exactly as it was submitted. Everything shown here comes
 * from the snapshot frozen at completion time, so renaming or archiving the
 * equipment afterwards changes nothing about what you are reading.
 */
export function CompletionSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const record = useResource(() => (id ? adminApi.completion(id) : Promise.resolve(null)), [id]);
  const completion = record.data?.completion ?? null;

  return (
    <Sheet open={!!id} onClose={onClose} title={t('admin.completion.title')} subtitle={completion ? completion.equipment.code : undefined} size="lg">
      {record.error ? (
        <ErrorState message={errorMessage(t, record.error)} onRetry={() => void record.reload()} />
      ) : !completion ? (
        <div className="completion-detail">
          <Skeleton height={260} radius={18} />
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <Skeleton height={18} width="60%" /><Skeleton height={14} width="40%" /><Skeleton height={14} width="70%" />
          </div>
        </div>
      ) : (
        <div className="completion-detail">
          <motion.figure
            className="completion-detail__photo"
            initial={{ opacity: 0, scale: 0.96, rotateX: -6 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={spring.glide}
          >
            <img
              src={`/api/photos/${completion.photoId}`}
              alt={t('admin.completion.photoAlt', { task: completion.rule.title, equipment: completion.equipment.code })}
            />
            <figcaption>
              <Icon name="camera" size={12} /> {t('admin.completion.submittedBy', { name: completion.employee.name })}
            </figcaption>
          </motion.figure>

          <div className="completion-detail__body">
            <h3 className="completion-detail__title">{completion.rule.title}</h3>
            <p className="completion-detail__where">
              <strong>{completion.equipment.code}</strong> · {completion.equipment.name}
              {completion.equipment.location ? <> · {completion.equipment.location}</> : null}
            </p>

            <dl className="factlist">
              <Fact label={t('admin.completion.fact.equipmentType')} value={completion.equipment.type.name} />
              <Fact label={t('admin.completion.fact.scheduledFor')} value={longDate(completion.dueDate)} />
              <Fact label={t('admin.completion.fact.completed')} value={instantLong(completion.completedAt)} />
              <Fact
                label={t('admin.completion.fact.punctuality')}
                value={completion.onTime
                  ? (completion.daysLate === 0
                    ? t('admin.completion.punctuality.onTheDay')
                    : t('admin.completion.punctuality.early', { count: -completion.daysLate }))
                  : t('admin.completion.punctuality.late', { count: completion.daysLate })}
                tone={completion.onTime ? 'good' : 'warn'}
              />
              <Fact label={t('admin.completion.fact.carriedOutBy')} value={completion.employee.name} />
              <Fact label={t('admin.completion.fact.frequency')} value={cadence(completion.rule.intervalValue, completion.rule.intervalUnit)} />
            </dl>

            {completion.comment ? (
              <div className="completion-detail__comment">
                <span className="completion-detail__comment-label"><Icon name="comment" size={13} /> {t('admin.completion.note')}</span>
                <p>{completion.comment}</p>
              </div>
            ) : (
              <p className="completion-detail__nocomment">{t('admin.completion.noNote')}</p>
            )}

            {completion.rule.instructions ? (
              <details className="completion-detail__instructions">
                <summary>{t('admin.completion.instructions')}</summary>
                <p>{completion.rule.instructions}</p>
              </details>
            ) : null}

            <p className="completion-detail__immutable">
              <Icon name="lock" size={12} /> {t('admin.completion.immutable')}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Label and value both arrive ready to read — the caller is the one with `t`. */
function Fact({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className={`factlist__item${tone ? ` is-${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
