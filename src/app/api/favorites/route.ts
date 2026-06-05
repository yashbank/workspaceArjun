import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAccessBlockedError, accessBlockedResponse } from '@/lib/api-error';
import { requireUser } from '@/server/auth';
import { listFavorites, addFavorite, removeFavorite } from '@/server/favorites';

export async function GET() {
  try {
    const user = await requireUser();
    const favorites = await listFavorites(user.id);
    return NextResponse.json(favorites);
  } catch (e: unknown) {
    if (isAccessBlockedError(e)) return accessBlockedResponse();
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { targetType, targetId } = (await request.json()) as {
      targetType: 'file' | 'folder';
      targetId: string;
    };
    const fav = await addFavorite(targetType, targetId);
    return NextResponse.json(fav, { status: 201 });
  } catch (e: unknown) {
    if (isAccessBlockedError(e)) return accessBlockedResponse();
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { targetType, targetId } = (await request.json()) as {
      targetType: 'file' | 'folder';
      targetId: string;
    };
    await removeFavorite(targetType, targetId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (isAccessBlockedError(e)) return accessBlockedResponse();
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
