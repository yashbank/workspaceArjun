import type { Metadata } from 'next';
import { FileBrowser } from '@/components/files/file-browser';
import { PAGE_TITLES } from '@/lib/site';

export const metadata: Metadata = {
  title: PAGE_TITLES.files,
};

export default function FilesPage() {
  return <FileBrowser />;
}
