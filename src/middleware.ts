import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { isMisEnabled } from '@/server/mis/flags';

/**
 * Next.js Middleware
 *
 * Handles MIS route protection:
 * - Intercepts requests to /mis routes
 * - Checks if MIS feature is enabled for the user
 * - Returns 404 if disabled (not 403 to hide feature existence)
 */
export async function middleware(request: NextRequest) {
  // Only protect /mis routes
  if (request.nextUrl.pathname.startsWith('/mis')) {
    // Get session to extract userId
    const session = await auth();

    // If no session or user, redirect to login
    if (!session || !session.user?.id) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Check if MIS is enabled for this user
    if (!isMisEnabled(session.user.id)) {
      // Return 404 (not 403) to hide feature existence
      return NextResponse.notFound();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
