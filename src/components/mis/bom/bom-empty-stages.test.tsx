/**
 * BOM Empty Stages Guard Test:
 * When a BOM is in DRAFT status and has NO stages created, the "Submit for Approval"
 * button must NOT be present (or enabled) in the UI.
 *
 * Backend guard (assertBomComplete) rejects 0 stages with:
 * "Add at least one stage before this BOM goes for approval."
 * The frontend UI should mirror this guard rather than showing an active submit button.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BomScreen } from './bom-screen';

vi.mock('@/app/(mis)/mis/bom/actions', () => ({
  createBomAction: vi.fn(),
  addStageAction: vi.fn(),
  addMaterialAction: vi.fn(),
  submitBomAction: vi.fn(),
  approveBomAction: vi.fn(),
  deleteStageAction: vi.fn(),
  deleteMaterialAction: vi.fn(),
  reorderStagesAction: vi.fn(),
  rejectBomAction: vi.fn(),
  deleteBomAction: vi.fn(),
  updateStageAction: vi.fn(),
  updateMaterialAction: vi.fn(),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => ({
    confirm: vi.fn(),
    confirmDialog: null,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('BomScreen empty stages guard', () => {
  it('does NOT render or enable "Submit for Approval" when DRAFT BOM has 0 stages', () => {
    const draftBomWithoutStages = {
      id: 'bom-empty-1',
      status: 'DRAFT',
      approvedAt: null,
      stages: [],
    };

    render(
      <BomScreen
        bom={draftBomWithoutStages}
        orderId="order-1"
        canWrite={true}
        isOwner={true}
      />,
    );

    const submitBtn = screen.queryByRole('button', { name: /submit for approval/i });
    // When no stages exist, Submit for Approval should not be present (or must be disabled)
    expect(submitBtn).toBeNull();
  });

  it('renders "Submit for Approval" when DRAFT BOM has at least one stage with materials', () => {
    const draftBomWithStages = {
      id: 'bom-with-stages',
      status: 'DRAFT',
      approvedAt: null,
      stages: [
        {
          id: 'stage-1',
          stageName: 'Offset Printing',
          seq: 0,
          process: { name: 'Printing' },
          materials: [
            {
              id: 'mat-1',
              description: 'Cyan Ink',
              quantity: 5,
              unit: 'KG',
              ratePerUnit: 250,
              item: null,
            },
          ],
        },
      ],
    };

    render(
      <BomScreen
        bom={draftBomWithStages}
        orderId="order-1"
        canWrite={true}
        isOwner={true}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /submit for approval/i });
    expect(submitBtn).toBeTruthy();
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
