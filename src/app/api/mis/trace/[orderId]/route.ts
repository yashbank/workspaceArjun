import { NextResponse } from 'next/server';
import { getOrderTrace } from '@/server/mis/traceability';

export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const trace = await getOrderTrace(orderId);
    return NextResponse.json(trace);
  } catch (err: any) {
    if (err?.message === 'Forbidden' || err?.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
