import { NextResponse } from 'next/server';
import { listDocuments } from '@/server/mis/documents';

export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const docs = await listDocuments(orderId);
    return NextResponse.json(docs);
  } catch (err: any) {
    if (err?.message === 'Forbidden' || err?.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
