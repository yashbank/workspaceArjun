import { NextResponse } from 'next/server';

import { buildWageLedgerCsv } from '@/server/mis/payroll-ledger';

/**
 * R2-110: the month's wage ledger (rupee figures) as CSV. Thin: parse, call the server function
 * (which holds the Owner-only `wages.read` gate and the audit), map refusals to a status.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { filename, csv } = await buildWageLedgerCsv(Number(url.searchParams.get('year')), Number(url.searchParams.get('month')));
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const name = (err as Error)?.name;
    const message = (err as Error)?.message;
    if (name === 'MisForbiddenError' || message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (message === 'Choose a real month to export.') return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: 'Could not build the export' }, { status: 500 });
  }
}
