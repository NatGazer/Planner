import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { Icon } from '@ui/components/Icon';
import { LanguagePicker } from '@ui/components/LanguagePicker';
import { useT } from '@ui/lib/i18n';
import { useTheme } from '@ui/lib/theme';
import { initials } from '@ui/lib/format';

export interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
  name: string;
  email: string;
  onSignOut: () => void;
}

/**
 * Everything about *this person on this phone*, in one bottom sheet: who is
 * signed in, what language they read, how bright the screen is, and the way
 * out.
 *
 * It exists because of language. A picker hidden behind an icon is useless to
 * the one person who needs it — somebody holding a phone in a language they do
 * not read. So the header shows a globe, the sheet lists all three languages
 * by their own names, and every row is a 56px target for a gloved thumb.
 *
 * Signing out moved in here too. It used to be a single tap on the avatar,
 * with no confirmation, next to the refresh button.
 */
export function AccountSheet({ open, onClose, name, email, onSignOut }: AccountSheetProps) {
  const t = useT();
  const { resolved, setMode } = useTheme();

  return (
    <Sheet open={open} onClose={onClose} placement="bottom" size="sm" title={t('worker.account.title')}>
      <div className="w-account">
        <div className="w-account__who">
          <span className="w-avatar w-avatar--lg" aria-hidden="true">{initials(name)}</span>
          <span className="w-account__names">
            <strong>{name}</strong>
            <span>{email}</span>
          </span>
        </div>

        <section className="w-account__group" aria-labelledby="acct-lang">
          <h3 className="w-account__label" id="acct-lang">
            <Icon name="globe" size={14} /> {t('common.language')}
          </h3>
          <LanguagePicker variant="list" />
        </section>

        <section className="w-account__group" aria-labelledby="acct-theme">
          <h3 className="w-account__label" id="acct-theme">
            <Icon name={resolved === 'dark' ? 'moon' : 'sun'} size={14} /> {t('common.appearance')}
          </h3>
          <div className="w-account__themes" role="radiogroup" aria-label={t('common.appearance')}>
            {(['dark', 'light'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={resolved === mode}
                className={`w-account__theme${resolved === mode ? ' is-active' : ''}`}
                onClick={() => setMode(mode)}
              >
                <Icon name={mode === 'dark' ? 'moon' : 'sun'} size={16} />
                {t(mode === 'dark' ? 'theme.dark' : 'theme.light')}
              </button>
            ))}
          </div>
        </section>

        <Button variant="ghost" icon="signOut" block onClick={onSignOut}>
          {t('common.signOut')}
        </Button>
      </div>
    </Sheet>
  );
}
