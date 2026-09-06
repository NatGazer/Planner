import { motion } from 'framer-motion';
import { LANGUAGES, useLanguage, type Lang } from '../lib/i18n';
import { usePrefersReducedMotion } from '../anim/hooks';
import { spring } from '../anim/motion';
import { Icon } from './Icon';

/**
 * Choosing a language, in two shapes for two places.
 *
 * `segmented` is the compact one — three codes with a pill that slides between
 * them, for a desktop menu or the foot of a sign-in card.
 *
 * `list` is for a phone: full-width rows, each at least 52px tall, showing the
 * language's own name. Somebody who cannot read the current language has to be
 * able to find their own, so every option is always visible — no dropdown that
 * says "Language" in a language they do not speak.
 *
 * Both label each option in its own language: "Português", never "Portuguese".
 */
export function LanguagePicker({ variant = 'segmented', onPicked }: {
  variant?: 'segmented' | 'list';
  onPicked?: (lang: Lang) => void;
}) {
  const { lang, setLang, t } = useLanguage();
  const reduced = usePrefersReducedMotion();

  const choose = (next: Lang) => {
    setLang(next);
    onPicked?.(next);
  };

  if (variant === 'list') {
    return (
      <div className="langpick" role="radiogroup" aria-label={t('common.language')}>
        {LANGUAGES.map((option) => {
          const active = option.code === lang;
          return (
            <motion.button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={active}
              lang={option.tag}
              className={`langpick__row${active ? ' is-active' : ''}`}
              onClick={() => choose(option.code)}
              whileTap={reduced ? undefined : { scale: 0.985 }}
              transition={spring.snap}
            >
              <span className="langpick__code" aria-hidden="true">{option.short}</span>
              <span className="langpick__name">{option.label}</span>
              <span className="langpick__tick" aria-hidden="true">
                {active ? <Icon name="check" size={16} /> : null}
              </span>
            </motion.button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="langseg" role="radiogroup" aria-label={t('common.language')}>
      {LANGUAGES.map((option) => {
        const active = option.code === lang;
        return (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={active}
            // The visible text is a code; the accessible name is the language.
            aria-label={option.label}
            className={`langseg__opt${active ? ' is-active' : ''}`}
            onClick={() => choose(option.code)}
          >
            {active ? (
              <motion.span
                layoutId="langseg-pill"
                className="langseg__pill"
                transition={reduced ? { duration: 0 } : spring.snap}
              />
            ) : null}
            <span className="langseg__label" lang={option.tag}>{option.short}</span>
          </button>
        );
      })}
    </div>
  );
}
