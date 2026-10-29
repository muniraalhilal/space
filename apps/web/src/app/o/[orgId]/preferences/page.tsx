'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SlidersHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PRESENCE_LABEL, PRESENCE_STATUSES, presenceGroup, type PresenceStatus } from '@space/shared';
import { useMe, useOrg, useApiMutation, qk } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { useUi } from '@/lib/ui-store';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, Field, Input, PageHeader, Segmented, Skeleton, Switch } from '@/components/ui/primitives';
import { AvatarPortrait, presenceColor } from '@/components/avatar';
import { cn } from '@/lib/utils';

const GROUP_HINT = { in_office: 'Shown with a green pin at your desk', remote: 'Shown with a blue pin — your desk is empty', away: 'Shown with a yellow pin', offline: 'Shown with a grey pin' } as const;

export default function PreferencesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const me = useMe();
  const org = useOrg();
  const ui = useUi();
  const [title, setTitle] = useState('');
  useEffect(() => setTitle(org.data?.me.title ?? ''), [org.data?.me.title]);
  const setMe = useApiMutation((b: object) => api.patch(`/orgs/${orgId}/me`, b), () => [qk.org(orgId), qk.members(orgId)]);
  const savePref = async (p: Record<string, boolean>) => {
    try {
      await api.patch('/auth/me/preferences', p);
      await qc.invalidateQueries({ queryKey: qk.me });
      toast.success('Preference saved');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (me.isLoading || org.isLoading) return <Skeleton className="mx-auto h-96 max-w-[760px]" />;
  const prefs = me.data!.user.preferences;
  const presence = org.data!.me.presence;

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader icon={<SlidersHorizontal className="text-brand" />} title="Preferences" subtitle="These settings are yours only." />

      <Card className="mb-4 p-6">
        <div className="mb-4 flex items-center gap-3">
          <AvatarPortrait name={org.data!.me.name} size={48} />
          <div>
            <p className="text-[15px] font-bold">{org.data!.me.name}</p>
            <p className="text-[12.5px] text-muted">{me.data!.user.email}</p>
          </div>
        </div>
        <Field label="Job title" hint={`How you appear to people in ${org.data!.organization.displayName}.`}>
          <div className="flex gap-2">
            <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            <Button variant="secondary" disabled={title === (org.data!.me.title ?? '') || setMe.isPending} onClick={() => setMe.mutate({ title: title.trim() }, { onSuccess: () => toast.success('Title updated'), onError: (e) => toast.error(errorMessage(e)) })}>
              Save
            </Button>
          </div>
        </Field>
      </Card>

      <Card className="mb-4 p-6">
        <h2 className="text-[15px] font-bold">Your status</h2>
        <p className="mb-3 text-[12.5px] text-muted">Teammates see this on your desk in the office and next to your name.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESENCE_STATUSES.map((p: PresenceStatus) => (
            <button
              key={p}
              aria-pressed={presence === p}
              onClick={() => setMe.mutate({ presence: p }, { onError: (e) => toast.error(errorMessage(e)) })}
              className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12.5px] font-semibold transition', presence === p ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line text-ink-2 hover:border-line-strong')}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: presenceColor[p] }} />
              {PRESENCE_LABEL[p]}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-muted">{GROUP_HINT[presenceGroup(presence)]}.</p>
      </Card>

      <Card className="mb-8 p-6">
        <h2 className="mb-4 text-[15px] font-bold">Office & display</h2>
        <div className="space-y-5">
          <Row title="Focus Mode" body="Calms the office: fewer decorations, softer colours, no animation. You can also toggle it from the top bar.">
            <Switch
              label="Focus Mode"
              checked={ui.focusMode}
              onCheckedChange={(v) => {
                ui.setFocusMode(v);
                savePref({ focusMode: v });
              }}
            />
          </Row>
          <Row title="Reduce motion" body="Stops robot and plant animation in the office. Your device’s reduced-motion setting is always respected too.">
            <Switch
              label="Reduce motion"
              checked={!!prefs.reducedMotion}
              onCheckedChange={(v) => {
                ui.setReducedMotion(v);
                savePref({ reducedMotion: v });
              }}
            />
          </Row>
          <Row title="Default office view" body="The 2D map is lighter and fully keyboard accessible.">
            <Segmented
              value={(prefs.office3d ?? true) ? '3d' : '2d'}
              onChange={(v) => {
                ui.setView3d(v === '3d');
                savePref({ office3d: v === '3d' });
              }}
              options={[
                { value: '3d', label: '3D office' },
                { value: '2d', label: '2D map' },
              ]}
            />
          </Row>
        </div>
      </Card>
    </div>
  );
}

function Row({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1">
        <p className="text-[13.5px] font-semibold">{title}</p>
        <p className="text-[12px] text-muted">{body}</p>
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}
