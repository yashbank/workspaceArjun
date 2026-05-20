/** Normalize display name for case-insensitive uniqueness checks. */
export function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase();
}

export const DISPLAY_NAME_TAKEN =
  'This display name is already taken. Please choose another.';

export const DISPLAY_NAME_DUPLICATE_WARNING =
  'Your display name matches another team member. Please choose a unique name.';
