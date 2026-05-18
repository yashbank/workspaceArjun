'use client';

import { useEffect, useState } from 'react';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getLocalDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function ClientGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe: compute greeting from client clock after mount
    setGreeting(getGreeting());
    setMounted(true);
  }, []);

  return (
    <h1 className="text-2xl font-bold tracking-tight">
      {mounted ? `Good ${greeting}, ${name}` : `Welcome, ${name}`}
    </h1>
  );
}

export function ClientDate() {
  const [date, setDate] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe: compute local date from client after mount
    setDate(getLocalDate());
  }, []);

  if (!date) return null;

  return (
    <span className="tabular-nums">{date}</span>
  );
}
