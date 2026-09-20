import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // sw.js is public and static. A service-worker script that is redirected — to
    // /login, for a signed-out request — is rejected by the browser outright, so it
    // is exempt like the other static files (D16).
    '/((?!_next/static|_next/image|favicon.ico|healthz|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
