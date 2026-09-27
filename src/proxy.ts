import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // sw.js and manifest.json are public and static. A service-worker script or the
    // PWA manifest that gets redirected — to /login, for a signed-out request — is
    // rejected by the browser outright (a manifest fetched via redirect is invalid
    // per the spec, and an install prompt or icon never appears), so both are exempt
    // like the other static files (D16, MIS-82).
    '/((?!_next/static|_next/image|favicon.ico|healthz|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
