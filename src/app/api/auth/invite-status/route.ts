import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/server/db';
import { hasPendingInviteForEmail } from '@/server/auth';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.email) {
      return NextResponse.json({
        status: 'no_session',
        message: 'This invite link is invalid or has expired. Ask your administrator to resend the invite.',
      });
    }

    const email = user.email.toLowerCase();
    const pending = await hasPendingInviteForEmail(email);

    if (!pending) {
      const profile = await db.userProfile.findFirst({ where: { email } });
      if (profile) {
        return NextResponse.json({
          status: 'already_complete',
          message: 'Your account is already set up. You can sign in.',
          email,
        });
      }
      return NextResponse.json({
        status: 'already_complete',
        message: 'No pending invite found for this account.',
        email,
      });
    }

    const invite = await db.userInvite.findFirst({
      where: { email, status: 'pending' },
      select: { role: true },
    });

    return NextResponse.json({
      status: 'ready',
      email,
      role: invite?.role ?? 'member',
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Unable to verify invite status. Please try again.',
      },
      { status: 500 },
    );
  }
}
