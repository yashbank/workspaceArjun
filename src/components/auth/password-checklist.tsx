'use client';

import { Check, X } from 'lucide-react';
import { checkPassword } from '@/lib/password-policy';

/**
 * Live password-requirements checklist. Renders nothing until the user starts
 * typing, then shows each policy rule with a pass/fail indicator so the
 * requirements are clear before submit.
 */
export function PasswordChecklist({ password }: { password: string }) {
  if (!password) return null;
  const checks = checkPassword(password);

  return (
    <ul className="space-y-1.5" aria-label="Password requirements">
      {checks.map((c) => (
        <li
          key={c.id}
          className={`flex items-center gap-2 text-[11px] transition-colors ${
            c.passed ? 'text-emerald-600' : 'text-muted-foreground/60'
          }`}
        >
          {c.passed ? (
            <Check className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <X className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
          )}
          {c.label}
        </li>
      ))}
    </ul>
  );
}
