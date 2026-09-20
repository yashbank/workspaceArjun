'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import type { Column } from '../kit/data-table';
import { StatusBadge } from '../kit/status-badge';
import { useMisLocale } from '../shell/locale-provider';
import { MasterTable, type MasterField, type MasterRow } from './master-table';

export type OptionRow = MasterRow & {
  id: string;
  label: string;
  labelHi: string | null;
  isActive: boolean;
  deletedAt: Date | string | null;
};

/**
 * All seven option masters are this one screen with a different `group`.
 *
 * E2-07 asks for seven screens; this is what "built from the generic
 * component" means in practice — no per-group component, no per-group markup.
 */
export function OptionMasterScreen({
  group,
  title,
  rows,
  canWrite,
  onSave,
  onDelete,
  onRestore,
}: {
  group: string;
  title: string;
  rows: OptionRow[];
  canWrite: boolean;
  onSave: (group: string, id: string | null, values: { label: string; labelHi?: string }) => Promise<void>;
  onDelete: (group: string, id: string) => Promise<void>;
  onRestore: (group: string, id: string) => Promise<void>;
}) {
  const { t } = useMisLocale();
  const router = useRouter();

  const columns: Column<OptionRow>[] = [
    { key: 'label', header: t('masters.label'), render: (r) => r.label },
    {
      key: 'labelHi',
      header: t('common.nameHi'),
      render: (r) => r.labelHi ?? '—',
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: t('common.active'),
      render: (r) =>
        r.deletedAt ? (
          <StatusBadge tone="critical">{t('common.deleted')}</StatusBadge>
        ) : (
          <StatusBadge tone="good">{t('common.active')}</StatusBadge>
        ),
    },
  ];

  const fields: MasterField[] = [
    { key: 'label', label: t('masters.label'), type: 'text', required: true },
    { key: 'labelHi', label: t('common.nameHi'), type: 'text' },
  ];

  const handleSave = useCallback(
    async (values: Record<string, string>, row: OptionRow | null) => {
      await onSave(group, row?.id ?? null, { label: values.label, labelHi: values.labelHi });
      router.refresh();
    },
    [group, onSave, router],
  );

  return (
    <MasterTable<OptionRow>
      title={title}
      columns={columns}
      fields={fields}
      rows={rows}
      canWrite={canWrite}
      onSave={handleSave}
      onDelete={async (row) => {
        await onDelete(group, row.id);
        router.refresh();
      }}
      onRestore={async (row) => {
        await onRestore(group, row.id);
        router.refresh();
      }}
    />
  );
}
