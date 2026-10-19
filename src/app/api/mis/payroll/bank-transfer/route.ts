import { NextResponse } from 'next/server';

import { buildBankTransferCsv } from '@/server/mis/payroll-ledger';

/**
 * R2-110: the month's bank transfer file (account no., IFSC, amount) as CSV. Thin: parse, call the
 * server function (Owner-only `wages.read` gate + audit), map refusals to a status. Employees left
 * out for missing bank details are counted in `X-Skipped-Count`; the payroll screen lists them.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { filename, csv, skipped } = await buildBankTransferCsv(Number(url.searchParams.get('year')), Number(url.searchParams.get('month')));
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Skipped-Count': String(skipped.length),
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
