import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { PrintButton } from '@/components/mis/print/print-button';
import { getEmployee } from '@/server/mis/employee';
import { notFound } from 'next/navigation';

export default async function WorkerBadgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const emp = employee as any;

  // Simple QR code as SVG data (encode the employee ID as a URL)
  const qrData = `/mis/kiosk?emp=${emp.employeeCode}`;

  return (
    <div className="p-8 max-w-[794px] mx-auto font-sans">
      {/* Print button */}
      <div className="no-print mb-6 flex gap-3">
        <PrintButton />
        <a href="/mis/employees" className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
          ← Back to Employees
        </a>
      </div>

      {/* Badge — credit card size 85.6mm × 54mm scaled to screen */}
      <div className="w-[342px] h-[216px] border-2 border-gray-800 rounded-xl overflow-hidden bg-gradient-to-br from-blue-700 to-blue-900 text-white flex p-4 gap-4 shadow-2xl">
        {/* Left: QR code placeholder */}
        <div className="w-20 h-20 bg-white rounded-lg flex items-center justify-center flex-shrink-0 self-center">
          {/* SVG QR placeholder — real implementation would use a QR library */}
          <svg width="64" height="64" viewBox="0 0 64 64" className="text-gray-900">
            <text x="32" y="38" textAnchor="middle" fontSize="8" fill="currentColor" fontFamily="monospace">{emp.employeeCode}</text>
            <rect x="4" y="4" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3"/>
            <rect x="8" y="8" width="10" height="10" fill="currentColor"/>
            <rect x="42" y="4" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3"/>
            <rect x="46" y="8" width="10" height="10" fill="currentColor"/>
            <rect x="4" y="42" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3"/>
            <rect x="8" y="46" width="10" height="10" fill="currentColor"/>
          </svg>
        </div>

        {/* Right: Employee info */}
        <div className="flex flex-col justify-center flex-1 min-w-0">
          <p className="text-blue-200 text-xs uppercase tracking-widest mb-1">Bhaskar Paper Products</p>
          <p className="font-bold text-lg leading-tight truncate">{emp.name}</p>
          {emp.nameHi && <p className="text-blue-200 text-sm leading-tight">{emp.nameHi}</p>}
          <div className="mt-2 pt-2 border-t border-blue-500">
            <p className="font-mono text-sm font-bold">{emp.employeeCode}</p>
            <p className="text-blue-200 text-xs capitalize">{emp.role?.toLowerCase().replace(/_/g, ' ')}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-4 no-print">
        Print at credit-card size (85.6mm × 54mm). Cut along border.
      </p>
    </div>
  );
}
