'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/mis/kit/button';
import { Card } from '@/components/mis/kit/card';
import { Input } from '@/components/mis/kit/input';
import { changeOwnEmailAction, changeOwnPasswordAction } from '@/app/(mis)/mis/me/account/actions';

const passwordClass =
  'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-indigo-500';

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <input type="password" className={passwordClass} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function AccountScreen({ email, mustChange }: { email: string; mustChange: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const savePassword = () =>
    start(async () => {
      const r = await changeOwnPasswordAction(current, next, confirm);
      if (!r.ok) return setPwMsg({ ok: false, text: r.detail });
      setCurrent(''); setNext(''); setConfirm('');
      setPwMsg({ ok: true, text: 'Password changed.' });
    });

  const saveEmail = () =>
    start(async () => {
      const r = await changeOwnEmailAction(newEmail);
      if (!r.ok) return setEmailMsg({ ok: false, text: r.detail });
      setNewEmail('');
      setEmailMsg({
        ok: true,
        text: r.value.status === 'changed' ? `Email changed to ${r.value.email}.` : `Check ${r.value.email} for a confirmation link. Your email changes once you confirm.`,
      });
    });

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">
      <h1 className="text-2xl font-bold text-slate-900">My account</h1>
      {mustChange && (
        <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You are using a temporary password. Please set your own below.
        </section>
      )}

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Change password</h2>
        <div className="mt-3 flex flex-col gap-3">
          <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <p className="text-xs text-slate-500">At least 8 characters with upper and lower case, a number and a symbol.</p>
          {pwMsg && <p role="status" className={pwMsg.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}>{pwMsg.text}</p>}
          <Button onClick={savePassword} disabled={pending || !current || !next || !confirm}>
            {pending ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Change email</h2>
        <p className="mt-1 text-sm text-slate-500">Signed in as {email}</p>
        <div className="mt-3 flex flex-col gap-3">
          <Input label="New email" inputMode="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" />
          {emailMsg && <p role="status" className={emailMsg.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}>{emailMsg.text}</p>}
          <Button onClick={saveEmail} disabled={pending || !newEmail}>
            {pending ? 'Saving…' : 'Change email'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
