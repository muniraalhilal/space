'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Sheet } from '@/components/ui/primitives';
import { TaskDetailView } from './TaskDrawer';
import { RequestDetailView } from './RequestDrawer';
import { RunDetailView } from './RunDrawer';

/**
 * URL-driven side drawers (?task=…, ?request=…, ?run=…) so any screen — and any link in a
 * notification or popup — can open details without losing context. Links stay shareable.
 */
function Drawers() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const task = sp.get('task');
  const request = sp.get('request');
  const run = sp.get('run');
  const close = (key: string) => {
    const next = new URLSearchParams(sp.toString());
    next.delete(key);
    const q = next.toString();
    router.replace(q ? `${path}?${q}` : path, { scroll: false });
  };
  return (
    <>
      <Sheet open={!!request && !task} onOpenChange={(o) => !o && close('request')} title="Request details">
        {request && <RequestDetailView id={request} onClose={() => close('request')} />}
      </Sheet>
      <Sheet open={!!task} onOpenChange={(o) => !o && close('task')} title="Task details">
        {task && <TaskDetailView id={task} onClose={() => close('task')} />}
      </Sheet>
      <Sheet open={!!run && run !== 'new'} onOpenChange={(o) => !o && close('run')} title="Agent run">
        {run && run !== 'new' && <RunDetailView id={run} onClose={() => close('run')} />}
      </Sheet>
    </>
  );
}

export function GlobalDrawers() {
  return (
    <Suspense fallback={null}>
      <Drawers />
    </Suspense>
  );
}
