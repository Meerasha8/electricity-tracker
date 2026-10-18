-- ════════════════════════════════════════════════════════════════════════
--  Electricity Tracker: Supabase schema
--
--  Paste this whole file into  Supabase → SQL Editor → New query → Run.
--  Safe to run more than once. Also safe to run on top of the first version of
--  this file (see "0. Upgrade" below).
--
--  How data is stored
--
--    ESP32 ──► minute_readings ──► hourly_readings ──► daily_readings ──► monthly_readings
--              raw, every minute    one row per hour    one row per day    one row per month
--              kept 30 days         kept forever        kept forever       kept forever
--
--  Every level is a real, stored table. The roll-ups happen inside the database
--  the moment a row arrives (triggers), so the current hour, day and month are
--  always up to date; there is no delay and nothing to schedule for that. The
--  only scheduled job is a nightly clean-up that deletes minute rows older than
--  30 days. That never changes the hourly/daily/monthly totals.
--
--  What the ESP32 must send: one row per reading into minute_readings, where
--  kwh is the energy used SINCE THE PREVIOUS READING (not the meter's running
--  total). Rows are only ever added, never edited. Each recorded_at can only
--  exist once, so re-sending a minute that already arrived is simply ignored
--  (safe to retry). The firmware in /firmware does all of this.
--
--  The app only reads hourly / daily / monthly. Raw minute data is not readable
--  with the app's key.
--
--  Days and months are cut in India time. Change it in private.tz() below
--  BEFORE you store any data (existing roll-ups are not re-cut).
-- ════════════════════════════════════════════════════════════════════════


-- ── 0. Upgrade from the first version of this file ──────────────────────
-- v1 had hourly_readings as a raw table and daily/monthly as views. The views
-- are dropped (nothing is lost, they were derived). The old table is renamed
-- to hourly_readings_v1 so no data is deleted; drop it when you're happy:
--     drop table public.hourly_readings_v1;
do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'daily_readings') then
    drop view public.daily_readings;
  end if;
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'monthly_readings') then
    drop view public.monthly_readings;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'hourly_readings' and column_name = 'id') then
    alter table public.hourly_readings rename to hourly_readings_v1;
    alter index if exists public.hourly_readings_pkey            rename to hourly_readings_v1_pkey;
    alter index if exists public.hourly_readings_recorded_at_idx rename to hourly_readings_v1_recorded_at_idx;
    revoke all on public.hourly_readings_v1 from anon, authenticated;
    raise notice 'Old hourly_readings table kept as hourly_readings_v1 (drop it when you no longer need it).';
  end if;
end $$;


-- ── 1. Settings and helpers (private schema, not reachable from the API) ─
create schema if not exists private;

-- The one place the timezone is defined.
create or replace function private.tz() returns text
language sql immutable as $$ select 'Asia/Kolkata'::text $$;


-- ── 2. The four tables ──────────────────────────────────────────────────
-- 7 decimal places everywhere: a single meter pulse is a tiny amount of energy
-- (0.000625 kWh at 1600 pulses/kWh) and rounding it would skew the totals.

-- Raw readings straight from the ESP32.
create table if not exists public.minute_readings (
  id           bigint generated always as identity primary key,
  recorded_at  timestamptz   not null default now(),
  kwh          numeric(12,7) not null check (kwh >= 0)
);
-- One reading per timestamp: makes retries safe (a duplicate is ignored).
create unique index if not exists minute_readings_recorded_at_key
  on public.minute_readings (recorded_at);
drop index if exists public.minute_readings_recorded_at_idx;   -- plain index from earlier versions

-- One row per local hour. recorded_at is the START of that hour.
create table if not exists public.hourly_readings (
  recorded_at  timestamptz   primary key,
  kwh          numeric(14,7) not null
);

-- One row per local day.
create table if not exists public.daily_readings (
  date         date          primary key,
  total_kwh    numeric(14,7) not null
);

-- One row per local month (month is 1-12).
create table if not exists public.monthly_readings (
  year         int           not null,
  month        int           not null check (month between 1 and 12),
  total_kwh    numeric(14,7) not null,
  primary key (year, month)
);

-- Tables created by an earlier version of this file had 5 decimals; widen them
-- (no-op when already 7).
alter table public.minute_readings  alter column kwh       type numeric(12,7);
alter table public.hourly_readings  alter column kwh       type numeric(14,7);
alter table public.daily_readings   alter column total_kwh type numeric(14,7);
alter table public.monthly_readings alter column total_kwh type numeric(14,7);


-- ── 3. Roll-up logic ────────────────────────────────────────────────────
-- These run as the table owner (security definer) so a roll-up works no matter
-- which role inserted the reading.

-- minute → hour: ADD the new reading to its hour. Adding (instead of re-summing
-- the minutes) is what lets old minute rows be deleted without touching totals.
create or replace function private.minute_to_hour() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.hourly_readings as h (recorded_at, kwh)
  values (
    date_trunc('hour', new.recorded_at at time zone private.tz()) at time zone private.tz(),
    new.kwh
  )
  on conflict (recorded_at) do update set kwh = h.kwh + excluded.kwh;
  return null;
end $$;

-- hour → day: recompute the day from its hourly rows (idempotent, self-healing).
create or replace function private.rollup_day(p_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric;
begin
  select sum(kwh) into v_total
  from public.hourly_readings
  where recorded_at >= p_day::timestamp       at time zone private.tz()
    and recorded_at <  (p_day + 1)::timestamp at time zone private.tz();

  if v_total is null then
    delete from public.daily_readings where date = p_day;
  else
    insert into public.daily_readings as d (date, total_kwh)
    values (p_day, v_total)
    on conflict (date) do update set total_kwh = excluded.total_kwh
    where d.total_kwh is distinct from excluded.total_kwh;
  end if;
end $$;

create or replace function private.hourly_to_daily() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.rollup_day((old.recorded_at at time zone private.tz())::date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.rollup_day((new.recorded_at at time zone private.tz())::date);
  end if;
  return null;
end $$;

-- day → month: recompute the month from its daily rows.
create or replace function private.rollup_month(p_year int, p_month int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_first date := make_date(p_year, p_month, 1);
  v_total numeric;
begin
  select sum(total_kwh) into v_total
  from public.daily_readings
  where date >= v_first
    and date <  (v_first + interval '1 month')::date;

  if v_total is null then
    delete from public.monthly_readings where year = p_year and month = p_month;
  else
    insert into public.monthly_readings as m (year, month, total_kwh)
    values (p_year, p_month, v_total)
    on conflict (year, month) do update set total_kwh = excluded.total_kwh
    where m.total_kwh is distinct from excluded.total_kwh;
  end if;
end $$;

create or replace function private.daily_to_monthly() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.rollup_month(extract(year from old.date)::int, extract(month from old.date)::int);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.rollup_month(extract(year from new.date)::int, extract(month from new.date)::int);
  end if;
  return null;
end $$;

-- Wire them up. Deleting minute rows deliberately has NO trigger.
drop trigger if exists minute_to_hour    on public.minute_readings;
create trigger minute_to_hour
  after insert on public.minute_readings
  for each row execute function private.minute_to_hour();

drop trigger if exists hourly_to_daily   on public.hourly_readings;
create trigger hourly_to_daily
  after insert or update or delete on public.hourly_readings
  for each row execute function private.hourly_to_daily();

drop trigger if exists daily_to_monthly  on public.daily_readings;
create trigger daily_to_monthly
  after insert or update or delete on public.daily_readings
  for each row execute function private.daily_to_monthly();


-- ── 4. Access: the app (anon key) can read the roll-ups, nothing else ───
alter table public.minute_readings  enable row level security;   -- no policy = no app access
alter table public.hourly_readings  enable row level security;
alter table public.daily_readings   enable row level security;
alter table public.monthly_readings enable row level security;

drop policy if exists "Public read access" on public.hourly_readings;
create policy "Public read access" on public.hourly_readings  for select to anon, authenticated using (true);
drop policy if exists "Public read access" on public.daily_readings;
create policy "Public read access" on public.daily_readings   for select to anon, authenticated using (true);
drop policy if exists "Public read access" on public.monthly_readings;
create policy "Public read access" on public.monthly_readings for select to anon, authenticated using (true);

grant select on public.hourly_readings, public.daily_readings, public.monthly_readings
  to anon, authenticated;
grant all on public.minute_readings, public.hourly_readings,
             public.daily_readings,  public.monthly_readings
  to service_role;

-- Writing: the ESP32 should use your project's *service_role / secret* key
-- (Project Settings → API Keys). It bypasses row-level security. Keep that key
-- on the device only, never in the app.
--
--   POST https://<project-ref>.supabase.co/rest/v1/minute_readings?on_conflict=recorded_at
--   apikey: <service_role key>
--   Authorization: Bearer <service_role key>     (legacy JWT keys only)
--   Content-Type: application/json
--   Prefer: resolution=ignore-duplicates,return=minimal
--   [{"recorded_at": "2026-10-18T10:15:00Z", "kwh": 0.0018750}, ...]
--
-- Send readings with their own recorded_at (ISO 8601); they are rolled into the
-- correct hour/day/month even if they arrive late, e.g. after the ESP32 was
-- offline. Omitting recorded_at also works (it defaults to now()).


-- ── 5. Clean-up: delete minute rows older than 30 days, nightly ─────────
-- Hourly, daily and monthly totals are NOT affected.
create or replace function private.purge_old_minutes() returns void
language sql security definer set search_path = '' as $$
  delete from public.minute_readings
  where recorded_at < now() - interval '30 days';   -- <- change the retention here
$$;

-- Needs the pg_cron extension. If this block prints a notice instead of
-- scheduling, enable it under  Database → Extensions → pg_cron  and run the
-- file again. Everything above works fine without it; the only effect is that
-- minute rows then pile up (about 525k a year).
-- pg_cron uses UTC: 21:30 UTC = 03:00 India time.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'purge-old-minute-readings';
  perform cron.schedule('purge-old-minute-readings', '30 21 * * *', 'select private.purge_old_minutes()');
exception when others then
  raise notice 'Nightly clean-up NOT scheduled (%). Enable pg_cron in Database → Extensions, then re-run this file.', sqlerrm;
end $$;


-- ── 6. OPTIONAL sample data ─────────────────────────────────────────────
-- About 7 months of realistic usage (evening peak, higher on weekends,
-- ~170 kWh/month) so every tab works with live data before the ESP32 sends
-- anything:
--   • older history is written straight into hourly_readings
--   • the last 2 days plus today are written as per-minute readings, so they
--     travel through the real minute → hour → day → month pipeline.
--
-- It only runs when the minute and hourly tables are EMPTY, so it never
-- touches real data. Don't want it? Delete this whole section.
-- Remove it later with:
--   truncate public.minute_readings, public.hourly_readings,
--            public.daily_readings, public.monthly_readings restart identity;
do $$
declare
  v_cut timestamptz := (date_trunc('day', now() at time zone private.tz()) - interval '2 days')
                       at time zone private.tz();            -- local midnight, 2 days ago
begin
  if exists (select 1 from public.minute_readings) or exists (select 1 from public.hourly_readings) then
    raise notice 'Tables already contain data: sample data skipped.';
    return;
  end if;

  -- Hourly history up to (not including) the cut-off.
  insert into public.hourly_readings (recorded_at, kwh)
  select
    ts,
    round((
      case
        when h < 6  then 0.08
        when h < 9  then 0.40
        when h < 17 then 0.20
        when h < 21 then 0.50
        else             0.12
      end
      * case when dow in (6, 7) then 1.3 else 1.0 end        -- weekends use more
      * (0.85 + random() * 0.30)                             -- ±15% jitter
    )::numeric, 5)
  from (
    select ts,
           extract(hour   from ts at time zone private.tz()) as h,
           extract(isodow from ts at time zone private.tz()) as dow
    from generate_series(v_cut - interval '210 days', v_cut - interval '1 hour', interval '1 hour') as ts
  ) s;

  -- Per-minute readings from the cut-off until now.
  insert into public.minute_readings (recorded_at, kwh)
  select
    ts,
    round((
      case
        when h < 6  then 0.08
        when h < 9  then 0.40
        when h < 17 then 0.20
        when h < 21 then 0.50
        else             0.12
      end / 60.0
      * case when dow in (6, 7) then 1.3 else 1.0 end
      * (0.70 + random() * 0.60)
    )::numeric, 5)
  from (
    select ts,
           extract(hour   from ts at time zone private.tz()) as h,
           extract(isodow from ts at time zone private.tz()) as dow
    from generate_series(v_cut, date_trunc('minute', now()), interval '1 minute') as ts
  ) s;
end $$;
