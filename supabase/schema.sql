-- =====================================================================
-- Ara Loan Tracker — database setup
-- Run this ONCE in Supabase: Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: it only creates things that don't exist yet and
-- replaces the functions/policies.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Admins (who can open the admin page)
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email text primary key
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Settings (single row)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  lender_name text not null default 'Ara Marylle Oliver',
  lender_address text not null default 'Blk 16 Riviera Heights Brgy. Labas, Santa Rosa, Laguna',
  default_rate numeric(5,2) not null default 20,
  penalty_rate numeric(5,2) not null default 3,
  apply_open boolean not null default true,
  min_amount numeric(12,2) not null default 1000,
  max_amount numeric(12,2) not null default 50000,
  contract_template text,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Clients
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  aliases text,                    -- old names used in the sheet
  phone text,
  address text,
  facebook text,
  referred_by uuid references public.clients(id) on delete set null,
  referred_by_text text,           -- what the applicant typed
  id_type text,
  id_photo_path text,              -- private storage: kyc bucket
  selfie_path text,
  status text not null default 'approved'
    check (status in ('pending','approved','blocked','rejected')),
  source text not null default 'manual'
    check (source in ('manual','online','import')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists clients_name_idx on public.clients (lower(full_name));

-- ---------------------------------------------------------------------
-- 4. Loans
-- ---------------------------------------------------------------------
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  loan_no bigint generated always as identity,
  client_id uuid not null references public.clients(id) on delete cascade,
  principal numeric(12,2) not null check (principal > 0),
  interest_rate numeric(6,2) not null default 20,
  interest numeric(12,2) not null check (interest >= 0),
  schedule text not null default 'monthly'
    check (schedule in ('monthly','semi_monthly','weekly')),
  release_date date,               -- date the money was given out
  status text not null default 'active'
    check (status in ('awaiting_signature','for_release','active','paid','rejected','cancelled')),
  paid_at date,
  penalty_waived boolean not null default false,
  sign_token text unique,
  sign_expires_at timestamptz,
  signature text,                  -- PNG data URL
  signed_name text,
  signed_at timestamptz,
  contract_text text,              -- the exact contract the client signed
  source text not null default 'manual'
    check (source in ('manual','online','import')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists loans_client_idx on public.loans (client_id);
create index if not exists loans_release_idx on public.loans (release_date);

-- ---------------------------------------------------------------------
-- 5. Payments
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  paid_on date not null default current_date,
  amount numeric(12,2) not null default 0 check (amount >= 0),   -- goes to loan balance
  penalty numeric(12,2) not null default 0 check (penalty >= 0), -- penalty collected
  method text not null default 'cash',
  note text,
  created_at timestamptz not null default now()
);
create index if not exists payments_loan_idx on public.payments (loan_id);

-- ---------------------------------------------------------------------
-- 6. Security: only admins can read/write tables directly
-- ---------------------------------------------------------------------
alter table public.admins   enable row level security;
alter table public.settings enable row level security;
alter table public.clients  enable row level security;
alter table public.loans    enable row level security;
alter table public.payments enable row level security;

drop policy if exists admin_all on public.admins;
drop policy if exists admin_all on public.settings;
drop policy if exists admin_all on public.clients;
drop policy if exists admin_all on public.loans;
drop policy if exists admin_all on public.payments;

create policy admin_all on public.admins   for select to authenticated using (public.is_admin());
create policy admin_all on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.clients  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.loans    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Table access for logged-in users (rows are still filtered by the policies above).
-- The public (anon) role gets NO table access — it only uses the functions below.
grant usage on schema public to anon, authenticated;
revoke all on public.admins, public.settings, public.clients, public.loans, public.payments from anon;
grant select on public.admins to authenticated;
grant select, update on public.settings to authenticated;
grant select, insert, update, delete on public.clients, public.loans, public.payments to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 7. Private file storage for IDs and selfies
--    Anyone may UPLOAD into kyc/applications/ (the apply form),
--    only admins may VIEW / change / delete.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc', 'kyc', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists kyc_public_upload on storage.objects;
drop policy if exists kyc_admin_read   on storage.objects;
drop policy if exists kyc_admin_write  on storage.objects;
drop policy if exists kyc_admin_delete on storage.objects;

create policy kyc_public_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] in ('applications','clients'));
create policy kyc_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and public.is_admin());
create policy kyc_admin_write on storage.objects for update to authenticated
  using (bucket_id = 'kyc' and public.is_admin());
create policy kyc_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'kyc' and public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Public functions used by the client pages (no login)
-- ---------------------------------------------------------------------

-- Settings the apply page needs (no private data)
create or replace function public.public_settings()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'lender_name', lender_name,
    'lender_address', lender_address,
    'default_rate', default_rate,
    'penalty_rate', penalty_rate,
    'apply_open', apply_open,
    'min_amount', min_amount,
    'max_amount', max_amount,
    'contract_template', contract_template
  ) from public.settings where id = 1;
$$;

-- New client application (from /apply)
create or replace function public.submit_application(p jsonb)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  s public.settings;
  v_client uuid;
  v_loan public.loans;
  v_amount numeric;
  v_schedule text;
begin
  select * into s from public.settings where id = 1;
  if not s.apply_open then
    raise exception 'Applications are closed right now.';
  end if;

  v_amount := (p ->> 'principal')::numeric;
  v_schedule := coalesce(p ->> 'schedule', 'monthly');
  if v_amount is null or v_amount < s.min_amount or v_amount > s.max_amount then
    raise exception 'Amount must be between % and %.', s.min_amount, s.max_amount;
  end if;
  if v_schedule not in ('monthly','semi_monthly','weekly') then
    raise exception 'Invalid payment schedule.';
  end if;
  if coalesce(trim(p ->> 'full_name'), '') = '' or coalesce(trim(p ->> 'phone'), '') = ''
     or coalesce(trim(p ->> 'address'), '') = '' then
    raise exception 'Name, phone and address are required.';
  end if;
  if coalesce(p ->> 'id_photo_path', '') not like 'applications/%'
     or coalesce(p ->> 'selfie_path', '') not like 'applications/%' then
    raise exception 'Valid ID and selfie are required.';
  end if;
  if coalesce(p ->> 'signature', '') not like 'data:image/png;base64,%'
     or length(p ->> 'signature') > 400000 then
    raise exception 'Signature is required.';
  end if;
  if length(coalesce(p ->> 'contract_text','')) > 20000 then
    raise exception 'Contract too long.';
  end if;

  insert into public.clients (full_name, phone, address, facebook, referred_by_text,
                              id_type, id_photo_path, selfie_path, status, source)
  values (left(trim(p ->> 'full_name'), 120), left(trim(p ->> 'phone'), 20),
          left(trim(p ->> 'address'), 300), left(trim(p ->> 'facebook'), 200),
          left(trim(p ->> 'referred_by'), 120), left(p ->> 'id_type', 60),
          p ->> 'id_photo_path', p ->> 'selfie_path', 'pending', 'online')
  returning id into v_client;

  insert into public.loans (client_id, principal, interest_rate, interest, schedule,
                            status, signature, signed_name, signed_at, contract_text, source)
  values (v_client, v_amount, s.default_rate, round(v_amount * s.default_rate / 100, 2),
          v_schedule, 'for_release', p ->> 'signature', left(trim(p ->> 'full_name'), 120),
          now(), p ->> 'contract_text', 'online')
  returning * into v_loan;

  return json_build_object('loan_no', v_loan.loan_no);
end;
$$;

-- Read a loan that is waiting for the client's signature (from /sign/:token)
create or replace function public.get_sign_request(p_token text)
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  l public.loans;
  c public.clients;
  s public.settings;
begin
  select * into l from public.loans where sign_token = p_token;
  if not found then
    return json_build_object('error', 'not_found');
  end if;
  if l.status <> 'awaiting_signature' then
    return json_build_object('error', 'already_signed');
  end if;
  if l.sign_expires_at is not null and l.sign_expires_at < now() then
    return json_build_object('error', 'expired');
  end if;
  select * into c from public.clients where id = l.client_id;
  select * into s from public.settings where id = 1;
  return json_build_object(
    'borrower_name', c.full_name,
    'borrower_address', c.address,
    'borrower_phone', c.phone,
    'principal', l.principal,
    'interest', l.interest,
    'interest_rate', l.interest_rate,
    'schedule', l.schedule,
    'release_date', l.release_date,
    'lender_name', s.lender_name,
    'lender_address', s.lender_address,
    'penalty_rate', s.penalty_rate,
    'contract_template', s.contract_template
  );
end;
$$;

-- Client signs the loan (from /sign/:token).
-- Address/phone are saved only if the client record doesn't have them yet.
drop function if exists public.sign_loan(text, text, text, text);
create or replace function public.sign_loan(p_token text, p_signature text, p_signed_name text, p_contract_text text,
                                            p_address text default null, p_phone text default null)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  l public.loans;
begin
  select * into l from public.loans where sign_token = p_token for update;
  if not found or l.status <> 'awaiting_signature' then
    raise exception 'This signing link is no longer valid.';
  end if;
  if l.sign_expires_at is not null and l.sign_expires_at < now() then
    raise exception 'This signing link has expired. Please ask for a new one.';
  end if;
  if coalesce(p_signature, '') not like 'data:image/png;base64,%' or length(p_signature) > 400000 then
    raise exception 'Signature is required.';
  end if;
  if coalesce(trim(p_signed_name), '') = '' then
    raise exception 'Please type your full name.';
  end if;

  update public.clients
     set address = coalesce(nullif(trim(address), ''), left(nullif(trim(p_address), ''), 300)),
         phone   = coalesce(nullif(trim(phone), ''), left(nullif(trim(p_phone), ''), 20))
   where id = l.client_id;

  update public.loans
     set signature = p_signature,
         signed_name = left(trim(p_signed_name), 120),
         signed_at = now(),
         contract_text = left(p_contract_text, 20000),
         status = 'for_release',
         sign_token = null,
         sign_expires_at = null
   where id = l.id;

  return json_build_object('ok', true, 'loan_no', l.loan_no);
end;
$$;

revoke all on function public.submit_application(jsonb) from public;
revoke all on function public.get_sign_request(text) from public;
revoke all on function public.sign_loan(text, text, text, text, text, text) from public;
revoke all on function public.public_settings() from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;
grant execute on function public.get_sign_request(text) to anon, authenticated;
grant execute on function public.sign_loan(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.public_settings() to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 9. Add the admin accounts (change the emails, then run)
--    First create the user in Authentication → Users → Add user.
-- ---------------------------------------------------------------------
-- insert into public.admins (email) values ('ara@example.com') on conflict do nothing;
