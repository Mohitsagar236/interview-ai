-- Auth login tracking for public/download.html.
-- Run this in the Supabase SQL editor for the project used by SUPABASE_URL.
--
-- This stores the authenticated user's Supabase user id and login email in
-- public tables so you can track signups/logins without storing passwords.

create extension if not exists pgcrypto;

create table if not exists public.auth_login_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_event text not null default 'signin',
  login_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  event_name text not null default 'signin',
  occurred_at timestamptz not null default now()
);

alter table public.auth_login_users enable row level security;
alter table public.auth_login_events enable row level security;

create index if not exists auth_login_users_email_idx
  on public.auth_login_users (lower(email));

create index if not exists auth_login_users_last_seen_idx
  on public.auth_login_users (last_seen_at desc);

create index if not exists auth_login_events_user_occurred_idx
  on public.auth_login_events (user_id, occurred_at desc);

create index if not exists auth_login_events_email_idx
  on public.auth_login_events (lower(email));

drop policy if exists "Users can read own auth login profile"
  on public.auth_login_users;

create policy "Users can read own auth login profile"
  on public.auth_login_users
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own auth login events"
  on public.auth_login_events;

create policy "Users can read own auth login events"
  on public.auth_login_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.track_auth_login(event_name text default 'signin')
returns public.auth_login_users
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := nullif(auth.jwt() ->> 'email', '');
  normalized_event text := coalesce(nullif(trim(event_name), ''), 'signin');
  tracked_user public.auth_login_users;
begin
  if current_user_id is null then
    raise exception 'Login tracking requires an authenticated Supabase user';
  end if;

  if current_email is null then
    select email
      into current_email
      from auth.users
      where id = current_user_id;
  end if;

  if current_email is null then
    raise exception 'Login tracking requires a user email';
  end if;

  insert into public.auth_login_users (
    user_id,
    email,
    last_event,
    login_count
  )
  values (
    current_user_id,
    current_email,
    normalized_event,
    1
  )
  on conflict (user_id) do update set
    email = excluded.email,
    last_seen_at = now(),
    last_event = excluded.last_event,
    login_count = public.auth_login_users.login_count + 1,
    updated_at = now()
  returning *
  into tracked_user;

  insert into public.auth_login_events (
    user_id,
    email,
    event_name
  )
  values (
    current_user_id,
    current_email,
    normalized_event
  );

  return tracked_user;
end;
$$;

revoke all on public.auth_login_users from anon, authenticated;
revoke all on public.auth_login_events from anon, authenticated;
grant select on public.auth_login_users to authenticated;
grant select on public.auth_login_events to authenticated;

revoke execute on function public.track_auth_login(text) from public;
grant execute on function public.track_auth_login(text) to authenticated;
