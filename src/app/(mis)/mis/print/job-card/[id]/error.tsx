'use client';

/**
 * R3 B125: a batch record that fails to load must never print as a partial or zeroed document.
 */
export default function JobCardPrintError() {
  return (
    <div role="alert" className="mx-auto max-w-[794px] p-8 font-sans text-sm text-gray-900">
      <h1 className="text-lg font-bold">Could not load the batch record — do not print</h1>
      <p className="mt-2 text-gray-600">
        Something failed while loading this job card, so any print would be incomplete. Reload the page; if it keeps
        failing, tell an admin.
      </p>
    </div>
  );
}
