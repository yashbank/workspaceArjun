import { themeCss } from '@/lib/mis/theme';
import { getOrgTheme } from '@/server/mis/theme';

// Print layout — no nav shell, white background, A4 only. R8 T3: the org theme (palette, fonts) also drives printouts and badges.
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const css = themeCss(await getOrgTheme(), '.print-root');
  return (
    <div className="print-root bg-white min-h-screen">
      {css && <style>{css}</style>}
      <style>{`
        @media print {
          body { margin: 0; }
          .print-root { padding: 0; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>
      {children}
    </div>
  );
}
