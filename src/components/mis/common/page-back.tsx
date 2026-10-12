import Link from 'next/link';

/** "← Label" link to a page's parent. 44px tap target, readable slate-600 text. */
export function PageBack({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
