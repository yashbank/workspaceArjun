/**
 * Order status transitions and close gates — pure, client-safe.
 *
 * The real status values (`MisOrder.status` is a free String, so this file is the enum):
 * DRAFT, CONFIRMED, IN_PRODUCTION, COMPLETED, DELIVERED, CANCELLED. The tester wrote
 * "COMPLETE"; that value does not exist.
 *
 *   DRAFT          -> CONFIRMED | CANCELLED
 *   CONFIRMED      -> IN_PRODUCTION | CANCELLED
 *   IN_PRODUCTION  -> COMPLETED | CANCELLED
 *   COMPLETED      -> DELIVERED | IN_PRODUCTION   (the second is a reopen)
 *   DELIVERED, CANCELLED -> terminal here. Both can still be put back in play, with a
 *   reason, through `reopenOrder`, which is a separate, audited path and does not use this table.
 *
 * This is the one and only transition table. A second `if (status === ...)` somewhere else
 * is how the gate grows a hole.
 *
 * Close gates (for COMPLETED) are computed from plain rows so they can be tested without a
 * database. `MisOrder` carries no ordered quantity (and no BOM line is a finished-goods
 * quantity), so there is no "produced >= ordered" gate to evaluate; it is deliberately absent
 * rather than faked.
 */
export const ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'COMPLETED', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['DELIVERED', 'IN_PRODUCTION'],
  DELIVERED: [],
  CANCELLED: [],
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * Spellings an order row could carry from before this table existed (the old
 * `updateOrderStatus` wrote any string). No code or seed writes them today, but a row
 * holding one must not be stuck with no way out, so a legacy *current* status is read as its
 * real equivalent. They are never accepted as a target.
 */
const LEGACY_STATUS_ALIASES: Readonly<Record<string, OrderStatus>> = {
  COMPLETE: 'COMPLETED',
  IN_PROGRESS: 'IN_PRODUCTION',
};

export function canTransitionOrder(from: string, to: string): boolean {
  const current = LEGACY_STATUS_ALIASES[from] ?? from;
  return isOrderStatus(current) && isOrderStatus(to) && ORDER_TRANSITIONS[current].includes(to);
}

/** Moves that need a reason on the record: cancelling, and sending a completed order back. */
export function transitionNeedsReason(from: string, to: string): boolean {
  const current = LEGACY_STATUS_ALIASES[from] ?? from;
  return to === 'CANCELLED' || (current === 'COMPLETED' && to === 'IN_PRODUCTION');
}

/** Roles that may complete an order past unmet gates. */
export const CLOSE_OVERRIDE_ROLES = ['OWNER', 'ADMIN'] as const;

export function canOverrideCloseGates(role: string): boolean {
  return (CLOSE_OVERRIDE_ROLES as readonly string[]).includes(role);
}

export const MIN_REASON_LENGTH = 3;

export type CloseGateKey = 'PHASES_SIGNED_OFF' | 'QC_RESOLVED' | 'PRODUCTION_LOGGED';

export type CloseGate = {
  key: CloseGateKey;
  label: string;
  passed: boolean;
  /** What is outstanding, in words; empty when the gate passed. */
  detail: string;
};

export type CloseGatePhase = { status: string };
export type CloseGateQcCheck = {
  bomStageId: string | null;
  parameterName: string | null;
  result: string;
  checkTime: Date | string;
};

/**
 * (a) Every applicable phase is SIGNED_OFF. NOT_APPLICABLE phases do not apply; an order with
 * no phase plan passes (D10 — it is "not gated", and the screen says so).
 * (c) No QC parameter whose latest check is a FAIL: a failure is resolved only by a later
 * PASS on the same stage + parameter (the rule MisQcCheck documents).
 */
export function evaluateCloseGates(input: { phases: CloseGatePhase[]; qcChecks: CloseGateQcCheck[]; productionCount?: number }): CloseGate[] {
  const applicable = input.phases.filter((p) => p.status !== 'NOT_APPLICABLE');
  const unsigned = applicable.filter((p) => p.status !== 'SIGNED_OFF').length;

  const latest = new Map<string, CloseGateQcCheck>();
  for (const check of input.qcChecks) {
    const key = `${check.bomStageId ?? ''}|${check.parameterName ?? 'General'}`;
    const prev = latest.get(key);
    if (!prev || new Date(check.checkTime).getTime() >= new Date(prev.checkTime).getTime()) latest.set(key, check);
  }
  const failing = [...latest.values()].filter((c) => c.result === 'FAIL');

  // R3 B105: optional, so every caller that does not pass it keeps the old two gates.
  const productionGate: CloseGate[] =
    input.productionCount === undefined
      ? []
      : [{
          key: 'PRODUCTION_LOGGED',
          label: 'Production logged',
          passed: input.productionCount > 0,
          detail: input.productionCount > 0 ? '' : 'No production has been logged',
        }];

  return [
    {
      key: 'PHASES_SIGNED_OFF',
      label: 'Every phase signed off',
      passed: unsigned === 0,
      detail: unsigned === 0 ? '' : `${unsigned} of ${applicable.length} phases not signed off`,
    },
    {
      key: 'QC_RESOLVED',
      label: 'No unresolved QC failure',
      passed: failing.length === 0,
      detail:
        failing.length === 0
          ? ''
          : `Failed and not re-passed: ${failing.map((c) => c.parameterName ?? 'General').join(', ')}`,
    },
    ...productionGate,
  ];
}

export function unmetGates(gates: CloseGate[]): CloseGate[] {
  return gates.filter((g) => !g.passed);
}
