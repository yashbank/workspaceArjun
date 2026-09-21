/**
 * D13's page: two layouts only — the existing phone screen below 1024px, the D13 widget from 1024px — and any
 * explicit `?view` is the phone screen at every width, with no desktop query made.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
const getMisRole = vi.fn(async () => 'OWNER');
vi.mock('@/server/mis/roles', () => ({ getMisRole: () => getMisRole() }));
vi.mock('@/server/mis/orders', () => ({ listOrders: async () => [] }));
vi.mock('@/components/mis/documents/documents-screen', () => ({ DocumentsScreen: () => null }));
vi.mock('@/components/mis/desktop/documents-desktop-server', () => ({ DocumentsDesktopServer: () => null }));

const { default: DocumentsPage } = await import('./page');
const { DocumentsScreen } = await import('@/components/mis/documents/documents-screen');
const { DocumentsDesktopServer } = await import('@/components/mis/desktop/documents-desktop-server');

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const kids = (node: ReactNode): ReactNode[] => (isValidElement(node) ? ([] as ReactNode[]).concat((node.props as { children?: ReactNode }).children ?? []) : []);
const typesIn = (node: ReactNode): unknown[] => (isValidElement(node) ? [node.type, ...kids(node).flatMap(typesIn)] : []);

beforeEach(() => vi.clearAllMocks());

describe('the two layouts', () => {
  it('phone below 1024px (lg:hidden) and the desktop widget from 1024px (hidden lg:block), handing the search params on', async () => {
    const tree = (await DocumentsPage({ searchParams: sp({ q: 'a', group: 'pdf', doc: 'x', page: '2', add: '1' }) })) as ReactNode;
    const [phone, desktop] = kids(tree) as React.ReactElement<{ className: string; children: ReactNode }>[];
    expect(phone.props.className).toBe('lg:hidden');
    expect(desktop.props.className).toBe('hidden lg:block');
    expect(typesIn(phone)).toContain(DocumentsScreen);
    const server = kids(desktop)[0] as React.ReactElement<{ searchParams: Record<string, string> }>;
    expect(server.type).toBe(DocumentsDesktopServer);
    expect(server.props.searchParams).toMatchObject({ q: 'a', group: 'pdf', doc: 'x', page: '2', add: '1' });
  });

  it('any explicit ?view is the phone screen at every width — no desktop widget at all', async () => {
    const tree = (await DocumentsPage({ searchParams: sp({ view: 'classic' }) })) as ReactNode;
    expect(typesIn(tree)).toContain(DocumentsScreen);
    expect(typesIn(tree)).not.toContain(DocumentsDesktopServer);
  });
});
