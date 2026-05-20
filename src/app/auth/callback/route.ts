import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getInviteAcceptPath } from '@/server/auth';

/**
 * Handles Supabase PKCE callbacks (invite, recovery, magic link, OAuth).
 * Routes invite users to password setup before the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const next = searchParams.get('next');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  let redirectPath = next ?? '/';

  if (type === 'recovery' || type === 'signup') {
    redirectPath = '/reset-password';
  } else if (
    type === 'invite' ||
    next === getInviteAcceptPath() ||
    next?.startsWith('/invite/')
  ) {
    redirectPath = getInviteAcceptPath();
  }

  if (!redirectPath.startsWith('/')) {
    redirectPath = `/${redirectPath}`;
  }

  return NextResponse.redirect(`${origin}${redirectPath}`);
}
