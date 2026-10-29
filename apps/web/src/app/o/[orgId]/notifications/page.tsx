'use client';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { useNotifications, useApiMutation, qk } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api } from '@/lib/api';
import { Button, Card, Empty, PageHeader } from '@/components/ui/primitives';
import { notificationHref } from '@/components/shell/Header';
import { ago, cn } from '@/lib/utils';

export default function NotificationsPage() {
  const orgId = useOrgId();
  const router = useRouter();
  const n = useNotifications();
  const all = useApiMutation(() => api.post(`/orgs/${orgId}/notifications/all/read`), () => [qk.notifications(orgId)]);
  const one = useApiMutation((id: string) => api.post(`/orgs/${orgId}/notifications/${id}/read`), () => [qk.notifications(orgId)]);
  return (
    <div className="mx-auto max-w-[820px]">
      <PageHeader
        icon={<Bell className="text-peach-ink" />}
        title="Notifications"
        subtitle={`${n.data?.unread ?? 0} unread`}
        actions={
          <Button onClick={() => all.mutate(undefined as never)} disabled={!n.data?.unread}>
            <CheckCheck /> Mark all read
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {!n.data?.items.length ? (
          <Empty icon={<Inbox />} title="You’re all caught up" />
        ) : (
          <div className="divide-y divide-line">
            {n.data.items.map((x) => (
              <button
                key={x.id}
                onClick={() => {
                  if (!x.readAt) one.mutate(x.id);
                  router.push(notificationHref(orgId, x));
                }}
                className={cn('flex w-full cursor-pointer items-start gap-3 px-5 py-3.5 text-left hover:bg-bg-soft', !x.readAt && 'bg-brand-soft/25')}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', x.readAt ? 'bg-transparent' : 'bg-brand')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{x.title}</span>
                  {x.body && <span className="mt-0.5 block text-[12.5px] text-muted">{x.body}</span>}
                </span>
                <span className="shrink-0 text-[11.5px] text-muted">{ago(x.createdAt)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
