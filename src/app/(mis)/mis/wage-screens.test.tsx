/**
 * Phase 14 · MIS-46 — what each SCREEN hands to the browser.
 *
 * "Any screen" means the page's props, not what the component chooses to draw: a column that
 * is hidden by `isOwner &&` is still in the payload the browser downloads. Each page is
 * called for every role and the tree it returns is serialised (`propsPayload`), then swept
 * for wage vocabulary and the sentinel figures. Same conventions as
 * `server/mis/wage-leak.test.ts`: OWNER first (the fixture must carry money), then every
 * other role, and `it.fails` + a finding number where the code breaks the rule today.
 *
 * NOT covered here: the reports page (it fans out to five report queries; its store-value
 * leak is proven at function level as F-06) and the home page (a structural check below
 * stands in for rendering all six role homes).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';
import { importsOf, listFiles, parse } from '@/server/mis/testing/ast';
import ts from 'typescript';
import {
  WAGE_DETECTOR,
  fakeDb,
  findLeaks,
  outcome,
  propsPayload,
  seedWorld,
  state,
} from '@/server/mis/testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { default: PayrollPage } = await import('./payroll/page');
const { default: PayslipPage } = await import('./print/payslip/[employeeId]/page');
const { default: WageTypesPage } = await import('./settings/wages/page');
const { default: AqlSettingsPage } = await import('./settings/aql/page');
const { default: SettingsPage } = await import('./settings/page');
const { default: AuditPage } = await import('./audit/page');
const { calculateMonthlyPayroll } = await import('@/server/mis/payroll');

const NON_OWNER = MIS_ROLES.filter((r) => r !== 'OWNER');

/**
 * A boolean capability prop (`canSeeWages: false`) says what a role may NOT see; it carries no wage
 * and its name would trip the key detector. Data props stay.
 */
function withoutFlags(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutFlags);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k, x]) => !(/^can[A-Z]/.test(k) && typeof x === 'boolean'))
        .map(([k, x]) => [k, withoutFlags(x)]),
    );
  }
  return v;
}
const payload = (v: unknown) => withoutFlags(propsPayload(v));
const as = (role: MisRoleName) => getMisRole.mockResolvedValue(role);

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  process.env.MIS_ENABLED_ACCOUNTS = 'u1';
  getCurrentUser.mockResolvedValue({ id: 'u1', email: 'u1@example.com', name: 'U One' });
});

async function figures(): Promise<string[]> {
  as('OWNER');
  return (await calculateMonthlyPayroll(2026, 1)).flatMap((r) => [r.basicWage, r.otPay, r.latePenalty, r.grossPay]).map(String);
}

type Screen = {
  name: string;
  render: () => Promise<unknown>;
  /** true when the page is not meant to carry money for ANY role (so OWNER is asserted clean too). */
  moneyFreeForAll?: true;
};

const SCREENS: Screen[] = [
  {
    name: 'payroll page',
    render: () => PayrollPage({ searchParams: Promise.resolve({ year: '2026', month: '1' }) }),
  },
  {
    name: 'payslip print page',
    render: () => PayslipPage({ params: Promise.resolve({ employeeId: 'e1' }), searchParams: { year: '2026', month: '1' } }),
  },
  { name: 'wage types page (/mis/settings/wages)', render: () => WageTypesPage() },
  { name: 'AQL settings page (/mis/settings/aql)', render: () => AqlSettingsPage() },
  {
    name: 'settings page (/mis/settings)',
    render: () => SettingsPage(),
  },
  { name: 'audit log page (/mis/audit)', render: () => AuditPage({ searchParams: Promise.resolve({}) }), moneyFreeForAll: true },
];

describe('MIS-46 · page props by screen × role', () => {
  describe.each(SCREENS)('$name', (screen) => {
    it('OWNER is served, and the sentinel money is visible to the detector (or the page is money-free for everyone)', async () => {
      const f = await figures();
      as('OWNER');
      const res = await outcome(screen.render);
      expect(res).not.toBe('denied');
      if (res === 'denied') return;
      const leaks = findLeaks(payload(res.value), WAGE_DETECTOR(f));
      if (screen.moneyFreeForAll) expect(leaks).toEqual([]);
      else if (!screen.name.startsWith('AQL')) expect(leaks.length).toBeGreaterThan(0);
    });

    it.each(NON_OWNER)('%s is refused or receives a wage-free page', async (role) => {
      const f = await figures();
      as(role);
      const res = await outcome(screen.render);
      if (res === 'denied') return;
      expect(findLeaks(payload(res.value), WAGE_DETECTOR(f)), `${role} received money on ${screen.name}`).toEqual([]);
    });
  });
});

describe('F-02 (fixed in 14F) · the settings page hands an Admin no wage rule', () => {
  const rulesOf = async (role: MisRoleName) => {
    as(role);
    const res = await outcome(() => SettingsPage());
    if (res === 'denied') return null;
    const p = payload(res.value) as { props: { rules: { ruleKey: string }[] } };
    return p.props.rules.map((r) => r.ruleKey);
  };

  it('ADMIN receives the ordinary rules and none of the three wage rules', async () => {
    const keys = await rulesOf('ADMIN');
    expect(keys).toContain('line_clearance.mode');
    expect(keys!.filter((k) => ['DAILY_WAGE_DEFAULT', 'OT_MULTIPLIER', 'LATE_PENALTY_PER_MIN'].includes(k))).toEqual([]);
  });

  it('OWNER receives the wage rules on the same page, and the link flags say so', async () => {
    const keys = await rulesOf('OWNER');
    expect(keys).toEqual(expect.arrayContaining(['DAILY_WAGE_DEFAULT', 'OT_MULTIPLIER', 'LATE_PENALTY_PER_MIN']));
  });

  it.each(NON_OWNER.filter((r) => r !== 'ADMIN'))('%s is refused the settings page', async (role) => {
    expect(await rulesOf(role)).toBeNull();
  });
});

describe('F-01 (fixed in 14F) · the payroll and payslip pages REFUSE all seven non-Owner roles', () => {
  const PAGES: [string, () => Promise<unknown>][] = [
    ['payroll page', () => PayrollPage({ searchParams: Promise.resolve({ year: '2026', month: '1' }) })],
    ['payslip print page', () => PayslipPage({ params: Promise.resolve({ employeeId: 'e1' }), searchParams: { year: '2026', month: '1' } })],
  ];
  describe.each(PAGES)('%s', (_n, render) => {
    it.each(NON_OWNER)('%s is refused (a MisForbiddenError, not a page)', async (role) => {
      as(role);
      expect(await outcome(render)).toBe('denied');
    });
  });
});

describe('MIS-46 · the audit screen never shows a payload', () => {
  it('a wage sitting in an audit row does not reach the page, for ADMIN (settings.read) or OWNER', async () => {
    state.auditRows = [
      { actorId: 'u1', action: 'UPDATE_RULE', entity: 'MisBusinessRule', before: { ruleValue: '649.37' }, after: { ruleValue: '801.23' } },
    ];
    for (const role of ['OWNER', 'ADMIN'] as const) {
      as(role);
      const res = await outcome(() => AuditPage({ searchParams: Promise.resolve({}) }));
      expect(res).not.toBe('denied');
      if (res === 'denied') return;
      const text = JSON.stringify(propsPayload(res.value));
      expect(text).toContain('UPDATE_RULE'); // the row IS on the page...
      expect(text).not.toMatch(/649\.37|801\.23|ruleValue|before|after/); // ...its payload is not.
    }
  });

  it.each(NON_OWNER.filter((r) => r !== 'ADMIN'))('%s cannot open the audit page at all', async (role) => {
    as(role);
    expect(await outcome(() => AuditPage({ searchParams: Promise.resolve({}) }))).toBe('denied');
  });
});

// ---------------------------------------------------------------------------
// Structure: which files may touch wage data at all
// ---------------------------------------------------------------------------
describe('MIS-46 · only registered files import a wage-bearing server module', () => {
  const PAGES = listFiles('src/app', /\.tsx?$/).filter((f) => !/\.test\./.test(f));
  const COMPONENTS = listFiles('src/components', /\.tsx?$/).filter((f) => !/\.test\./.test(f));
  const WAGE_MODULES = ['@/server/mis/payroll', '@/server/mis/wage-type'];

  const importers = (files: string[]) =>
    files.filter((f) => importsOf(f).some((i) => !i.typeOnly && WAGE_MODULES.includes(i.from))).map((f) => f.replace('src/', ''));

  it('a new page or action that imports payroll or wage-type must be added here — and gated', () => {
    expect(importers(PAGES)).toEqual([
      'app/(mis)/mis/dashboard/page.tsx',
      'app/(mis)/mis/page.tsx',
      'app/(mis)/mis/payroll/page.tsx',
      'app/(mis)/mis/print/payslip/[employeeId]/page.tsx',
      'app/(mis)/mis/settings/wages/actions.ts',
      'app/(mis)/mis/settings/wages/page.tsx',
    ]);
  });

  it('no client component imports a server wage module at runtime (types are fine; a server import in a bundle would fail the build; this fails first, with a name)', () => {
    expect(importers(COMPONENTS)).toEqual([]);
  });

  it('the home page fetches the wage bill inside the OWNER screen only — absent, not hidden, for every other role', () => {
    const sf = parse('src/app/(mis)/mis/page.tsx');
    const owners: string[] = [];
    const others: string[] = [];
    sf.forEachChild((node) => {
      if (!ts.isFunctionDeclaration(node) || !node.name || !node.body) return;
      let calls = false;
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && n.expression.getText() === 'getMonthWageBill') calls = true;
        ts.forEachChild(n, visit);
      };
      visit(node.body);
      if (calls) (node.name.text === 'OwnerScreen' ? owners : others).push(node.name.text);
    });
    expect(owners).toEqual(['OwnerScreen']);
    expect(others).toEqual([]);
  });

  it('the settings page sends wage/AQL link flags derived from the matrix, never from the role name', () => {
    const src = parse('src/app/(mis)/mis/settings/page.tsx').getText();
    expect(src).toContain("can(role, 'wages.read')");
    expect(src).toContain("can(role, 'aql.read')");
    expect(src).not.toMatch(/role === ['"]OWNER['"]/);
  });
});
