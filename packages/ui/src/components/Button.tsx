import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';
import { usePrefersReducedMotion } from '../anim/hooks';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconAfter?: IconName;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
}

/**
 * Press states are physical: the button compresses towards the pointer and
 * springs back. Scale is the only property that animates, so a press costs
 * nothing but a composite.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconAfter, loading, block, children, className, disabled, ...rest },
  ref,
) {
  const reduced = usePrefersReducedMotion();
  const classes = [
    'btn', `btn--${variant}`, `btn--${size}`,
    block ? 'btn--block' : '',
    loading ? 'is-loading' : '',
    !children ? 'btn--icon-only' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <motion.button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled || loading}
      whileHover={reduced || disabled ? undefined : { scale: 1.022 }}
      whileTap={reduced || disabled ? undefined : { scale: 0.968 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.55 }}
      {...rest}
    >
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : size === 'lg' || size === 'xl' ? 20 : 17} /> : null}
      {children ? <span className="btn__label">{children}</span> : null}
      {iconAfter && !loading ? <Icon name={iconAfter} size={size === 'sm' ? 15 : 17} /> : null}
    </motion.button>
  );
});
