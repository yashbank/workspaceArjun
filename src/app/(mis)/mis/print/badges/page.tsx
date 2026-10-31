import { requireMisAccess } from '@/server/mis/guard';
import { PrintButton } from '@/components/mis/print/print-button';
import { listEmployeeRoster } from '@/server/mis/employee';
import Link from 'next/link';
import QRCode from 'qrcode';

/** Several badges fit on one A4 page (15mm margin, this layout's 2-column grid); forcing a
 *  break after every group this size keeps a page from running a badge row over onto the next
 *  sheet, the same `break-after-page` technique `payslips/page.tsx` uses per-employee — here
 *  applied per PAGE of badges instead of per badge, since many badges share a page. */
const BADGES_PER_PAGE = 8;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default async function BulkBadgesPage() {
  // Same door the single badge page opens with (requireMisAccess), and the same read
  // permission getEmployee() enforces for it (employees.read, via listEmployeeRoster) — this
  // is deliberately factory-wide (D4 pool scope would otherwise hand a manager-of-nobody an
  // empty sheet), exactly like the kiosk roster listEmployeeRoster already serves.
  await requireMisAccess();
  const roster = await listEmployeeRoster();
  const employees = roster.filter((e) => e.isActive && !e.deletedAt);

  const badges = await Promise.all(
    employees.map(async (e) => ({
      ...e,
      // The kiosk scanner matches the raw decoded string against this exact value
      // (see print/badge/[id]/page.tsx) — never JSON, never a URL.
      qrSvg: await QRCode.toString(e.employeeCode, { type: 'svg', margin: 0 }),
    })),
  );
  const pages = chunk(badges, BADGES_PER_PAGE);

  return (
    <div className="p-8 max-w-[794px] mx-auto font-sans">
      <div className="no-print mb-6 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {employees.length} active badge{employees.length === 1 ? '' : 's'}. Each prints at credit-card size
          (85.6mm × 54mm); choose “Save as PDF” to download them as one file.
        </p>
        <div className="flex gap-3">
          {employees.length > 0 && <PrintButton />}
          <Link href="/mis/employees" className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-base hover:bg-gray-50">
            ← Back to Employees
          </Link>
        </div>
      </div>

      {employees.length === 0 ? (
        <p className="py-16 text-center text-gray-500">No active employees to badge.</p>
      ) : (
        pages.map((page, pageIndex) => (
          <div
            key={pageIndex}
            className={`grid grid-cols-2 gap-6 ${pageIndex < pages.length - 1 ? 'break-after-page' : ''}`}
          >
            {page.map((employee) => (
              <div
                key={employee.id}
                className="break-inside-avoid w-[342px] h-[216px] border-2 border-gray-800 rounded-xl overflow-hidden bg-gradient-to-br from-blue-700 to-blue-900 text-white flex p-4 gap-4 shadow-2xl"
              >
                <div
                  className="w-20 h-20 bg-white rounded-lg flex items-center justify-center flex-shrink-0 self-center [&_svg]:w-16 [&_svg]:h-16"
                  dangerouslySetInnerHTML={{ __html: employee.qrSvg }}
                />
                <div className="flex flex-col justify-center flex-1 min-w-0">
                  <p className="text-blue-200 text-xs uppercase tracking-widest mb-1">Bhaskar Paper Products</p>
                  <p className="font-bold text-lg leading-tight truncate">{employee.name}</p>
                  {employee.nameHi && <p className="text-blue-200 text-sm leading-tight">{employee.nameHi}</p>}
                  <div className="mt-2 pt-2 border-t border-blue-500">
                    <p className="font-mono text-sm font-bold">{employee.employeeCode}</p>
                    <p className="text-blue-200 text-xs capitalize">{employee.role?.toLowerCase().replace(/_/g, ' ')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
