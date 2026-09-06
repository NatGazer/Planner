import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';

interface Shell {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
}

function FieldShell({ id, label, hint, error, required, className, children }: Shell & { id: string; children: ReactNode }) {
  return (
    <div className={`field${error ? ' field--error' : ''}${className ? ` ${className}` : ''}`}>
      {label ? (
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? <span className="field__required" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {children}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="error"
            className="field__error"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Icon name="alert" size={13} /> {error}
          </motion.p>
        ) : hint ? (
          <motion.p key="hint" className="field__hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>, Shell {}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, required, className, ...rest }, ref,
) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input ref={ref} id={id} className="input" aria-invalid={!!error} required={required} {...rest} />
    </FieldShell>
  );
});

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>, Shell {}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, required, className, rows = 4, ...rest }, ref,
) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea ref={ref} id={id} rows={rows} className="input input--area" aria-invalid={!!error} required={required} {...rest} />
    </FieldShell>
  );
});

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>, Shell {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, required, className, options, placeholder, ...rest }, ref,
) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className="select-wrap">
        <select ref={ref} id={id} className="input input--select" aria-invalid={!!error} required={required} {...rest}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
        <Icon name="chevronDown" size={16} className="select-wrap__chevron" />
      </div>
    </FieldShell>
  );
});

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

/** The knob slides on a spring; the track cross-fades. */
export function Switch({ checked, onChange, label, description, disabled, id }: SwitchProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={`switch-row${disabled ? ' is-disabled' : ''}`}>
      <div className="switch-row__text">
        <label htmlFor={inputId} className="switch-row__label">{label}</label>
        {description ? <p className="switch-row__description">{description}</p> : null}
      </div>
      <button
        type="button"
        id={inputId}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <motion.span
          className="switch__knob"
          layout
          transition={{ type: 'spring', stiffness: 620, damping: 34, mass: 0.6 }}
        />
      </button>
    </div>
  );
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; count?: number; tone?: string }[];
  ariaLabel: string;
  className?: string;
  layoutId?: string;
}

/**
 * The selected pill is one shared element that slides between options, which
 * reads as a single object moving rather than two separate fades.
 */
export function Segmented<T extends string>({ value, onChange, options, ariaLabel, className, layoutId = 'segmented' }: SegmentedProps<T>) {
  return (
    <div className={`segmented${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`segmented__option${selected ? ' is-selected' : ''}${o.tone ? ` segmented__option--${o.tone}` : ''}`}
            onClick={() => onChange(o.value)}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                className="segmented__pill"
                transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.7 }}
              />
            ) : null}
            <span className="segmented__label">{o.label}</span>
            {o.count !== undefined ? <span className="segmented__count">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
