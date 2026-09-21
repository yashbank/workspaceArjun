/**
 * Phase 24E · D10 — master data, one component.
 *
 * What a screenshot cannot enforce: that the same component serves every master, that the code is present-but-greyed
 * and never submitted, that a deactivated row is struck through and counted on its toggle, that "not set" appears only
 * where a Hindi name can exist, that the edit panel is docked BESIDE the list, and that no price is on the screen.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const saveMasterAction = vi.fn();
vi.mock('@/app/(mis)/mis/masters/desktop-actions', () => ({ saveMasterAction: (...a: unknown[]) => saveMasterAction(...a), setDeactivatedAction: vi.fn() }));

import { MASTERS, countsFrom, type DirectoryEntry, type MasterKey, type MasterListView, type MasterRowView } from '@/lib/mis/master-directory';

import { MasterDataDesktop } from './master-data-desktop';

const directory: DirectoryEntry[] = MASTERS.map((m, i) => ({ key: m.key, nav: m.nav, href: m.href, counts: countsFrom(i + 3, i % 2) }));
const at = new Date('2024-03-12T00:00:00Z');
const machineRows: MasterRowView[] = [
  { id: 'm1', code: 'MC-HD74', name: 'Heidelberg SM 74', cells: { department: 'Printing', machineType: 'Offset' }, deactivated: false, createdAt: at },
  { id: 'm2', code: 'MC-CORR1', name: 'Corrugation Line 1', cells: { department: null, machineType: null }, deactivated: true, createdAt: at },
];
const deptRows: MasterRowView[] = [
  { id: 'd1', code: 'PRINT', name: 'Printing', nameHi: 'प्रिंटिंग', cells: {}, deactivated: false, createdAt: at },
  { id: 'd2', code: 'PACK', name: 'Packaging', nameHi: null, cells: {}, deactivated: false, createdAt: at },
];
const options = { departments: [{ value: 'd1', label: 'Printing' }], itemUnits: [{ value: 'KG', label: 'KG' }], severities: [{ value: 'MAJOR', label: 'MAJOR' }] };

const list = (master: MasterKey, rows: MasterRowView[], over: Partial<MasterListView> = {}): MasterListView => ({
  master, counts: countsFrom(21, 2), showDeactivated: false, query: '', rows, matched: rows.length, editing: null, options, canWrite: true, error: null, ...over,
});
const renderList = (l: MasterListView) => render(<MasterDataDesktop directory={directory} list={l} />);

describe('the header and the sub-nav', () => {
  it('states total, active and deactivated in words', () => {
    const { container } = renderList(list('machines', machineRows));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Machines');
    expect(container.textContent).toContain('21 total · 19 active · 2 deactivated');
  });

  it('the sub-nav lists every master with its count, in groups, and marks the current one', () => {
    renderList(list('machines', machineRows));
    const nav = screen.getByRole('navigation', { name: 'Master data' });
    const current = within(nav).getByRole('link', { name: /Machines/ });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.getAttribute('href')).toBe('/mis/masters/machines');
    expect(within(nav).getAllByRole('link').length).toBe(MASTERS.length + 1); // + Shifts
    for (const g of ['Core', 'Quality', 'People', 'Options']) expect(nav.textContent).toContain(g);
    expect(within(nav).getByRole('link', { name: /^Customers/ }).getAttribute('href')).toBe('/mis/customers');
  });

  it('a master that is not built is SAID, not drawn as a dead entry', () => {
    renderList(list('machines', machineRows));
    const nav = screen.getByRole('navigation', { name: 'Master data' });
    expect(nav.textContent).toContain('checklists, pools and paper types have no master');
    expect(within(nav).queryByRole('link', { name: /Checklists|Pools|Paper types/ })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Shifts' }).getAttribute('href')).toBe('/mis/attendance/shifts');
  });

  it('the same component serves a different master with its own title and columns', () => {
    renderList(list('departments', deptRows));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Departments');
    expect([...document.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['Code', 'Name', 'हिन्दी', 'Status']);
  });
});

describe('the list', () => {
  it('a missing Hindi name reads "not set" — only where a Hindi name exists', () => {
    renderList(list('departments', deptRows));
    const pack = screen.getByText('Packaging').closest('tr')!;
    expect(within(pack).getByText('not set').className).toContain('italic');
    expect(screen.getByText('प्रिंटिंग')).toBeTruthy();
  });

  it('machines have NO Hindi column at all — "not set" would be a lie for a name that can never be set', () => {
    const { container } = renderList(list('machines', machineRows));
    expect([...container.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['Code', 'Name', 'Department', 'Type', 'Status']);
    expect(container.textContent).not.toContain('not set');
  });

  it('a deactivated row is struck through with a dashed chip; an active one has a green chip', () => {
    renderList(list('machines', machineRows, { showDeactivated: true }));
    const dead = screen.getByText('Corrugation Line 1');
    expect(dead.className).toContain('line-through');
    expect(within(dead.closest('tr')!).getByText('Deactivated').className).toContain('border-dashed');
    expect(within(screen.getByText('Heidelberg SM 74').closest('tr')!).getByText('Active').className).toContain('green');
  });

  it('the toggle carries the count; turning it on keeps the search, turning it off says so', () => {
    renderList(list('machines', machineRows, { query: 'hd' }));
    const toggles = screen.getAllByRole('link', { name: /Show deactivated \(2\)/ });
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles[0].getAttribute('href')).toBe('/mis/masters/machines?q=hd&deactivated=1');
  });

  it('with the toggle on, the link hides them again and the search form keeps the toggle', () => {
    const { container } = renderList(list('machines', machineRows, { showDeactivated: true }));
    expect(screen.getByRole('link', { name: 'Hide deactivated' }).getAttribute('href')).toBe('/mis/masters/machines');
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('get');
    expect((form.querySelector('input[name="deactivated"]') as HTMLInputElement).value).toBe('1');
  });

  it('says how many are shown of how many match, and the page size', () => {
    const { container } = renderList(list('machines', machineRows, { matched: 60 }));
    expect(container.textContent).toContain('Showing 2 of 60 · 50 per page');
  });

  it('an empty master and an empty search each say so', () => {
    renderList(list('machines', []));
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
    document.body.innerHTML = '';
    renderList(list('machines', [], { query: 'zzz' }));
    expect(screen.getByText('Nothing matches this search.')).toBeTruthy();
  });

  it('a name links to its edit panel and keeps the search; a role that may not write gets no links and a read-only note', () => {
    renderList(list('machines', machineRows, { query: 'hd' }));
    expect(screen.getByRole('link', { name: 'Heidelberg SM 74' }).getAttribute('href')).toBe('/mis/masters/machines?q=hd&edit=m1');
    document.body.innerHTML = '';
    const { container } = renderList(list('machines', machineRows, { canWrite: false }));
    expect(screen.queryByRole('link', { name: 'Heidelberg SM 74' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Add/ })).toBeNull();
    expect(container.textContent).toContain('read this master but not change it');
  });

  it('"Add" exists only for a role that may write — absent, not greyed', () => {
    renderList(list('machines', machineRows));
    expect(screen.getByRole('link', { name: '+ Add' }).getAttribute('href')).toBe('/mis/masters/machines?create=1');
  });

  it('shows no price, rate or wage anywhere', () => {
    const { container } = renderList(list('items', [{ id: 'i1', code: 'RM-FBB', name: 'FBB 300 gsm', cells: { unit: 'KG' }, deactivated: false, createdAt: at }]));
    expect(container.textContent).not.toMatch(/₹|price|rate\b|wage|salary/i);
  });
});

describe('the edit panel — docked beside the list', () => {
  const editing = { id: 'm1', values: { code: 'MC-HD74', name: 'Heidelberg SM 74', departmentId: 'd1', machineType: 'Offset', capacityPerDay: '40000' }, deactivated: false, createdAt: at };
  const renderEdit = (over: Partial<NonNullable<MasterListView['editing']>> = {}) => renderList(list('machines', machineRows, { editing: { ...editing, ...over } }));

  it('opens BESIDE the list: both are on screen, the selected row is marked', () => {
    renderEdit();
    expect(screen.getByRole('table', { name: 'Machines' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByText('Heidelberg SM 74', { selector: 'a' }).closest('tr')!.getAttribute('aria-current')).toBe('true');
  });

  it('the code is present, greyed, read-only, explained — and has no name, so it is never submitted', () => {
    renderEdit();
    const code = screen.getByLabelText('Code') as HTMLInputElement;
    expect(code.value).toBe('MC-HD74');
    expect(code.readOnly).toBe(true);
    expect(code.getAttribute('name')).toBeNull();
    expect(code.className).toContain('bg-[#f1ebdf]');
    expect(document.getElementById(code.getAttribute('aria-describedby')!)!.textContent).toContain('cannot be edited after it is created');
  });

  it('the other fields are named inputs, 48px tall with 16px text', () => {
    renderEdit();
    for (const label of ['Name · English *', 'Machine type', 'Capacity per day']) {
      const el = screen.getByLabelText(label) as HTMLInputElement;
      expect(el.getAttribute('name')).toBeTruthy();
      expect(el.className).toContain('min-h-12');
      expect(el.className).toContain('text-base');
    }
    expect((screen.getByLabelText('Department') as HTMLSelectElement).value).toBe('d1');
  });

  it('posts the master and the id as hidden fields', () => {
    const { container } = renderEdit();
    const form = container.querySelector('aside form')!;
    expect((form.querySelector('input[name="master"]') as HTMLInputElement).value).toBe('machines');
    expect((form.querySelector('input[name="id"]') as HTMLInputElement).value).toBe('m1');
  });

  it('offers Deactivate (never Delete) with the reason; a deactivated row offers Reactivate', () => {
    renderEdit();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(screen.getByText(/never deleted/)).toBeTruthy();
    document.body.innerHTML = '';
    renderEdit({ id: 'm2', deactivated: true });
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeTruthy();
    expect(screen.getByText(/This row is deactivated/)).toBeTruthy();
  });

  it('closing goes back to the list, keeping the search and the toggle', () => {
    renderList(list('machines', machineRows, { query: 'hd', showDeactivated: true, editing }));
    expect(screen.getByRole('link', { name: 'Close' }).getAttribute('href')).toBe('/mis/masters/machines?q=hd&deactivated=1');
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/mis/masters/machines?q=hd&deactivated=1');
  });

  it('a NEW row has an editable code and no deactivate control', () => {
    renderList(list('machines', machineRows, { editing: { id: null, values: { code: '', name: '' }, deactivated: false, createdAt: null } }));
    const code = screen.getByLabelText(/^Code/) as HTMLInputElement;
    expect(code.readOnly).toBe(false);
    expect(code.getAttribute('name')).toBe('code');
    expect(screen.queryByRole('button', { name: /activate/ })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Add' })).toBeTruthy();
  });

  it('a Hindi field says what an empty one means — only on a master that has one', () => {
    renderList(list('departments', deptRows, { editing: { id: 'd2', values: { code: 'PACK', name: 'Packaging', nameHi: '' }, deactivated: false, createdAt: at } }));
    expect(screen.getByText(/shows "not set" rather than falling back silently to English/)).toBeTruthy();
    document.body.innerHTML = '';
    renderEdit();
    expect(screen.queryByText(/not set/)).toBeNull();
  });

  it('every link and control on the screen is a 44px target', () => {
    const { container } = renderEdit();
    for (const el of container.querySelectorAll('a, button, select, input:not([type=hidden])')) expect(el.getAttribute('class') ?? '').toMatch(/min-h-1[12]|min-w-11/);
  });
});

describe('a failed save', () => {
  const editing = { id: 'm1', values: { code: 'MC-HD74', name: 'Heidelberg SM 74', departmentId: 'd1', machineType: 'Offset', capacityPerDay: '' }, deactivated: false, createdAt: at };

  it('shows the reason and KEEPS what the person typed — the form is not blanked', async () => {
    saveMasterAction.mockResolvedValue({ error: 'Capacity per day must be a number, zero or more.', values: { name: 'Typed name', machineType: 'Offset', capacityPerDay: 'lots', departmentId: 'd1' } });
    const { container } = renderList(list('machines', machineRows, { editing }));
    fireEvent.change(screen.getByLabelText('Name · English *'), { target: { value: 'Typed name' } });
    fireEvent.submit(container.querySelector('aside form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Capacity per day must be a number'));
    expect((screen.getByLabelText('Name · English *') as HTMLInputElement).value).toBe('Typed name');
    expect((screen.getByLabelText('Capacity per day') as HTMLInputElement).value).toBe('lots');
  });

  it('a CHOICE the person changed is kept too — a select does not fall back to its saved value after the form reset', async () => {
    saveMasterAction.mockResolvedValue({ error: 'Capacity per day must be a number, zero or more.', values: { name: 'Heidelberg SM 74', machineType: 'Offset', capacityPerDay: 'lots', departmentId: 'd2' } });
    const { container } = renderList(list('machines', machineRows, { editing, options: { ...options, departments: [...options.departments, { value: 'd2', label: 'Packaging' }] } }));
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'd2' } });
    fireEvent.submit(container.querySelector('aside form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByLabelText('Department') as HTMLSelectElement).value).toBe('d2');
  });

  it('an error handed back through the URL (a failed deactivate) is shown too', () => {
    renderList(list('machines', machineRows, { editing, error: 'That row no longer exists.' }));
    expect(screen.getByRole('alert').textContent).toContain('That row no longer exists.');
  });

  it('no error, no alert', () => {
    renderList(list('machines', machineRows, { editing }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('every colour is one the other desktop screens already use', () => {
  it('no new hex in the D10 files', () => {
    const own = ['master-data-desktop.tsx', 'master-edit-form.tsx'].flatMap((f) => (readFileSync(path.join(process.cwd(), 'src/components/mis/desktop', f), 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase()));
    const known = new Set(
      ['order-detail-desktop.tsx', 'bom-desktop.tsx', 'defects-desktop.tsx', 'qc-grid-desktop.tsx', 'attendance-month-desktop.tsx', 'desktop-shell.tsx'].flatMap((f) =>
        (readFileSync(path.join(process.cwd(), 'src/components/mis/desktop', f), 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase()),
      ),
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((h) => !known.has(h))).toEqual([]);
  });
});

describe('failure and refusal', () => {
  it('a load failure is an alert with a way to the classic screen', () => {
    render(<MasterDataDesktop directory={null} list={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.getByRole('link', { name: 'Open the classic screen' }).getAttribute('href')).toBe('/mis/masters?view=classic');
  });

  it('a refusal says "no access", not "could not load"', () => {
    render(<MasterDataDesktop directory={null} list={null} denied />);
    expect(screen.getByRole('alert').textContent).toBe('You do not have access to the master data.');
  });
});

describe('the pages and the source', () => {
  const root = process.cwd();
  const pages = ['machines', 'departments', 'processes', 'items', 'defect-types', '[group]'].map((d) => `src/app/(mis)/mis/masters/${d}/page.tsx`).concat('src/app/(mis)/mis/customers/page.tsx');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const src = strip(readFileSync(path.join(root, 'src/components/mis/desktop/master-data-desktop.tsx'), 'utf8'));
  const form = strip(readFileSync(path.join(root, 'src/components/mis/desktop/master-edit-form.tsx'), 'utf8'));

  it.each(pages)('%s: two layouts, and any explicit ?view is the existing screen', (file) => {
    const page = readFileSync(path.join(root, file), 'utf8');
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
    expect(page).toContain('if (sp.view) return phone;');
    expect(page).toContain('MasterDataDesktopServer');
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });

  it('the list component imports no server module and knows no master by name', () => {
    expect(src).not.toMatch(/from '@\/server/);
    expect(src).not.toMatch(/'machines'|'departments'|'processes'|'customers'|'defect-types'/);
  });

  it('the form imports only types and the form actions from the server side', () => {
    const imports = [...form.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((i) => i.startsWith('@/server'))).toEqual([]);
    expect(imports).toContain('@/app/(mis)/mis/masters/desktop-actions');
  });

  it('uses only the lg breakpoint — never a third layout', () => {
    expect(src).toContain('lg:grid-cols-');
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
    expect(form).not.toMatch(/['" ](sm|md|xl|2xl):/);
  });

  it('the redirect after a save comes from the master\'s own route, never from the form', () => {
    const actions = readFileSync(path.join(root, 'src/app/(mis)/mis/masters/desktop-actions.ts'), 'utf8');
    expect(actions).toContain('redirect(spec.href)');
    expect(actions).not.toMatch(/formData\.get\('(returnTo|redirect|next|to)'\)/);
  });
});
