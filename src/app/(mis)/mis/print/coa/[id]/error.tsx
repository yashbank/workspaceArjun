'use client';

/**
 * R3-QCR B75: a QC load failure must never print as "No quality checks recorded": that reads as a
 * clean certificate. The page lets the error through and this boundary says so plainly.
 */
export default function CoaError({ error }: { error: Error & { digest?: string } }) {
  const forbidden = error.name === 'MisForbiddenError' || error.digest === 'MIS_FORBIDDEN';
  return (
    <div role="alert" className="mx-auto max-w-[794px] p-8 font-sans text-sm text-red-800">
      <h1 className="text-lg font-bold">{forbidden ? 'You do not have access to this certificate' : 'Could not load QC data — do not issue this certificate'}</h1>
      {!forbidden && <p className="mt-2 text-gray-600">Reload the page to try again. If it keeps failing, tell the administrator.</p>}
    </div>
  );
}
