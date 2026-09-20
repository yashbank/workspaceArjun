// Print layout — no nav shell, white background, A4 only
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-root bg-white min-h-screen">
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
