import { motion } from 'framer-motion';
import { Sheet } from '@ui/components/Sheet';
import { Icon } from '@ui/components/Icon';
import { Skeleton, ErrorState } from '@ui/components/states';
import { useResource } from '@ui/lib/useResource';
import { cadence, instantLong, longDate, plural } from '@ui/lib/format';
import { spring } from '@ui/anim/motion';
import { adminApi } from '../data';

/**
 * A completed record, exactly as it was submitted. Everything shown here comes
 * from the snapshot frozen at completion time, so renaming or archiving the
 * equipment afterwards changes nothing about what you are reading.
 */
export function CompletionSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const record = useResource(() => (id ? adminApi.completion(id) : Promise.resolve(null)), [id]);
  const completion = record.data?.completion ?? null;

  return (
    <Sheet open={!!id} onClose={onClose} title="Completed maintenance" subtitle={completion ? completion.equipment.code : undefined} size="lg">
      {record.error ? (
        <ErrorState message={record.error.message} onRetry={() => void record.reload()} />
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
            <img src={`/api/photos/${completion.photoId}`} alt={`Photo submitted for ${completion.rule.title} on ${completion.equipment.code}`} />
            <figcaption>
              <Icon name="camera" size={12} /> Submitted by {completion.employee.name}
            </figcaption>
          </motion.figure>

          <div className="completion-detail__body">
            <h3 className="completion-detail__title">{completion.rule.title}</h3>
            <p className="completion-detail__where">
              <strong>{completion.equipment.code}</strong> · {completion.equipment.name}
              {completion.equipment.location ? <> · {completion.equipment.location}</> : null}
            </p>

            <dl className="factlist">
              <Fact label="Equipment type" value={completion.equipment.type.name} />
              <Fact label="Scheduled for" value={longDate(completion.dueDate)} />
              <Fact label="Completed" value={instantLong(completion.completedAt)} />
              <Fact
                label="Punctuality"
                value={completion.onTime
                  ? (completion.daysLate === 0 ? 'On the day it was due' : `${plural(-completion.daysLate, 'day')} early`)
                  : `${plural(completion.daysLate, 'day')} late`}
                tone={completion.onTime ? 'good' : 'warn'}
              />
              <Fact label="Carried out by" value={completion.employee.name} />
              <Fact label="Frequency at the time" value={cadence(completion.rule.intervalValue, completion.rule.intervalUnit)} />
            </dl>

            {completion.comment ? (
              <div className="completion-detail__comment">
                <span className="completion-detail__comment-label"><Icon name="comment" size={13} /> Note from the field</span>
                <p>{completion.comment}</p>
              </div>
            ) : (
              <p className="completion-detail__nocomment">No comment was left.</p>
            )}

            {completion.rule.instructions ? (
              <details className="completion-detail__instructions">
                <summary>Instructions as they stood at the time</summary>
                <p>{completion.rule.instructions}</p>
              </details>
            ) : null}

            <p className="completion-detail__immutable">
              <Icon name="lock" size={12} /> This record is permanent. It keeps the equipment and maintenance details as
              they were on the day, whatever has changed since.
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className={`factlist__item${tone ? ` is-${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
