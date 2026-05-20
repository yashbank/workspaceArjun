import type { Metadata } from 'next';
import { PAGE_TITLES } from '@/lib/site';

export const metadata: Metadata = {
  title: PAGE_TITLES.accountName,
};

export default function AccountNameLayout({ children }: { children: React.ReactNode }) {
  return children;
}
