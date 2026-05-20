import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { completeInviteAcceptance, hasPendingInviteForEmail } from '@/server/auth';

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.email) {
      return NextResponse.json(
        { error: 'Invalid or expired invite session. Please use the link from your email again.' },
        { status: 401 },
      );
    }

    const email = user.email.toLowerCase();
    const pending = await hasPendingInviteForEmail(email);
    if (!pending) {
      return NextResponse.json(
        { error: 'This invite has already been accepted or is no longer valid.' },
        { status: 400 },
      );
    }

    const profile = await completeInviteAcceptance({
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    });

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to complete invite';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
