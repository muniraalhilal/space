'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { MessageCircle, Send, PenSquare } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations, useMembers, useMessages, useOrg, qk } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, Empty, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { AvatarPortrait, PresenceBadge, PresenceDot } from '@/components/avatar';
import { ago, cn, fmtTime } from '@/lib/utils';
import { format, isSameDay, parseISO } from 'date-fns';

export default function MessagesPage() {
  const orgId = useOrgId();
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const qc = useQueryClient();
  const org = useOrg();
  const convs = useConversations();
  const members = useMembers();
  const active = sp.get('c') ?? convs.data?.[0]?.id ?? null;
  const msgs = useMessages(active);
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const conv = convs.data?.find((c) => c.id === active);
  const me = org.data?.me.memberId;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.data?.length, active]);
  useEffect(() => {
    if (active && conv?.unread) api.post(`/orgs/${orgId}/conversations/${active}/read`).then(() => qc.invalidateQueries({ queryKey: qk.conversations(orgId) }));
  }, [active, conv?.unread, orgId, qc]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !active) return;
    const body = text.trim();
    setText('');
    try {
      await api.post(`/orgs/${orgId}/conversations/${active}/messages`, { body });
      qc.invalidateQueries({ queryKey: qk.messages(orgId, active) });
      qc.invalidateQueries({ queryKey: qk.conversations(orgId) });
    } catch (err) {
      toast.error(errorMessage(err));
      setText(body);
    }
  }
  async function startWith(memberId: string) {
    const c = await api.post<{ id: string }>(`/orgs/${orgId}/conversations`, { memberId });
    await qc.invalidateQueries({ queryKey: qk.conversations(orgId) });
    router.push(`${path}?c=${c.id}`);
  }

  return (
    <div className="mx-auto grid h-full max-w-[1200px] grid-cols-1 gap-3 md:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <MessageCircle className="h-4 w-4 text-brand" /> Messages
          </p>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="iconSm" variant="ghost" aria-label="New message">
                <PenSquare />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Message someone…" className="mb-1 h-9 w-full rounded-lg bg-bg px-3 text-[13px] outline-none" />
              <div className="max-h-72 overflow-y-auto">
                {(members.data ?? [])
                  .filter((m) => m.id !== me && m.name.toLowerCase().includes(find.toLowerCase()))
                  .map((m) => (
                    <button key={m.id} onClick={() => startWith(m.id)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-bg">
                      <AvatarPortrait name={m.name} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold">{m.name}</span>
                        <span className="block truncate text-[11px] text-muted">{m.title}</span>
                      </span>
                    </button>
                  ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {!convs.data?.length && <Empty title="No conversations yet" body="Start one with the pencil button." />}
          {convs.data?.map((c) => (
            <button key={c.id} onClick={() => router.push(`${path}?c=${c.id}`)} className={cn('flex w-full cursor-pointer gap-3 rounded-xl p-2.5 text-left', c.id === active ? 'bg-brand-soft/60' : 'hover:bg-bg')}>
              <span className="relative">
                <AvatarPortrait name={c.other?.name} size={40} />
                {c.other && <PresenceDot status={c.other.presence} className="absolute bottom-0 right-0" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[13px] font-bold">{c.other?.name ?? 'Former member'}</span>
                  <span className="text-[10.5px] text-muted">{c.lastMessage ? ago(c.lastMessage.createdAt) : ''}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn('flex-1 truncate text-[12px]', c.unread ? 'font-semibold text-ink' : 'text-muted')}>{c.lastMessage?.body ?? 'No messages yet'}</span>
                  {c.unread > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef5b6b] px-1 text-[10px] font-bold text-white">{c.unread}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Card>
      <Card className="flex min-h-[480px] flex-col overflow-hidden">
        {!conv ? (
          <Empty icon={<MessageCircle />} title="Select a conversation" />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <AvatarPortrait name={conv.other?.name} size={38} />
              <div className="flex-1">
                <p className="text-[14px] font-bold">{conv.other?.name}</p>
                <p className="text-[12px] text-muted">{conv.other?.title}</p>
              </div>
              {conv.other && <PresenceBadge status={conv.other.presence} />}
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-4">
              {msgs.data?.map((m, i) => {
                const mine = m.senderMemberId === me;
                const prev = msgs.data![i - 1];
                const newDay = !prev || !isSameDay(parseISO(prev.createdAt), parseISO(m.createdAt));
                return (
                  <div key={m.id}>
                    {newDay && <p className="my-3 text-center text-[11px] font-semibold text-muted">{format(parseISO(m.createdAt), 'EEEE, MMM d')}</p>}
                    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[70%] rounded-2xl px-3.5 py-2 text-[13.5px]', mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-bg')}>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className={cn('mt-0.5 text-right text-[10.5px]', mine ? 'text-white/70' : 'text-muted')}>{fmtTime(m.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="flex items-center gap-2 border-t border-line p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${conv.other?.name.split(' ')[0] ?? ''}…`} aria-label="Message" className="h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-[13.5px] outline-none focus:ring-4 focus:ring-brand/10" />
              <Button type="submit" variant="primary" size="icon" aria-label="Send" disabled={!text.trim()}>
                <Send />
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
