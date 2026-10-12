/**
 * C6b #29: saving a master with a code that already exists comes back as `{ ok: false, detail }` with a
 * friendly sentence, never as a thrown Prisma error (which production turns into the error boundary).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

/** What Prisma throws for a unique-constraint clash. */
function p2002(field: string): Error {
  return Object.assign(new Error('Unique constraint failed on the fields: (`x`)'), { code: 'P2002', meta: { target: [field] } });
}
let failure: Error;
const fail = async () => {
  throw failure;
};
const family = (...names: string[]) => Object.fromEntries(names.map((n) => [n, fail]));

vi.mock('@/server/mis/supplier', () => family('createSupplier', 'updateSupplier', 'deleteSupplier', 'restoreSupplier'));
vi.mock('@/server/mis/customer', () => family('createCustomer', 'updateCustomer', 'deleteCustomer', 'restoreCustomer'));
vi.mock('@/server/mis/department', () => family('createDept', 'updateDept', 'deleteDept', 'restoreDept', 'reorderDepts'));
vi.mock('@/server/mis/machine', () => family('createMachine', 'updateMachine', 'deleteMachine', 'restoreMachine'));
vi.mock('@/server/mis/defect-type', () => family('createDefectType', 'updateDefectType', 'deleteDefectType', 'restoreDefectType'));
vi.mock('@/server/mis/process', () => family('createProcess', 'updateProcess', 'deleteProcess', 'restoreProcess'));
vi.mock('@/server/mis/item', () => family('createItem', 'updateItem', 'deleteItem', 'restoreItem'));
vi.mock('@/server/mis/employee', () => family('createEmployee', 'updateEmployee', 'deleteEmployee', 'restoreEmployee'));
vi.mock('@/server/mis/employee-photo', () => family('setEmployeePhoto'));
vi.mock('@/server/mis/wage-type', () => family('createWageType', 'addWageRate', 'setWageTypeActive'));
vi.mock('@/server/mis/master-option', () => family('createOption', 'updateOption', 'deleteOption', 'restoreOption', 'addOptionInline'));
vi.mock('@/server/mis/qc-template', () =>
  family('createQcTemplate', 'updateQcTemplate', 'moveQcParameter', 'moveQcTemplate', 'seedQcTemplates', 'setQcTemplateActive'),
);

const { saveSupplierAction } = await import('./suppliers/actions');
const { saveCustomerAction } = await import('./customers/actions');
const { saveDeptAction } = await import('./masters/departments/actions');
const { saveMachineAction } = await import('./masters/machines/actions');
const { saveDefectTypeAction } = await import('./masters/defect-types/actions');
const { saveProcessAction } = await import('./masters/processes/actions');
const { saveItemAction } = await import('./masters/items/actions');
const { saveEmployeeAction } = await import('./employees/actions');
const { createWageTypeAction } = await import('./settings/wages/actions');
const { saveOptionAction, addOptionInlineAction } = await import('./masters/actions');
const { createQcTemplateAction, updateQcTemplateAction } = await import('./settings/qc-templates/actions');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: Array<[string, string, string, () => Promise<any>]> = [
  ['supplier', 'code', 'Supplier', () => saveSupplierAction(null, { code: 'SUP-1', name: 'A' })],
  ['customer', 'code', 'Customer', () => saveCustomerAction(null, { code: 'SUP-1', name: 'A' })],
  ['department', 'code', 'Department', () => saveDeptAction(null, { code: 'SUP-1', name: 'A', sortOrder: 0 })],
  ['machine', 'code', 'Machine', () => saveMachineAction(null, { code: 'SUP-1', name: 'A' })],
  ['defect type', 'code', 'Defect type', () => saveDefectTypeAction(null, { code: 'SUP-1', name: 'A', severity: 'MINOR', sortOrder: 0 })],
  ['process', 'code', 'Process', () => saveProcessAction(null, { code: 'SUP-1', name: 'A' })],
  ['item (code)', 'code', 'Item', () => saveItemAction(null, { code: 'SUP-1', name: 'A', unit: 'KG' } as never)],
  ['item (sku)', 'sku', 'Item', () => saveItemAction(null, { code: 'X', sku: 'SUP-1', name: 'A', unit: 'KG' } as never)],
  ['employee', 'employeeCode', 'Employee', () => saveEmployeeAction(null, { employeeCode: 'SUP-1', name: 'A' } as never)],
  ['wage type', 'name', 'Wage type', () => createWageTypeAction({ name: 'SUP-1', unit: 'DAILY', amount: 1 })],
  ['master option', 'label', 'Option', () => saveOptionAction('paper-type', null, { label: 'SUP-1' })],
  ['master option (inline)', 'label', 'Option', () => addOptionInlineAction('paper-type', 'SUP-1')],
  ['qc template (create)', 'name', 'QC template', () => createQcTemplateAction({ name: 'SUP-1' } as never)],
  ['qc template (update)', 'name', 'QC template', () => updateQcTemplateAction('t1', { name: 'SUP-1' } as never)],
];

describe('master-data saves return a friendly duplicate message instead of throwing', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(cases)('%s', async (_name, field, entity, run) => {
    failure = p2002(field);
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(new RegExp(`^${entity} with .*${field}.* already exists$`));
    expect(result.detail).not.toMatch(/Unique constraint|P2002|prisma/i);
  });

  it('a non-duplicate failure keeps its own message', async () => {
    failure = new Error('Code is required.');
    expect(await saveSupplierAction(null, { code: '', name: 'A' })).toEqual({ ok: false, detail: 'Code is required.' });
  });

  it('a foreign-key failure says the record is in use', async () => {
    failure = Object.assign(new Error('fk'), { code: 'P2003' });
    const r = await saveMachineAction('m1', { code: 'M', name: 'A' });
    expect(r).toEqual({ ok: false, detail: 'Cannot change this: it is used elsewhere' });
  });
});
