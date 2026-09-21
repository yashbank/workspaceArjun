'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { addDocumentLinkAction, type AddDocumentState } from '@/app/(mis)/mis/documents/desktop-actions';
import type { OrderOption } from '@/lib/mis/document-library';

import { useT } from '../shell/locale-provider';

/**
 * D13's add panel. A failed add hands back what was typed (React resets a form after an action), because re-typing a
 * link because the network dropped is the most infuriating failure this screen can have. There is no file picker:
 * the MIS holds a LINK to a stored file, not the file itself (F-23), and the panel says so.
 */

const field = 'min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900';

export function DocumentsAddForm({ orders, closeHref }: { orders: OrderOption[]; closeHref: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<AddDocumentState, FormData>(addDocumentLinkAction, { error: null });
  const v = state.values;

  return (
    <section aria-label={t('d13.addTitle')} className="flex min-w-0 flex-col rounded-2xl border border-indigo-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">{t('d13.addTitle')}</h2>
        <Link href={closeHref} aria-label={t('d13.close')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-2xl text-slate-500 hover:bg-slate-100">×</Link>
      </header>
      <form action={action} className="flex flex-col gap-4 px-5 py-4">
        {state.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}

        <div>
          <label htmlFor="d13-order" className="mb-1 block text-sm font-semibold text-slate-800">{t('d13.order')} *</label>
          {/* Keyed on the handed-back choice: a select's default does not survive the form reset that follows a failed action. */}
          <select key={v?.orderId ?? 'none'} id="d13-order" name="orderId" required defaultValue={v?.orderId ?? ''} className={field}>
            <option value="">{t('d13.chooseOrder')}</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="d13-name" className="mb-1 block text-sm font-semibold text-slate-800">{t('d13.name')} *</label>
          <input id="d13-name" name="name" required maxLength={200} defaultValue={v?.name ?? ''} autoComplete="off" className={field} />
        </div>
        <div>
          <label htmlFor="d13-desc" className="mb-1 block text-sm font-semibold text-slate-800">{t('d13.description')}</label>
          <input id="d13-desc" name="description" maxLength={500} defaultValue={v?.description ?? ''} autoComplete="off" className={field} />
        </div>
        <div>
          <label htmlFor="d13-link" className="mb-1 block text-sm font-semibold text-slate-800">{t('d13.link')} *</label>
          <input id="d13-link" name="link" required maxLength={1000} defaultValue={v?.link ?? ''} aria-describedby="d13-link-note" autoComplete="off" spellCheck={false} className={`${field} font-mono`} />
          <p id="d13-link-note" className="mt-1 text-xs text-slate-500">{t('d13.linkNote')}</p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link href={closeHref} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">{t('d13.cancel')}</Link>
          <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{pending ? t('d13.adding') : t('d13.add')}</button>
        </div>
      </form>
    </section>
  );
}
