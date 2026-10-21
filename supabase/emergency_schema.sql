-- Apply in the Supabase SQL editor after the existing villages table is available.
-- This migration extends villages; it does not create or replace it.
alter table public.villages add column if not exists coverage text;
alter table public.villages add column if not exists distance_to_clinic_km numeric;
alter table public.villages add column if not exists expected_checkin_hours integer not null default 48;
alter table public.villages add column if not exists last_heartbeat timestamptz;
alter table public.villages add column if not exists last_field_sync timestamptz;

create table if not exists public.emergency_reports (
  id uuid primary key default gen_random_uuid(),
  village_id text not null references public.villages(id),
  emergency_type text not null check (emergency_type in ('pregnancy','child','accident','other')),
  phone text,
  reported_at timestamptz not null,
  received_at timestamptz not null default now(),
  latitude numeric,
  longitude numeric,
  source text not null default 'qr' check (source in ('qr','sms','offline_queue')),
  status text not null default 'new' check (status in ('new','reviewed','closed'))
);
create index if not exists emergency_reports_village_reported_idx on public.emergency_reports(village_id, reported_at desc);

alter table public.emergency_reports enable row level security;
revoke all on public.emergency_reports from anon, authenticated;
-- Public users may insert reports, but never select, update, or delete them.
-- The application uses the RPC below so that the five-minute cooldown is also enforced.
create policy "anon can insert emergency reports" on public.emergency_reports
  for insert to anon with check (source in ('qr','offline_queue'));

create or replace function public.submit_emergency_report(
  p_village_id text, p_emergency_type text, p_phone text default null,
  p_reported_at timestamptz default now(), p_latitude numeric default null,
  p_longitude numeric default null, p_source text default 'qr'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare last_report timestamptz;
begin
  if p_emergency_type not in ('pregnancy','child','accident','other') then raise exception 'Invalid emergency type'; end if;
  select max(reported_at) into last_report from emergency_reports where village_id = p_village_id;
  if last_report is not null and last_report > now() - interval '5 minutes' then
    return jsonb_build_object('accepted', false, 'reason', 'cooldown', 'retry_after_seconds', ceil(extract(epoch from (last_report + interval '5 minutes' - now()))));
  end if;
  insert into emergency_reports(village_id, emergency_type, phone, reported_at, latitude, longitude, source)
  values (p_village_id, p_emergency_type, nullif(p_phone,''), p_reported_at, p_latitude, p_longitude, p_source);
  return jsonb_build_object('accepted', true);
end; $$;
revoke all on function public.submit_emergency_report(text,text,text,timestamptz,numeric,numeric,text) from public;
grant execute on function public.submit_emergency_report(text,text,text,timestamptz,numeric,numeric,text) to anon;

create or replace function public.record_village_heartbeat(p_village_id text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update villages set last_heartbeat = now() where id = p_village_id;
  if not found then raise exception 'Unknown village'; end if;
  return jsonb_build_object('accepted', true);
end; $$;
revoke all on function public.record_village_heartbeat(text) from public;

create or replace view public.village_status with (security_invoker = true) as
select v.id as village_id, v.name as village_name, v.expected_checkin_hours,
  greatest(coalesce(max(r.received_at), 'epoch'::timestamptz), coalesce(v.last_heartbeat, 'epoch'::timestamptz), coalesce(v.last_field_sync, 'epoch'::timestamptz)) as last_signal_at,
  (greatest(coalesce(max(r.received_at), 'epoch'::timestamptz), coalesce(v.last_heartbeat, 'epoch'::timestamptz), coalesce(v.last_field_sync, 'epoch'::timestamptz)) < now() - make_interval(hours => coalesce(v.expected_checkin_hours,48))) as silent
from public.villages v left join public.emergency_reports r on r.village_id = v.id group by v.id;
