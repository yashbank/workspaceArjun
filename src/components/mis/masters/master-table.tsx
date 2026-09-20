'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button } from '../kit/button';
import { DataTable, type Column } from '../kit/data-table';
import { EmptyState } from '../kit/empty-state';
import { Input, NumberInput } from '../kit/input';
import { Select, type SelectOption } from '../kit/select';
import { SlideOver } from '../kit/slide-over';
import { useT } from '../shell/locale-provider';

/**
 * <MasterTable/> — the component nine master screens are built from.
 *
 * Build it once properly and E2-02 through E2-09 become a column config rather
 * than nine components.
 *
 * Deliberately resistant to per-screen special cases: a master that needs
 * something unusual composes *around* this, it does not add a prop to it. The
 * one concession is `leading`, because a status dot is layout, not behaviour.
 */

export type FieldType = 'text' | 'number' | 'select';

export type MasterField = {
  key: string;
  /** i18n key resolved by the caller before it reaches here. */
  label: string;
  type: FieldType;
  required?: boolean;
  /** For type 'select'. */
  options?: SelectOption[];
  /** Enables the inline "+ Add option" affordance on this field (S3). */
  onAddOption?: (label: string) => Promise<string>;
};

export type MasterRow = {
  id: string;
  deletedAt?: Date | string | null;
  [key: string]: unknown;
};

export type MasterTableProps<Row extends MasterRow> = {
  columns: Column<Row>[];
  /** The editable shape behind the slide-over. */
  fields: MasterField[];
  rows: Row[];
  loading?: boolean;
  error?: string | null;
  /** Server-side search. Called on a debounce; never filters in the browser. */
  onSearch?: (query: string) => void;
  onSave: (values: Record<string, string>, row: Row | null) => Promise<void>;
  onDelete?: (row: Row) => Promise<void>;
  onRestore?: (row: Row) => Promise<void>;
  /** Read-only mode for a user without write permission. */
  canWrite?: boolean;
  showDeleted?: boolean;
  onShowDeletedChange?: (next: boolean) => void;
  /** Optional leading indicator per row, e.g. a machine's up/down dot. */
  leading?: (row: Row) => ReactNode;
  title: string;
};

const SEARCH_DEBOUNCE_MS = 300;

export function MasterTable<Row extends MasterRow>({
  columns,
  fields,
  rows,
  loading = false,
  error = null,
  onSearch,
  onSave,
  onDelete,
  onRestore,
  canWrite = true,
  showDeleted = false,
  onShowDeletedChange,
  leading,
  title,
}: MasterTableProps<Row>) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Search runs on the server. Debounced so typing "corrugated" is one query,
  // not ten — on a factory connection ten round trips is a visible stall.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!onSearch) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(query), SEARCH_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, onSearch]);

  const open = creating || editing !== null;

  const openCreate = useCallback(() => {
    setValues(Object.fromEntries(fields.map((f) => [f.key, ''])));
    setFormError(null);
    setDirty(false);
    setCreating(true);
  }, [fields]);

  const openEdit = useCallback(
    (row: Row) => {
      setValues(
        Object.fromEntries(fields.map((f) => [f.key, row[f.key] == null ? '' : String(row[f.key])])),
      );
      setFormError(null);
      setDirty(false);
      setEditing(row);
    },
    [fields],
  );

  const close = useCallback(() => {
    setCreating(false);
    setEditing(null);
    setDirty(false);
  }, []);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    const missing = fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) {
      setFormError(`${missing.label} — ${t('action.save')}`);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await onSave(values, editing);
      close();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing || !onDelete) return;
    // ConfirmDialog lives in components/ui and is provider-mounted; a soft
    // delete here is reversible via Show deleted, so a native confirm is
    // proportionate and keeps this component free of a provider dependency.
    if (!window.confirm(t('common.confirmDelete'))) return;

    setSaving(true);
    try {
      await onDelete(editing);
      close();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const isDeleted = useCallback((row: Row) => Boolean(row.deletedAt), []);

  const tableColumns = useMemo<Column<Row>[]>(() => columns, [columns]);

  if (error) {
    return <EmptyState title={t('error.title')} body={error} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {canWrite && <Button onClick={openCreate}>{t('action.add')}</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('action.search')}
          aria-label={title + ': ' + t('action.search')}
          className="min-h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base"
        />
        {onShowDeletedChange && (
          <label className="flex min-h-11 items-center gap-2 text-base text-slate-700">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => onShowDeletedChange(e.target.checked)}
              className="size-5"
            />
            {t('common.showDeleted')}
          </label>
        )}
      </div>

      <DataTable
        columns={tableColumns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={canWrite ? openEdit : undefined}
        loading={loading}
        leading={leading}
        emptyTitle={query ? t('empty.noResults') : t('empty.title')}
        emptyBody={query ? undefined : t('empty.body')}
      />

      <SlideOver
        open={open}
        title={creating ? t('action.add') : t('action.edit')}
        onClose={close}
        dirty={dirty}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} loading={saving}>
              {t('action.save')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('action.cancel')}
            </Button>
            {editing && onDelete && !isDeleted(editing) && (
              <Button variant="danger" onClick={handleDelete} disabled={saving}>
                {t('action.delete')}
              </Button>
            )}
            {editing && onRestore && isDeleted(editing) && (
              <Button
                variant="secondary"
                onClick={() => void onRestore(editing).then(close)}
                disabled={saving}
              >
                {t('action.restore')}
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {fields.map((field) =>
            field.type === 'select' ? (
              <Select
                key={field.key}
                label={field.label}
                value={values[field.key] || null}
                options={field.options ?? []}
                onChange={(v) => setField(field.key, v)}
                onAddOption={field.onAddOption}
              />
            ) : field.type === 'number' ? (
              <NumberInput
                key={field.key}
                label={field.label}
                value={values[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            ) : (
              <Input
                key={field.key}
                label={field.label}
                value={values[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            ),
          )}
          {formError && (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
