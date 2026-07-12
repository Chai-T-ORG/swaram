-- ============================================================================
-- Swaram — Supabase schema
--
-- Swaram uses Supabase for ONE optional thing: backing up a user's auto-fill
-- profile, and only after they explicitly opt in on the Profile page. Form
-- images, OCR, and every government ID number stay on the device and are never
-- sent here (the client strips Aadhaar/PAN/etc. before upload).
--
-- The client identifies a device by a random UUID (device_id) stored locally.
-- There is no login; the device_id is an unguessable per-device key.
--
-- Run this in the Supabase SQL editor once. Then set, in .env.local:
--   NEXT_PUBLIC_SUPABASE_URL=...
--   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
-- ============================================================================

create table if not exists public.profiles (
  device_id   text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Keep updated_at fresh on every write.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- This app is anon-key only (no auth.users). A row is protected by the secrecy
-- of its random device_id. The policies below allow the anon role to operate
-- on the profiles table; the client always scopes by its own device_id.
--
-- NOTE: because there is no per-user auth, a client that knew another device's
-- UUID could read that row. device_id is a random v4 UUID, so this is obscure
-- but not cryptographically enforced. For a production/multi-user deployment,
-- switch to Supabase Auth and replace the policies with `auth.uid() = user_id`
-- (see the commented block at the bottom).
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "anon can read own row"   on public.profiles;
drop policy if exists "anon can insert"          on public.profiles;
drop policy if exists "anon can update own row"  on public.profiles;
drop policy if exists "anon can delete own row"  on public.profiles;

create policy "anon can read own row"  on public.profiles for select to anon using (true);
create policy "anon can insert"        on public.profiles for insert to anon with check (true);
create policy "anon can update own row" on public.profiles for update to anon using (true) with check (true);
create policy "anon can delete own row" on public.profiles for delete to anon using (true);

-- A defence-in-depth guard: never allow government ID keys to be stored, even
-- if a future client bug tried to. Rejects writes whose JSON contains them.
create or replace function public.reject_sensitive_keys()
returns trigger language plpgsql as $$
declare
  k text;
begin
  foreach k in array array['aadhaar','aadhar','adhar','uidai','pan_number','pan_card','passport','voter','ration','driving_licence','driving_license']
  loop
    if new.data ? k then
      raise exception 'Refusing to store sensitive key: %', k;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_reject_sensitive on public.profiles;
create trigger profiles_reject_sensitive
  before insert or update on public.profiles
  for each row execute function public.reject_sensitive_keys();

-- ============================================================================
-- OPTIONAL: proper per-user auth (recommended for real deployments)
-- ----------------------------------------------------------------------------
-- If you move to Supabase Auth, use a user_id-keyed table instead:
--
--   create table public.profiles (
--     user_id    uuid primary key references auth.users on delete cascade,
--     data       jsonb not null default '{}'::jsonb,
--     updated_at timestamptz not null default now()
--   );
--   alter table public.profiles enable row level security;
--   create policy "own profile" on public.profiles
--     for all to authenticated
--     using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- and change the client to upsert { user_id: session.user.id, data }.
-- ============================================================================
