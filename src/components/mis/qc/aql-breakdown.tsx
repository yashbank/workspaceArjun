import type { AqlResult } from '@/lib/mis/aql';
import { StatusBadge } from '@/components/mis/kit/status-badge';

const SEVERITY_LABEL: Record<AqlResult['breakdown'][number]['severity'], string> = {
  CRITICAL: 'Critical',
  MAJOR: 'Major',
  MINOR: 'Minor',
};

/**
 * The accept/reject card for one scored AQL sample.
 *
 * Tones follow MIS_UI_SPEC §4.2: reject reads as Failure (red), accept as
 * Healthy (green). Every line always shows found/max, not just the ones that
 * failed — a QC reader needs the whole picture, not only the bad news.
 */
export function AqlBreakdown({ result }: { result: AqlResult }) {
  const isReject = result.decision === 'REJECT';

  return (
    <div
      className={
        isReject
          ? 'rounded-2xl border border-red-200 bg-red-50 p-4'
          : 'rounded-2xl border border-green-200 bg-green-50 p-4'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-lg font-bold ${isReject ? 'text-red-700' : 'text-green-700'}`}>
          {isReject ? 'REJECT' : 'ACCEPT'}
        </span>
        <span className="font-mono text-xs text-slate-500">
          Sample {result.sampleSize}/{result.sampleSizeRequired}
          {!result.sampleSizeMet && ' · below required size'}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {result.breakdown.map((line) => (
          <div key={line.severity} className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{SEVERITY_LABEL[line.severity]}</span>
            <span className="flex items-center gap-2">
              <span className={`font-mono ${line.exceeded ? 'font-semibold text-red-700' : 'text-slate-600'}`}>
                {line.found} / {line.max}
              </span>
              {line.exceeded && <StatusBadge tone="critical">Over limit</StatusBadge>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
