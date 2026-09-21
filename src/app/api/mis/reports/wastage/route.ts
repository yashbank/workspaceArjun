import { NextResponse } from 'next/server';

import { WASTAGE_CSV_PARTS, wastageCsv, wastageFilename, type WastageCsvPart } from '@/lib/mis/wastage-csv';
import { getWastageReport } from '@/server/mis/reports';

/**
 * D7's Export CSV. Thin: parse, call the SAME server function the screen calls, lay it out as CSV.
 * `getWastageReport` holds the gate (`reports.read`); this only maps its refusals to a status.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const part = (WASTAGE_CSV_PARTS as readonly string[]).includes(url.searchParams.get('part') ?? '')
      ? (url.searchParams.get('part') as WastageCsvPart)
      : 'weekly';
    const report = await getWastageReport({
      weeks: Number(url.searchParams.get('weeks')),
      machineId: url.searchParams.get('machine'),
      unit: url.searchParams.get('unit'),
    });
    return new NextResponse(wastageCsv(report, part), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${wastageFilename(report, part)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const name = (err as Error)?.name;
    const message = (err as Error)?.message;
    if (name === 'MisForbiddenError' || message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Could not build the export' }, { status: 500 });
  }
}
