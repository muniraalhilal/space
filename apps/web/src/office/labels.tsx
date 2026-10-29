'use client';
import type { DeptTheme } from '@space/shared';
import { DEPT_ICON, shadeFor } from '@/components/domain';
import { tint, cn } from '@/lib/utils';

/** Department name pill floating above a room (matches the approved soft card style). */
export function DeptPill({ name, theme, color, desks, inOffice, remote, compact, active }: { name: string; theme: DeptTheme; color: string; desks: number; inOffice: number; remote: number; compact?: boolean; active?: boolean }) {
  const Icon = DEPT_ICON[theme];
  return (
    <div
      className={cn('flex select-none items-center gap-2.5 whitespace-nowrap rounded-2xl bg-white/95 py-2 pl-2 pr-4 shadow-[0_8px_24px_-10px_rgba(38,35,58,0.35)] ring-1 ring-black/[0.03] backdrop-blur transition', compact && 'scale-90 opacity-80', active && 'ring-2')}
      style={active ? ({ '--tw-ring-color': color } as React.CSSProperties) : undefined}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: tint(color, 0.7) }}>
        <Icon style={{ width: 16, height: 16, color: shadeFor(color) }} />
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] font-bold text-ink">{name}</span>
        {!compact && <span className="block text-[11px] font-medium text-muted">{desks} desks · {inOffice} in office · {remote} remote</span>}
      </span>
    </div>
  );
}
