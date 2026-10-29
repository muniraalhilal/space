'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { SceneRoom } from './OfficeScene';
import { AvatarPortrait, RobotPortrait, PresenceDot } from '@/components/avatar';
import { DeptIcon } from '@/components/domain';
import { useUi } from '@/lib/ui-store';
import { useOrgId } from '@/lib/org-context';
import { cn, tint } from '@/lib/utils';

/**
 * Accessible 2D floor view: fully keyboard navigable, no WebGL required. Also the recommended view
 * for very large companies where one 3D scene would be crowded.
 */
export function Office2D({ rooms }: { rooms: SceneRoom[] }) {
  const orgId = useOrgId();
  const { selectedDept, selectDept, selectEntity } = useUi();
  const xs = [...new Set(rooms.map((r) => r.x))].sort((a, b) => a - b);
  const zs = [...new Set(rooms.map((r) => r.z))].sort((a, b) => a - b);
  return (
    <div className="absolute inset-0 overflow-auto p-5 pb-20">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(xs.length, 3)}, minmax(220px, 1fr))` }}>
        {rooms.map((r) => (
          <section
            key={r.id}
            aria-label={`${r.name} department`}
            className={cn('rounded-2xl border bg-white/90 p-3.5 shadow-sm transition', selectedDept === r.id ? 'border-brand ring-2 ring-brand/20' : 'border-line')}
            style={{ gridColumn: xs.indexOf(r.x) + 1, gridRow: zs.indexOf(r.z) + 1, background: `linear-gradient(180deg, ${tint(r.color, 0.86)}, #ffffff 60%)` }}
          >
            <button onClick={() => selectDept(r.id)} className="flex w-full cursor-pointer items-center gap-2.5 text-left">
              <DeptIcon theme={r.theme} color={r.color} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold">{r.name}</span>
                <span className="block text-[11.5px] text-muted">{r.memberCount} members · {r.agents.length} agents</span>
              </span>
            </button>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.people.map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => {
                    const rect = (e.currentTarget.closest('[data-office]') as HTMLElement).getBoundingClientRect();
                    const b = e.currentTarget.getBoundingClientRect();
                    selectEntity({ kind: 'member', id: p.id, screen: { x: b.left - rect.left, y: b.top - rect.top + 40 } });
                  }}
                  className="relative cursor-pointer rounded-full focus-visible:ring-2"
                  aria-label={`${p.name}`}
                  title={p.name}
                >
                  <AvatarPortrait name={p.name} size={34} />
                  <PresenceDot status={p.presence} className="absolute -bottom-0 -right-0" />
                </button>
              ))}
              {r.agents.map((a) => (
                <button
                  key={a.id}
                  onClick={(e) => {
                    const rect = (e.currentTarget.closest('[data-office]') as HTMLElement).getBoundingClientRect();
                    const b = e.currentTarget.getBoundingClientRect();
                    selectEntity({ kind: 'agent', id: a.id, screen: { x: b.left - rect.left, y: b.top - rect.top + 40 } });
                  }}
                  className="cursor-pointer rounded-full"
                  aria-label={`${a.name} (AI agent)`}
                  title={`${a.name} (AI agent)`}
                >
                  <RobotPortrait config={a.robot} size={34} dim={a.status === 'disabled'} />
                </button>
              ))}
            </div>
            <Link href={`/o/${orgId}/departments/${r.id}`} className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-ink hover:underline">
              Open department <ArrowRight className="h-3 w-3" />
            </Link>
          </section>
        ))}
      </div>
    </div>
  );
}
