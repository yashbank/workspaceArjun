import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  mapCallbackOtpType,
  resolveAuthCallbackRedirect,
  resolveAuthCallbackErrorRedirect,
} from '@/server/auth/callback-redirect';

/**
 * Handles Supabase auth callbacks:
 * - token_hash + type (invite/recovery email links)
 * - PKCE code exchange (OAuth / legacy flows)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next');

  const supabase = await createSupabaseServerClient();

  if (tokenHash) {
    const otpType = mapCallbackOtpType(type);
    if (!otpType) {
      return NextResponse.redirect(resolveAuthCallbackErrorRedirect(origin, type));
    }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[auth.callback] verifyOtp failed:', {
          type: otpType,
          message: error.message,
          status: error.status,
          name: error.name,
        });
      }
      return NextResponse.redirect(resolveAuthCallbackErrorRedirect(origin, type));
    }

    const redirectPath = resolveAuthCallbackRedirect(type, next);
    return NextResponse.redirect(`${origin}${redirectPath}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[auth.callback] exchangeCodeForSession failed:', {
          message: error.message,
          status: error.status,
          name: error.name,
        });
      }
      return NextResponse.redirect(resolveAuthCallbackErrorRedirect(origin, type));
    }

    let redirectPath = resolveAuthCallbackRedirect(type, next);
    if (!redirectPath.startsWith('/')) {
      redirectPath = `/${redirectPath}`;
    }

    return NextResponse.redirect(`${origin}${redirectPath}`);
  }

  return NextResponse.redirect(resolveAuthCallbackErrorRedirect(origin, type));
}
