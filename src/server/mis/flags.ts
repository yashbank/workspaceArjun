/**
 * MIS Feature Flag Helper
 *
 * Determines if the MIS (Management Information System) is enabled for a given user.
 * Reads from two sources in order:
 * 1. Environment variable MIS_ENABLED_ACCOUNTS (comma-separated user IDs)
 * 2. Per-user database flag (future implementation)
 *
 * Default: OFF (feature disabled unless explicitly enabled)
 */

/**
 * Check if MIS is enabled for a specific user
 *
 * @param userId - The user ID to check
 * @returns true if MIS is enabled for this user, false otherwise
 */
export function isMisEnabled(userId: string): boolean {
  // Default: feature is OFF
  if (!userId) {
    return false;
  }

  // Check environment variable allow-list
  const enabledAccounts = process.env.MIS_ENABLED_ACCOUNTS || '';
  if (enabledAccounts) {
    const allowedIds = enabledAccounts
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (allowedIds.includes(userId)) {
      return true;
    }
  }

  // Future: check per-user database flag here
  // const userFlag = await prisma.userProfile.findUnique({
  //   where: { id: userId },
  //   select: { misFlagEnabled: true },
  // });
  // if (userFlag?.misFlagEnabled) return true;

  return false;
}
