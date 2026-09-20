import { redirect } from 'next/navigation';

/**
 * /mis/dashboard is the address people keep typing and bookmarking. The home
 * screen is /mis; this exists so the old link lands there instead of a 404.
 */
export default function MisDashboardRedirect(): never {
  redirect('/mis');
}
