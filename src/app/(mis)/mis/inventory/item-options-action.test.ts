import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

const created: unknown[] = [];
vi.mock('@/server/db', () => ({
  db: {
    misMasterOption: {
      findMany: async () => [{ value: 'GLOSS', label: 'Gloss', isActive: true }],
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: 'o1', ...data }; },
    },
    misAuditLog: { create: async () => ({}) },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { addItemOptionAction } = await import('./actions');
const as = (r: MisRoleName) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(r); };

beforeEach(() => { created.length = 0; vi.clearAllMocks(); });

describe('R2-02/25/84/85 addItemOptionAction', () => {
  it.each(['OWNER', 'ADMIN'] as MisRoleName[])('%s can add a Coating option', async (r) => {
    as(r);
    const res = await addItemOptionAction('COATING', 'Matt UV');
    expect(res.ok).toBe(true);
    expect(created[0]).toMatchObject({ group: 'COATING', label: 'Matt UV', value: 'MATT_UV' });
  });
  it.each(MIS_ROLES.filter((r) => r !== 'OWNER' && r !== 'ADMIN'))('%s is refused and nothing is written', async (r) => {
    as(r);
    await expect(addItemOptionAction('UNIT', 'Sheets')).rejects.toThrow(/Not permitted/);
    expect(created).toHaveLength(0);
  });
  it('rejects an unknown group and an empty name; an existing label is reused', async () => {
    as('ADMIN');
    expect((await addItemOptionAction('SECRET', 'x')).ok).toBe(false);
    expect((await addItemOptionAction('GSM', '  ')).ok).toBe(false);
    const res = await addItemOptionAction('COATING', 'gloss');
    expect(res.ok && res.value.value).toBe('GLOSS');
    expect(created).toHaveLength(0);
  });
});
