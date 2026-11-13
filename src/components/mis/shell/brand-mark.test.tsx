/**
 * Go-live QA: the BP brand mark must render in the phone header and the desktop rail for EVERY
 * role, including the roles the 26 go-live logins use. It is unconditional: no role, profile
 * field or theme setting gates it. (The Production "factory" nav icon is a different thing: it
 * is permission-gated by design via production.read.)
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { navigationForRole } from '@/server/mis/navigation';
import { MIS_ROLES } from '@/lib/mis/roles';

vi.mock('next/navigation', () => ({ usePathname: () => '/mis/masters', useRouter: () => ({ push: vi.fn() }) }));

const { MisShell } = await import('./mis-shell');

describe.each([...MIS_ROLES, null] as const)('brand mark as %s', (role) => {
  it('is in the desktop rail and the phone header', () => {
    const { container } = render(
      <MisShell
        factoryName="Bhaskar Paper Products"
        userId="new-user"
        userName="New Login"
        role={role}
        locale="en"
        navAll={navigationForRole(role)}
        navMore={navigationForRole(role, 'phone')}
        onLocaleChange={vi.fn()}
      >
        <p>body</p>
      </MisShell>,
    );
    const marks = container.querySelectorAll('[data-testid="brand-mark"]');
    expect(marks).toHaveLength(2);
    expect(container.querySelector('aside [data-testid="brand-mark"]')).not.toBeNull();
    expect(container.querySelector('header [data-testid="brand-mark"]')).not.toBeNull();
  });
});
