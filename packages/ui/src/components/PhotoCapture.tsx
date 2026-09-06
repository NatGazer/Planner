import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { useT } from '../lib/i18n';
import { usePrefersReducedMotion } from '../anim/hooks';

export interface CapturedPhoto {
  photoId: string;
  previewUrl: string;
  byteSize: number;
}

export interface PhotoCaptureProps {
  value: CapturedPhoto | null;
  onChange: (photo: CapturedPhoto | null) => void;
  disabled?: boolean;
  /** Already-translated text: the screen owns the wording, this owns the layout. */
  label?: string;
  hint?: string;
  error?: string | null;
}

const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.82;

/**
 * Downscale before upload. A modern phone camera produces a 6 MB image that
 * carries no more useful evidence than a 1800px one, and a warehouse
 * connection makes the difference painfully obvious.
 * If anything in the pipeline is unavailable the original file is sent as-is.
 */
async function shrink(file: File): Promise<Blob> {
  if (!('createImageBitmap' in window) || typeof OffscreenCanvas === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size < 1_500_000) { bitmap.close(); return file; }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    return blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function PhotoCapture({ value, onChange, disabled, label, hint, error }: PhotoCaptureProps) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  const accept = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    setBusy(true);
    try {
      const blob = await shrink(file);
      const result = await api.upload<{ photoId: string; byteSize: number }>('/api/photos', blob, 'photo');
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      onChange({ photoId: result.photoId, previewUrl: objectUrl.current, byteSize: result.byteSize });
    } catch (err) {
      setLocalError(errorMessage(t, err, 'ui.photo.failed'));
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (libraryRef.current) libraryRef.current.value = '';
    }
  }, [onChange, t]);

  const clear = useCallback(() => {
    if (value) void api.del(`/api/worker/photos/${value.photoId}`).catch(() => { /* a stray draft is harmless */ });
    if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
    onChange(null);
  }, [value, onChange]);

  const shown = error ?? localError;

  return (
    <div className={`capture${shown ? ' capture--error' : ''}`}>
      <div className="capture__head">
        <span className="capture__label">{label ?? t('ui.photo.defaultLabel')}</span>
        <span className="capture__required">{t('ui.field.required')}</span>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => void accept(e.target.files?.[0])} disabled={disabled || busy} />
      <input ref={libraryRef} type="file" accept="image/*" hidden
        onChange={(e) => void accept(e.target.files?.[0])} disabled={disabled || busy} />

      <AnimatePresence mode="wait" initial={false}>
        {value ? (
          <motion.div
            key="preview"
            className="capture__preview"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, rotateX: -14 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <img src={value.previewUrl} alt={t('ui.photo.previewAlt')} />
            <motion.span
              className="capture__check"
              initial={reduced ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.12 }}
            >
              <Icon name="check" size={16} strokeWidth={2.6} />
            </motion.span>
            <button type="button" className="capture__retake" onClick={clear} disabled={disabled || busy}>
              <Icon name="refresh" size={15} /> {t('ui.photo.retake')}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="prompt"
            className="capture__prompt"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.14 } }}
          >
            <motion.button
              type="button"
              className="capture__primary"
              onClick={() => cameraRef.current?.click()}
              disabled={disabled || busy}
              whileTap={reduced ? undefined : { scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            >
              {busy ? <span className="btn__spinner" /> : <Icon name="camera" size={26} />}
              <span>{busy ? t('ui.photo.uploading') : t('ui.photo.take')}</span>
            </motion.button>
            <button type="button" className="capture__secondary" onClick={() => libraryRef.current?.click()} disabled={disabled || busy}>
              <Icon name="image" size={15} /> {t('ui.photo.choose')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {shown ? (
          <motion.p className="capture__error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Icon name="alert" size={13} /> {shown}
          </motion.p>
        ) : hint ? (
          <motion.p className="capture__hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{hint}</motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
