/**
 * A stable, anonymous id for this browser profile — evidence, not identity.
 *
 * Stored on every queued write so that when one parks, whoever resolves it can
 * see *which tablet* it came from (Appendix B §B.7). It is random, carries no
 * personal data, and is never used to authorise anything.
 */
const STORAGE_KEY = 'mis-device-id';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Private mode or storage disabled. Evidence is nice to have, not worth a
    // failed save — a write must never be lost because we could not label it.
    return 'unknown-device';
  }
}
