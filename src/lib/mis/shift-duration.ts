/** R2-97 — "8h 0m" for a shift; a shift whose end is earlier than its start wraps midnight (22:00 → 06:00). */
export function shiftDuration(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return '—';
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  if (diff === 0) return '—';
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}
