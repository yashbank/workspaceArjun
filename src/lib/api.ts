/** Typed fetch helper that throws on non-2xx responses. */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    throw new Error(
      msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')
        ? 'Network error — check your connection and try again'
        : msg,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return {} as T;
  }

  if (!res.ok) {
    const errMsg = (data.error as string) ?? `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}
