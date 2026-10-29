import { cn } from '@/lib/utils';

/** The Space mark: an orbit around a soft planet — original artwork. */
export function SpaceLogo({ size = 28, className, color = 'var(--brand)' }: { size?: number; className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id="space-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a5a8ff" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="10.5" fill="url(#space-g)" />
      <ellipse cx="20" cy="20" rx="18" ry="7" fill="none" stroke={color} strokeWidth="2.4" transform="rotate(-24 20 20)" opacity="0.9" />
      <circle cx="33.5" cy="13.2" r="2.6" fill="#f2b8c6" />
    </svg>
  );
}

export function Wordmark({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <SpaceLogo />
      <div className="leading-tight">
        <div className="text-[16px] font-extrabold tracking-[-0.02em] text-ink">{name}</div>
        {sub && <div className="text-[11px] font-medium text-muted">{sub}</div>}
      </div>
    </div>
  );
}
