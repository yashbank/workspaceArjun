"use client";
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
    >
      Print
    </button>
  );
}
