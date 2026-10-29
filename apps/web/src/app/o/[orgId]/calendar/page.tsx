'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { addDays, addWeeks, eachDayOfInterval, endOfWeek, format, isSameDay, isToday, parseISO, startOfWeek, differenceInMinutes } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { useCalendar, useMembers, useOrg } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, Dialog, DialogContent, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { TaskStatusIcon } from '@/components/domain';
import { AvatarPortrait } from '@/components/avatar';
import { cn, fmtTime, tint } from '@/lib/utils';
import type { CalendarEvent } from '@/lib/types';

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00 – 18:00
const PX = 52;

export default function CalendarPage() {
  const orgId = useOrgId();
  const org = useOrg();
  const path = usePathname();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const days = useMemo(() => eachDayOfInterval({ start: week, end: endOfWeek(week) }), [week]);
  const cal = useCalendar(week.toISOString(), addDays(endOfWeek(week), 1).toISOString());
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const deptColor = (id: string | null) => org.data?.departments.find((d) => d.id === id)?.color ?? '#9aa6d6';

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        icon={<CalendarDays className="text-brand" />}
        title="Calendar"
        subtitle="Meetings and task deadlines you can see"
        actions={
          <>
            <Button variant="ghost" onClick={() => setWeek(startOfWeek(new Date()))}>
              Today
            </Button>
            <Button size="icon" variant="secondary" onClick={() => setWeek(addWeeks(week, -1))} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <span className="w-44 text-center text-[13.5px] font-bold">{format(week, 'MMM d')} – {format(endOfWeek(week), 'MMM d, yyyy')}</span>
            <Button size="icon" variant="secondary" onClick={() => setWeek(addWeeks(week, 1))} aria-label="Next week">
              <ChevronRight />
            </Button>
            {org.data?.me.role !== 'viewer' && (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus /> New event
              </Button>
            )}
          </>
        }
      />
      <Card className="overflow-x-auto p-3">
        <div className="grid min-w-[880px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="pb-2 text-center">
              <p className="text-[11px] font-semibold uppercase text-muted">{format(d, 'EEE')}</p>
              <p className={cn('mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-bold', isToday(d) && 'bg-brand text-white')}>{format(d, 'd')}</p>
              <div className="mt-1 space-y-0.5 px-1">
                {cal.data?.tasks
                  .filter((t) => t.dueDate === format(d, 'yyyy-MM-dd'))
                  .slice(0, 3)
                  .map((t) => (
                    <Link key={t.id} href={`${path}?task=${t.id}`} scroll={false} className="flex items-center gap-1 truncate rounded-md bg-bg px-1.5 py-0.5 text-left text-[10.5px] font-medium hover:bg-brand-soft" title={`Due: ${t.title}`}>
                      <TaskStatusIcon status={t.status} className="h-3 w-3" />
                      <span className="truncate">{t.title}</span>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
          <div className="relative">
            {HOURS.map((h) => (
              <p key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-muted" style={{ top: (h - 8) * PX }}>
                {format(new Date(2020, 0, 1, h), 'h a')}
              </p>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.toISOString()} className="relative border-l border-line" style={{ height: HOURS.length * PX }}>
              {HOURS.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-line/70" style={{ top: (h - 8) * PX }} />
              ))}
              {cal.data?.events
                .filter((e) => isSameDay(parseISO(e.startsAt), d))
                .map((e) => {
                  const s = parseISO(e.startsAt);
                  const top = Math.max(0, (s.getHours() + s.getMinutes() / 60 - 8) * PX);
                  const h = Math.max(22, (differenceInMinutes(parseISO(e.endsAt), s) / 60) * PX - 2);
                  const c = deptColor(e.departmentId);
                  return (
                    <button key={e.id} onClick={() => setSelected(e)} className="absolute left-1 right-1 cursor-pointer overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left" style={{ top, height: h, background: tint(c, 0.8), borderColor: c }}>
                      <p className="truncate text-[11.5px] font-bold text-ink">{e.title}</p>
                      <p className="truncate text-[10.5px] text-ink-2">
                        {fmtTime(e.startsAt)} – {fmtTime(e.endsAt)}
                      </p>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </Card>
      <NewEventDialog open={open} onOpenChange={setOpen} />
      <EventDialog event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function EventDialog({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const members = useMembers();
  const org = useOrg();
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      {event && (
        <DialogContent title={event.title} description={`${format(parseISO(event.startsAt), 'EEEE, MMM d')} · ${fmtTime(event.startsAt)} – ${fmtTime(event.endsAt)}`}>
          {event.description && <p className="mb-3 text-[13px] text-ink-2">{event.description}</p>}
          <p className="mb-1.5 text-[12px] font-semibold text-muted">Attendees</p>
          <div className="flex flex-wrap gap-1.5">
            {event.attendeeIds.map((id) => {
              const m = members.data?.find((x) => x.id === id);
              return m ? (
                <span key={id} className="flex items-center gap-1.5 rounded-full bg-bg py-0.5 pl-0.5 pr-2.5 text-[12px]">
                  <span><Avatar m={m} /></span> {m.name}
                </span>
              ) : null;
            })}
          </div>
          {event.createdByMemberId === org.data?.me.memberId && (
            <div className="mt-4 flex justify-end">
              <Button
                variant="outlineDanger"
                size="sm"
                onClick={async () => {
                  try {
                    await api.del(`/orgs/${orgId}/calendar/${event.id}`);
                    qc.invalidateQueries({ queryKey: ['calendar', orgId] });
                    onClose();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <Trash2 /> Delete event
              </Button>
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

function Avatar({ m }: { m: { name: string } }) {
  return <AvatarPortrait name={m.name} size={22} />;
}

function NewEventDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const orgId = useOrgId();
  const org = useOrg();
  const members = useMembers();
  const qc = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [f, setF] = useState({ title: '', date: today, start: '10:00', end: '10:30', departmentId: 'none', attendees: [] as string[], description: '' });
  const [busy, setBusy] = useState(false);
  const depts = (org.data?.departments ?? []).filter((d) => d.myRole || org.data?.me.role === 'company_admin');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New event">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const startsAt = new Date(`${f.date}T${f.start}`).toISOString();
              const endsAt = new Date(`${f.date}T${f.end}`).toISOString();
              await api.post(`/orgs/${orgId}/calendar`, { title: f.title, description: f.description || undefined, startsAt, endsAt, departmentId: f.departmentId === 'none' ? null : f.departmentId, attendeeIds: f.attendees });
              qc.invalidateQueries({ queryKey: ['calendar', orgId] });
              onOpenChange(false);
              toast.success('Event created');
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Title">
            <Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Date">
              <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
            <Field label="Start">
              <Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
            </Field>
            <Field label="End">
              <Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
            </Field>
          </div>
          <Field label="Department">
            <Select value={f.departmentId} onValueChange={(v) => setF({ ...f, departmentId: v })} options={[{ value: 'none', label: 'Company-wide / personal' }, ...depts.map((d) => ({ value: d.id, label: d.name }))]} />
          </Field>
          <Field label="Attendees">
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {(members.data ?? [])
                .filter((m) => m.id !== org.data?.me.memberId)
                .map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                    <input type="checkbox" checked={f.attendees.includes(m.id)} onChange={(e) => setF({ ...f, attendees: e.target.checked ? [...f.attendees, m.id] : f.attendees.filter((x) => x !== m.id) })} />
                    {m.name}
                  </label>
                ))}
            </div>
          </Field>
          <Field label="Notes">
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!f.title.trim()}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
