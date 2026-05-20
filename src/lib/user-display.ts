/** Display name helpers — UserProfile.name is the canonical display name. */

export type ActorLike = {
  email: string;
  name?: string | null;
};

/** Prefer trimmed profile name; fall back to email local-part, then full email. */
export function getUserDisplayName(actor: ActorLike | null | undefined): string {
  if (!actor) return 'System';
  const trimmed = actor.name?.trim();
  if (trimmed) return trimmed;
  const email = actor.email?.trim();
  if (!email) return 'Unknown';
  const local = email.split('@')[0];
  return local || email;
}

export function needsDisplayName(name: string | null | undefined): boolean {
  return !name?.trim();
}
