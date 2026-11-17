-- IMECO Mission Control — Warehouse Stock snapshot store.
--
-- The Apps Script (scripts/stock-apps-script.gs) builds the stock payload from the Google Sheets in
-- the background and writes it here; the dashboard reads it with the public anon key.
--
-- Security model:
--   * anon can only SELECT (RLS). The anon key is in the public bundle, so it must never write.
--   * Writes go through two SECURITY DEFINER functions that require a secret. The secret is
--     generated inside the database and never appears in this repo. Copy it once into the Apps
--     Script property STOCK_INGEST_SECRET (last query below).
--   * No service_role key is used anywhere.
--
-- Run the whole file once in Supabase → SQL Editor. Safe to re-run.

create table if not exists public.stock_snapshots (
  id                text primary key default 'latest' check (id = 'latest'),
  payload           jsonb       not null,
  built_at          timestamptz not null,            -- when the sheets were read
  checked_at        timestamptz not null default now(), -- last background check (even if unchanged)
  check_status      text,                            -- e.g. 'built', 'skip: no sheet changes'
  source_updated_at timestamptz,                     -- latest Drive modified time of both sheets
  build_ms          integer,
  engine            text
);

alter table public.stock_snapshots enable row level security;

drop policy if exists "stock_snapshots are readable" on public.stock_snapshots;
create policy "stock_snapshots are readable"
  on public.stock_snapshots for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.stock_snapshots from anon, authenticated;
grant select on public.stock_snapshots to anon, authenticated;

-- ── writer secret (private schema, not exposed through the API) ───────────────────────────────

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.stock_ingest_secret (
  id     integer primary key default 1 check (id = 1),
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into private.stock_ingest_secret (id) values (1) on conflict (id) do nothing;
-- Defence in depth: the private schema isn't exposed by the API anyway. The SECURITY DEFINER
-- functions below run as the table owner, which RLS does not restrict.
alter table private.stock_ingest_secret enable row level security;

-- ── write functions (called by the Apps Script with the anon key + secret) ────────────────────

create or replace function public.ingest_stock_snapshot(
  p_secret            text,
  p_payload           jsonb,
  p_built_at          timestamptz,
  p_source_updated_at timestamptz,
  p_build_ms          integer,
  p_engine            text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null
     or p_secret is distinct from (select s.secret from private.stock_ingest_secret s where s.id = 1) then
    raise exception 'invalid ingest secret' using errcode = '28000';
  end if;
  if jsonb_typeof(p_payload -> 'catalog') is distinct from 'array' then
    raise exception 'payload has no catalog array' using errcode = '22023';
  end if;

  insert into public.stock_snapshots as t
    (id, payload, built_at, checked_at, check_status, source_updated_at, build_ms, engine)
  values
    ('latest', p_payload, coalesce(p_built_at, now()), now(), 'built', p_source_updated_at, p_build_ms, p_engine)
  on conflict (id) do update set
    payload           = excluded.payload,
    built_at          = excluded.built_at,
    checked_at        = excluded.checked_at,
    check_status      = excluded.check_status,
    source_updated_at = excluded.source_updated_at,
    build_ms          = excluded.build_ms,
    engine            = excluded.engine;
end;
$$;

create or replace function public.touch_stock_snapshot(
  p_secret     text,
  p_checked_at timestamptz,
  p_status     text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null
     or p_secret is distinct from (select s.secret from private.stock_ingest_secret s where s.id = 1) then
    raise exception 'invalid ingest secret' using errcode = '28000';
  end if;
  update public.stock_snapshots
     set checked_at = coalesce(p_checked_at, now()),
         check_status = left(p_status, 200)
   where id = 'latest';
end;
$$;

revoke all on function public.ingest_stock_snapshot(text, jsonb, timestamptz, timestamptz, integer, text) from public;
revoke all on function public.touch_stock_snapshot(text, timestamptz, text) from public;
grant execute on function public.ingest_stock_snapshot(text, jsonb, timestamptz, timestamptz, integer, text) to anon, authenticated;
grant execute on function public.touch_stock_snapshot(text, timestamptz, text) to anon, authenticated;

-- ── copy this value into the Apps Script property STOCK_INGEST_SECRET ─────────────────────────
select secret as stock_ingest_secret from private.stock_ingest_secret where id = 1;
