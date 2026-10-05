import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { PrintButton } from '@/components/mis/print/print-button';
import { getEmployee } from '@/server/mis/employee';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';

export default async function WorkerBadgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const employee = await getEmployee(id);
  if (!employee) notFound();

  // The kiosk scanner (CameraX + ML Kit) matches the raw decoded string against
  // `badgeCode` — the same `employeeCode` value the API exposes as `badgeCode`
  // (kiosk-device.ts). The QR must encode exactly this, nothing else: not JSON,
  // not a URL (see docs/ANDROID_KIOSK_BACKEND_ALIGNMENT.md §8).
  const qrSvg = await QRCode.toString(employee.employeeCode, { type: 'svg', margin: 0 });

  return (
    <div className="p-8 max-w-[794px] mx-auto font-sans">
      {/* Print button */}
      <div className="no-print mb-6 flex gap-3">
        <PrintButton />
        <Link href="/mis/employees" className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-base hover:bg-gray-50">
          ← Back to Employees
        </Link>
      </div>

      {/* Badge — credit card size 85.6mm × 54mm scaled to screen */}
      <div className="w-[342px] h-[216px] border-2 border-gray-800 rounded-xl overflow-hidden bg-gradient-to-br from-blue-700 to-blue-900 text-white flex p-4 gap-4 shadow-2xl">
        {/* Left: real, scannable QR code encoding the plain badgeCode */}
        <div
          className="w-20 h-20 bg-white rounded-lg flex items-center justify-center flex-shrink-0 self-center [&_svg]:w-16 [&_svg]:h-16"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        {/* Right: Employee info */}
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

      <p className="text-xs text-gray-500 mt-4 no-print">
        Print at credit-card size (85.6mm × 54mm). Cut along border.
      </p>
    </div>
  );
}
