/**
 * The MIS component kit.
 *
 * Import from here, not from the individual files, so a later change of
 * implementation is one edit rather than sixty.
 *
 * Toast and ConfirmDialog are deliberately NOT re-implemented here — the live
 * app already ships both and forking them would give the product two
 * behaviours for the same thing.
 */

export { Button, type ButtonProps } from './button';
export { Card, CardRow } from './card';
export { DataTable, type Column, type DataTableProps } from './data-table';
export { EmptyState } from './empty-state';
export { DateInput, Input, NumberInput, TimeInput, type InputProps } from './input';
export { Select, type SelectOption, type SelectProps } from './select';
export { Skeleton, SkeletonList } from './skeleton';
export { SlideOver, type SlideOverProps } from './slide-over';
export { StatusBadge, type BadgeTone } from './status-badge';

export { ToastProvider, useToast } from '@/components/ui/toast';
export { useConfirm, type ConfirmOptions } from '@/components/ui/confirm-dialog';
