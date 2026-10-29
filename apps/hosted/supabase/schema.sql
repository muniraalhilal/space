-- Space on Supabase (free plan): one document table + row-level security.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Every company-owned document carries org_id. The policies below make the DATABASE enforce:
--   * tenant isolation: you only read or change documents of companies you belong to,
--   * private messages: only the two people in a conversation can read it,
--   * identities: you can only act as a person who is yours (or a shared demo person).
-- Finer role rules (admin vs employee vs viewer) are enforced by the app.

create table if not exists public.docs (
  collection text not null,
  id text not null,
  org_id text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists docs_org_idx on public.docs (collection, org_id);
alter table public.docs enable row level security;
alter table public.docs replica identity full;

-- ---------------------------------------------------------------- helper functions
-- SECURITY DEFINER so policies can look things up without recursive RLS.
create or replace function public.space_my_user_id() returns text
language sql stable security definer set search_path = public as $$
  select d.data->>'userId' from docs d where d.collection = 'identities' and d.id = auth.uid()::text
$$;

create or replace function public.space_is_member(org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from docs m
    where m.collection = 'orgMembers' and m.org_id = org
      and m.data->>'userId' = public.space_my_user_id()
      and coalesce(m.data->>'deactivatedAt', '') = ''
  )
$$;

create or replace function public.space_is_admin(org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from docs m
    where m.collection = 'orgMembers' and m.org_id = org
      and m.data->>'userId' = public.space_my_user_id()
      and m.data->>'role' = 'company_admin'
      and coalesce(m.data->>'deactivatedAt', '') = ''
  )
$$;

create or replace function public.space_my_member_ids() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.id), '{}') from docs m
  where m.collection = 'orgMembers' and m.data->>'userId' = public.space_my_user_id()
$$;

create or replace function public.space_org_is_demo(org text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (o.data->>'isDemo')::boolean from docs o where o.collection = 'organizations' and o.id = org), false)
$$;

create or replace function public.space_org_has_members(org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs m where m.collection = 'orgMembers' and m.org_id = org)
$$;

-- May the signed-in account act as this Space person?
create or replace function public.space_can_be(uid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from docs u where u.collection = 'users' and u.id = uid and (
      coalesce((u.data->>'demo')::boolean, false)
      or u.data->>'authUid' = auth.uid()::text
      or (coalesce(u.data->>'authUid', '') = '' and lower(u.data->>'email') = lower(auth.jwt()->>'email'))
    )
  )
$$;

create or replace function public.space_in_conversation(conv text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs c where c.collection = 'conversations' and c.id = conv and (c.data->'members') ?| public.space_my_member_ids())
$$;

-- Users visible to me: myself, demo people, people who share a company with me, invites addressed to me.
create or replace function public.space_can_see_user(uid text, d jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((d->>'demo')::boolean, false)
    or d->>'authUid' = auth.uid()::text
    or lower(d->>'email') = lower(auth.jwt()->>'email')
    or exists (
      select 1 from docs m where m.collection = 'orgMembers' and m.data->>'userId' = uid and public.space_is_member(m.org_id)
    )
$$;

-- ---------------------------------------------------------------- policies
drop policy if exists docs_select on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;

create policy docs_select on public.docs for select to authenticated using (
  case
    when collection = 'identities' then id = auth.uid()::text
    when collection = 'users' then public.space_can_see_user(id, data)
    when collection = 'organizations' then public.space_is_member(id) or coalesce((data->>'isDemo')::boolean, false)
    when collection = 'conversations' then public.space_is_member(org_id) and (data->'members') ?| public.space_my_member_ids()
    when collection = 'messages' then public.space_is_member(org_id) and public.space_in_conversation(data->>'conversationId')
    when org_id is not null then public.space_is_member(org_id) or (collection in ('departments', 'orgMembers') and public.space_org_is_demo(org_id))
    else false
  end
);

create policy docs_insert on public.docs for insert to authenticated with check (
  case
    when collection = 'identities' then id = auth.uid()::text and public.space_can_be(data->>'userId')
    when collection = 'users' then coalesce(data->>'authUid', '') in ('', auth.uid()::text)
    when collection = 'organizations' then true
    when collection = 'orgMembers' then public.space_is_member(org_id)
      or (not public.space_org_has_members(org_id))
      or (public.space_org_is_demo(org_id) and data->>'userId' = public.space_my_user_id())
    when collection = 'auditLogs' and org_id is null then true
    when org_id is not null then public.space_is_member(org_id)
    else false
  end
);

create policy docs_update on public.docs for update to authenticated using (
  case
    when collection = 'identities' then id = auth.uid()::text
    when collection = 'users' then coalesce(data->>'authUid', '') in ('', auth.uid()::text) or coalesce((data->>'demo')::boolean, false) or public.space_can_see_user(id, data)
    when collection = 'organizations' then public.space_is_admin(id) or public.space_is_member(id)
    when org_id is not null then public.space_is_member(org_id)
    else false
  end
) with check (
  case
    when collection = 'identities' then id = auth.uid()::text and public.space_can_be(data->>'userId')
    when collection = 'users' then coalesce(data->>'authUid', '') in ('', auth.uid()::text) or coalesce((data->>'demo')::boolean, false) or public.space_can_see_user(id, data)
    when collection = 'organizations' then public.space_is_member(id)
    when org_id is not null then public.space_is_member(org_id)
    else false
  end
);

create policy docs_delete on public.docs for delete to authenticated using (
  case
    when collection = 'identities' then id = auth.uid()::text
    when collection = 'organizations' then public.space_is_admin(id) and not coalesce((data->>'isDemo')::boolean, false)
    when collection = 'users' then false
    when org_id is not null then public.space_is_member(org_id)
    else false
  end
);

-- ---------------------------------------------------------------- guards against privilege escalation
create or replace function public.space_is_dept_admin(org text, dept text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from docs dm where dm.collection = 'departmentMembers' and dm.org_id = org
      and dm.data->>'departmentId' = dept and dm.data->>'role' = 'admin'
      and dm.data->>'memberId' = any (public.space_my_member_ids())
  )
$$;

create or replace function public.space_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me text := auth.uid()::text;
begin
  if me is null then return new; end if; -- SQL editor / service role
  if new.collection = 'users' then
    if tg_op = 'UPDATE' then
      if coalesce(old.data->>'demo', '') is distinct from coalesce(new.data->>'demo', '') then
        raise exception 'The demo flag cannot be changed';
      end if;
      if coalesce(old.data->>'authUid', '') <> '' and coalesce(old.data->>'authUid', '') is distinct from coalesce(new.data->>'authUid', '') then
        raise exception 'This person already belongs to another account';
      end if;
      if coalesce(old.data->>'authUid', '') = '' and coalesce(new.data->>'authUid', '') not in ('', me) then
        raise exception 'You can only link a person to your own account';
      end if;
    elsif coalesce((new.data->>'demo')::boolean, false) then
      raise exception 'Demo people can only be added by the site owner';
    end if;
  elsif new.collection = 'organizations' then
    if coalesce((new.data->>'isDemo')::boolean, false) is distinct from (tg_op = 'UPDATE' and coalesce((old.data->>'isDemo')::boolean, false)) then
      raise exception 'Demo companies can only be set up by the site owner';
    end if;
  elsif new.collection = 'orgMembers' then
    if tg_op = 'INSERT' then
      if public.space_org_has_members(new.org_id) and not public.space_is_admin(new.org_id)
         and not (public.space_org_is_demo(new.org_id) and new.data->>'userId' = public.space_my_user_id() and new.data->>'role' = 'employee') then
        raise exception 'Only company admins can add people';
      end if;
    elsif (old.data->>'role') is distinct from (new.data->>'role')
       or coalesce(old.data->>'deactivatedAt', '') is distinct from coalesce(new.data->>'deactivatedAt', '')
       or (old.data->>'userId') is distinct from (new.data->>'userId') then
      if not public.space_is_admin(new.org_id) then raise exception 'Only company admins can change roles'; end if;
    elsif old.data->>'userId' <> public.space_my_user_id() and not public.space_is_admin(new.org_id) then
      raise exception 'You can only change your own status';
    end if;
  elsif new.collection = 'departmentMembers' then
    if not (public.space_is_admin(new.org_id)
            or (public.space_is_dept_admin(new.org_id, new.data->>'departmentId') and new.data->>'role' = 'member'
                and (tg_op = 'INSERT' or old.data->>'role' = 'member'))
            or (public.space_org_is_demo(new.org_id) and new.data->>'role' = 'member'
                and new.data->>'memberId' = any (public.space_my_member_ids()) and tg_op = 'INSERT')) then
      raise exception 'Only admins can change department membership';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists space_guard on public.docs;
create trigger space_guard before insert or update on public.docs for each row execute function public.space_guard();

-- Only signed-in accounts can reach the table at all (policies above decide which rows).
revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

-- Live updates for the app.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- ---------------------------------------------------------------- file storage (private bucket)
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
drop policy if exists space_files_rw on storage.objects;
create policy space_files_rw on storage.objects for all to authenticated
  using (bucket_id = 'files' and public.space_is_member(split_part(name, '/', 1)))
  with check (bucket_id = 'files' and public.space_is_member(split_part(name, '/', 1)));
