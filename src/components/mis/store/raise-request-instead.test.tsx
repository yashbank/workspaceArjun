/** R2-358 — a Supervisor on /mis/store/issue gets a way back and the one action that does the job. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RaiseRequestInstead } from './raise-request-instead';

describe('R2-358 RaiseRequestInstead', () => {
  it('links to the new-request form and offers a way back', () => {
    render(<RaiseRequestInstead header={{ title: 'Issue', meta: 'today' }} />);
    expect(screen.getByRole('link', { name: 'Raise a Material Request' }).getAttribute('href')).toBe('/mis/store/requests/new');
    expect(screen.getByRole('link', { name: /Home/ }).getAttribute('href')).toBe('/mis');
    expect(screen.getByText(/Supervisors cannot issue stock/)).toBeTruthy();
  });
});
