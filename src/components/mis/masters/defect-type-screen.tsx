'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { MisDefectSeverity } from '@/generated/prisma/enums';
import { saveDefectTypeAction, deleteDefectTypeAction, restoreDefectTypeAction } from '@/app/(mis)/mis/masters/defect-types/actions';
import type { Column } from '../kit/data-table';
import { StatusBadge } from '../kit/status-badge';
import { MasterTable, type MasterField, type MasterRow } from './master-table';

export type DefectTypeRow = MasterRow & {
  id: string;
  code: string;
  name: string;
  nameHi: string | null;
  severity: MisDefectSeverity;
  isActive: boolean;
  deletedAt: Date | string | null;
  sortOrder: number;
};

const SEVERITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
];

export function DefectTypeScreen({
  defectTypes,
  canWrite,
}: {
  defectTypes: DefectTypeRow[];
  canWrite: boolean;
}) {
  const router = useRouter();

  const columns: Column<DefectTypeRow>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => <div><div>{r.name}</div>{r.nameHi && <div className="text-xs text-slate-500">{r.nameHi}</div>}</div> },
    { key: 'severity', header: 'Severity', render: (r) => r.severity },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.deletedAt ? (
          <StatusBadge tone="critical">Deleted</StatusBadge>
        ) : (
          <StatusBadge tone="good">Active</StatusBadge>
        ),
    },
  ];

  const fields: MasterField[] = [
    { key: 'code', label: 'Code', type: 'text', required: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'nameHi', label: 'Name (Hindi)', type: 'text' },
    { key: 'severity', label: 'Severity', type: 'select', required: true, options: SEVERITY_OPTIONS },
    { key: 'sortOrder', label: 'Sort Order', type: 'number' },
  ];

  const handleSave = useCallback(
    async (values: Record<string, string>, row: DefectTypeRow | null) => {
      await saveDefectTypeAction(row?.id ?? null, {
        code: values.code,
        name: values.name,
        nameHi: values.nameHi,
        severity: values.severity as MisDefectSeverity,
        sortOrder: parseInt(values.sortOrder) || 0,
      });
      router.refresh();
    },
    [router],
  );

  return (
    <MasterTable<DefectTypeRow>
      title="Defect Types"
      columns={columns}
      fields={fields}
      rows={defectTypes}
      canWrite={canWrite}
      onSave={handleSave}
      onDelete={async (row) => {
        await deleteDefectTypeAction(row.id);
        router.refresh();
      }}
      onRestore={async (row) => {
        await restoreDefectTypeAction(row.id);
        router.refresh();
      }}
    />
  );
}
