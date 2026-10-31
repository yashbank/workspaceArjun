import Link from 'next/link';

import { PageBack } from '@/components/mis/common/page-back';

import { HeaderCard, HomeStack, InfoCard, SectionLabel } from '../home/cards';

/**
 * R2-38 — a Supervisor cannot issue stock; the Store Guy does. Instead of a 403 or a 500 they get this: what the rule
 * is and the one tap that does what they came for.
 */
export const SUPERVISOR_CANNOT_ISSUE = 'Supervisors cannot issue stock. Raise a Material Request instead — the Store Guy will pick it and hand it over.';

export function RaiseRequestInstead({ header }: { header: { title: string; meta: string } }) {
  return (
    <HomeStack>
      {/* R2-358: the screen is a redirect, not a dead end: a way back plus the one action that does the job. */}
      <PageBack href="/mis" label="Home" />
      <HeaderCard title={header.title} meta={header.meta} />
      <InfoCard>
        <SectionLabel>You cannot issue stock</SectionLabel>
        <p className="mt-1 font-semibold text-slate-900">{SUPERVISOR_CANNOT_ISSUE}</p>
        <Link
          href="/mis/store/requests/new"
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-600 px-4 text-base font-semibold text-white"
        >
          Raise a Material Request
        </Link>
        <Link href="/mis/store/requests" className="mt-1 inline-flex min-h-11 items-center text-sm text-indigo-600 underline">
          See my requests
        </Link>
      </InfoCard>
    </HomeStack>
  );
}
