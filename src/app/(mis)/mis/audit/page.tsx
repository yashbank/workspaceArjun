import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { MisForbiddenError } from '@/server/mis/auth';
import { listAuditPage } from '@/server/mis/audit-list';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';
import { AuditScreen } from '@/components/mis/audit/audit-screen';

type Props = {
  searchParams: Promise<{ q?: string; entity?: string; from?: string; to?: string; page?: string }>;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export default async function AuditPage({ searchParams }: Props) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'settings.read')) throw new MisForbiddenError('settings.read');

  const sp = await searchParams;
  const q = parseSearch(sp.q);
  const entity = sp.entity || '';
  // R3 B39: ignore anything that is not a YYYY-MM-DD date.
  const from = sp.from && DATE_KEY.test(sp.from) && !Number.isNaN(new Date(sp.from).getTime()) ? sp.from : '';
  const to = sp.to && DATE_KEY.test(sp.to) && !Number.isNaN(new Date(sp.to).getTime()) ? sp.to : '';

  const paged = await listAuditPage({ q, entity, from, to, page: sp.page });
  return (
    <AuditScreen
      logs={paged.rows}
      total={paged.total}
      page={clampPage(parsePage(sp.page), paged.total)}
      entities={paged.entities}
      params={{ q, entity, from, to }}
    />
  );
}
