'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ChangeEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Already translated by the caller — components never hold English. */
  label: string;
  error?: string | null;
  hint?: string;
};

/**
 * The shared field frame: label above, control, error below.
 *
 * 48px tall and 16px text. Anything smaller and iOS zooms the viewport on
 * focus, which on a 360px screen throws the layout sideways.
 */
function Field({
  label,
  error,
  hint,
  id,
  className,
  type,
  ...rest
}: BaseProps & { type: string; id: string }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && errorId, hint && hintId) || undefined}
        className={cn(
          'min-h-12 w-full rounded-lg border bg-white px-3 text-base text-slate-900',
          'placeholder:text-slate-400 focus:outline-2 focus:outline-offset-0',
          error
            ? 'border-red-500 focus:outline-red-500'
            : 'border-slate-300 focus:outline-slate-900',
          'disabled:bg-slate-50 disabled:text-slate-500',
          className,
        )}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-sm text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = BaseProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, _ref) {
  const generated = useId();
  return <Field {...props} type="text" id={props.id ?? generated} />;
});

/**
 * Numbers on a factory floor are counts and weights, never text.
 *
 * inputMode="decimal" is what makes a phone show the number pad; type="number"
 * alone does not on every Android keyboard.
 */
export const NumberInput = forwardRef<HTMLInputElement, InputProps>(function NumberInput(
  props,
  _ref,
) {
  const generated = useId();
  return <Field inputMode="decimal" {...props} type="number" id={props.id ?? generated} />;
});

export const DateInput = forwardRef<HTMLInputElement, InputProps>(function DateInput(props, _ref) {
  const generated = useId();
  return <Field {...props} type="date" id={props.id ?? generated} />;
});

export const TimeInput = forwardRef<HTMLInputElement, InputProps>(function TimeInput(props, _ref) {
  const generated = useId();
  return <Field {...props} type="time" id={props.id ?? generated} />;
});

// ── SelectField ──────────────────────────────────────────────────────────────
type SelectProps = {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  error?: string | null;
  hint?: string;
};

export function Select({ label, value, onChange, children, error, hint }: SelectProps) {
  const generatedId = useId();
  const id = generatedId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-2 focus:outline-offset-0 focus:outline-slate-900"
      >
        {children}
      </select>
      {hint && !error && <p className="text-sm text-slate-500">{hint}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
