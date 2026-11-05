'use client';

import { useEffect, useState } from 'react';

/** Returns `value` after it has stopped changing for `ms`. Used by every list search so typing never fires a request per key. */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
