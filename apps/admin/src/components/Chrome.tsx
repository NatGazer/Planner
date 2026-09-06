import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useSession } from '@ui/lib/session';
import { useTheme } from '@ui/lib/theme';
import { useT, type StringKey } from '@ui/lib/i18n';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { LanguagePicker } from '@ui/components/LanguagePicker';
import { initials, longDate } from '@ui/lib/format';
import { spring } from '@ui/anim/motion';
import { useMediaQuery, usePrefersReducedMotion } from '@ui/anim/hooks';

// The list is module-level, so it holds *keys*; the words are resolved with
// `t` inside the component, where the language is known.
interface NavItem { path: string; labelKey: StringKey; icon: IconName; hintKey: StringKey }

const NAV: NavItem[] = [
  { path: '/', labelKey: 'admin.nav.overview', icon: 'dashboard', hintKey: 'admin.nav.overview.hint' },
  { path: '/tasks', labelKey: 'admin.nav.outstanding', icon: 'tasks', hintKey: 'admin.nav.outstanding.hint' },
  { path: '/equipment', labelKey: 'admin.nav.equipment', icon: 'equipment', hintKey: 'admin.nav.equipment.hint' },
  { path: '/rules', labelKey: 'admin.nav.rules', icon: 'rules', hintKey: 'admin.nav.rules.hint' },
  { path: '/types', labelKey: 'admin.nav.types', icon: 'types', hintKey: 'admin.nav.types.hint' },
  { path: '/history', labelKey: 'admin.nav.history', icon: 'history', hintKey: 'admin.nav.history.hint' },
  { path: '/activity', labelKey: 'admin.nav.activity', icon: 'activity', hintKey: 'admin.nav.activity.hint' },
];

const isActive = (path: string, current: string) =>
  path === '/' ? current === '/' : current === path || current.startsWith(`${path}/`);

/**
 * The application frame. A rail on desktop, a bottom bar on narrow screens.
 * The active indicator is one shared element that slides between items, so
 * navigation reads as one object moving rather than two things blinking.
 */
export function Chrome({ children }: { children: ReactNode }) {
  const t = useT();
  const { path, navigate } = useRouter();
  const { employee, today, timezone, signOut } = useSession();
  const { resolved, toggle } = useTheme();
  const compact = useMediaQuery('(max-width: 900px)');
  const reduced = usePrefersReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (
    <nav className={compact ? 'navbar' : 'rail__nav'} aria-label={t('admin.nav.sections')}>
      {NAV.map((item) => {
        const active = isActive(item.path, path);
        const label = t(item.labelKey);
        return (
          <button
            key={item.path}
            type="button"
            className={`nav-item${active ? ' is-active' : ''}`}
            onClick={() => navigate(item.path)}
            aria-current={active ? 'page' : undefined}
            title={compact ? label : t(item.hintKey)}
          >
            {active ? (
              <motion.span
                layoutId="nav-indicator"
                className="nav-item__indicator"
                transition={reduced ? { duration: 0 } : spring.morph}
              />
            ) : null}
            <span className="nav-item__icon"><Icon name={item.icon} size={compact ? 21 : 19} /></span>
            <span className="nav-item__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className={`shell${compact ? ' shell--compact' : ''}`}>
      {compact ? null : (
        <aside className="rail">
          <button type="button" className="brand" onClick={() => navigate('/')}>
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
                <path d="M8 16.6l5 5L24 10.4" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="brand__text">
              <span className="brand__title">Maintenance</span>
              <span className="brand__sub">Control</span>
            </span>
          </button>
          {nav}
          <div className="rail__foot">
            <button type="button" className="theme-toggle" onClick={toggle} aria-label={t(resolved === 'dark' ? 'admin.nav.theme.toLight' : 'admin.nav.theme.toDark')}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={resolved}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, rotate: -70, scale: 0.6 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, rotate: 70, scale: 0.6 }}
                  transition={spring.snap}
                  style={{ display: 'grid', placeItems: 'center' }}
                >
                  <Icon name={resolved === 'dark' ? 'moon' : 'sun'} size={17} />
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </aside>
      )}

      <div className="shell__body">
        <header className="topbar">
          <div className="topbar__date">
            <span className="topbar__today">{today ? longDate(today) : ''}</span>
            <span className="topbar__zone" title={t('admin.nav.timezone.hint')}>
              <Icon name="clock" size={12} /> {timezone}
            </span>
          </div>

          <div className="topbar__right">
            {compact ? (
              <button type="button" className="theme-toggle" onClick={toggle} aria-label={t('admin.nav.theme.toggle')}>
                <Icon name={resolved === 'dark' ? 'moon' : 'sun'} size={17} />
              </button>
            ) : null}
            <div className="account">
              <button type="button" className="account__button" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
                <span className="account__avatar">{initials(employee?.name ?? '')}</span>
                <span className="account__meta">
                  <span className="account__name">{employee?.name}</span>
                  <span className="account__role">{t('admin.nav.role')}</span>
                </span>
                <Icon name="chevronDown" size={14} className="account__chevron" />
              </button>
              <AnimatePresence>
                {menuOpen ? (
                  <>
                    <button type="button" className="account__scrim" aria-label={t('admin.nav.closeMenu')} onClick={() => setMenuOpen(false)} />
                    <motion.div
                      className="account__menu"
                      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96, filter: 'blur(6px)' }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97, filter: 'blur(4px)' }}
                      transition={spring.snap}
                    >
                      <p className="account__email">{employee?.email}</p>

                      <div className="account__row">
                        <span className="account__rowLabel">
                          <Icon name="globe" size={13} /> {t('common.language')}
                        </span>
                        <LanguagePicker />
                      </div>

                      <Button variant="ghost" icon="signOut" block onClick={() => { setMenuOpen(false); void signOut(); }}>
                        {t('common.signOut')}
                      </Button>
                    </motion.div>
                  </>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="shell__scroll">{children}</div>
        {compact ? nav : null}
      </div>
    </div>
  );
}
