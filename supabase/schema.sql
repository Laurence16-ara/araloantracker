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
  lender_name text not null default 'Ara Loan Tracker',
  lender_address text not null default '',
  default_rate numeric(5,2) not null default 20,
  penalty_rate numeric(5,2) not null default 3,
  apply_open boolean not null default true,
  min_amount numeric(12,2) not null default 1000,
  max_amount numeric(12,2) not null default 50000,
  contract_template text,
  updated_at timestamptz not null default now()
);
alter table public.settings add column if not exists lender_signature text;  -- PNG data URL
insert into public.settings (id) values (1) on conflict (id) do nothing;
-- Keep in sync with DEFAULT_TEMPLATE in src/lib/contract.js
update public.settings set contract_template = $tpl$This Loan Agreement ("Agreement") is made and entered into on **{{agreement_date}}**, by and between:

**Lender:** {{lender_name}}
**Address:** {{lender_address}}

**Borrower:** {{borrower_name}}
**Address:** {{borrower_address}}
**Phone number:** {{borrower_phone}}

**1. Loan Amount and Disbursement**
The Lender agrees to provide a loan to the Borrower in the principal amount of **{{principal}}** (the "Principal Amount"). The Principal Amount shall be disbursed to the Borrower on **{{release_date}}**.

**2. Repayment**
The Borrower shall repay the total amount of **{{total}}** in the installments listed here: **{{payment_terms}}**. The final installment is due on **{{due_date}}**.

**3. Interest**
The Principal Amount shall accrue interest of **{{interest}}** ({{interest_rate}}) for a period of **one (1) month**. The interest is included in the total repayment amount of **{{total}}**.

**4. Late Payment**
If an installment is not paid in full by its due date, the outstanding balance of that installment shall incur a penalty of **{{penalty_rate}} per day** until paid. The penalty is calculated on the overdue installment only, not on future installments. For example, {{penalty_example}}.

**5. Separability**
If any provision of this Agreement is held to be invalid or unenforceable, such invalidity or unenforceability shall not affect the remaining provisions, which shall continue to be in full force and effect.

**6. Governing Law**
This Agreement shall be governed by and construed in accordance with the laws of the Republic of the Philippines.

**IN WITNESS WHEREOF**, the parties hereto have executed this Loan Agreement as of the day and year first above written.$tpl$
where id = 1 and coalesce(contract_template, '') = '';
alter table public.settings alter column lender_name set default 'Ara Loan Tracker';
alter table public.settings alter column lender_address set default '';
update public.settings
set contract_template = replace(
  contract_template,
  'Any amount not paid on its due date shall incur a penalty of **{{penalty_rate}} of the unpaid amount for every day of delay** (for example, {{penalty_example}}), until fully paid.',
  'If an installment is not paid in full by its due date, the outstanding balance of that installment shall incur a penalty of **{{penalty_rate}} per day** until paid. The penalty is calculated on the overdue installment only, not on future installments. For example, {{penalty_example}}.'
)
where contract_template like '%Any amount not paid on its due date shall incur a penalty%';

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
alter table public.clients add column if not exists signature text;  -- PNG data URL, signed on the application form

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
  lender_name_snapshot text,
  lender_signature_snapshot text,
  signed_name text,
  signed_at timestamptz,
  contract_text text,              -- the exact contract the client signed
  source text not null default 'manual'
    check (source in ('manual','online','import')),
  note text,
  created_at timestamptz not null default now()
);
alter table public.loans add column if not exists payout_method text
  check (payout_method in ('gcash','maya','seabank','other'));
alter table public.loans add column if not exists payout_other text;    -- bank / e-wallet name when 'other'
alter table public.loans add column if not exists payout_account text;  -- number to send the loan to
alter table public.loans add column if not exists lender_name_snapshot text;
alter table public.loans add column if not exists lender_signature_snapshot text;
-- 'application' = signed on the apply form (schedule and release date are set by the lender at release);
-- 'link' = signed the final terms from a /sign/ link.
alter table public.loans add column if not exists signed_via text check (signed_via in ('application','link'));
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
  with check (bucket_id = 'kyc' and public.is_admin() and (storage.foldername(name))[1] in ('applications','clients'));
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
    'contract_template', contract_template,
    'lender_signature', lender_signature
  ) from public.settings where id = 1;
$$;

-- Peso text exactly like the app shows it: ₱10,000 or ₱1,234.50
create or replace function public.peso_text(v numeric) returns text language sql immutable as $$
  select '₱' || rtrim(to_char(round(v, 2), 'FM999,999,999,990.99'), '.');
$$;

-- The contract an applicant signs on /apply must be the lender's template with the right
-- name, amount, interest and penalty filled in (it is built in the browser, so we check it here).
create or replace function public.application_contract_ok(
  p_text text, p_template text, p_name text, p_principal numeric, p_interest numeric, p_rate numeric, p_penalty numeric
) returns boolean language plpgsql immutable as $$
declare
  pattern text;
  keys text[];
  vals text[];
  expected jsonb := jsonb_build_object(
    'borrower_name', p_name,
    'principal', public.peso_text(p_principal),
    'interest', public.peso_text(p_interest),
    'total', public.peso_text(p_principal + p_interest),
    'interest_rate', trim_scale(p_rate)::text || '% per month',
    'penalty_rate', trim_scale(p_penalty)::text || '%');
  i int;
begin
  if coalesce(p_text, '') = '' or coalesce(p_template, '') = '' or length(p_text) > 20000 then return false; end if;
  select array_agg(m[1]) into keys from regexp_matches(p_template, '\{\{(\w+)\}\}', 'g') as m;
  -- Escape the template for a regex, then turn each {{placeholder}} into a capture group.
  pattern := regexp_replace(p_template, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g');
  pattern := regexp_replace(pattern, '\\\{\\\{\w+\\\}\\\}', '(.*?)', 'g');
  vals := regexp_match(p_text, '^' || pattern || '$');
  if vals is null then return false; end if;
  for i in 1 .. coalesce(array_length(keys, 1), 0) loop
    if expected ? keys[i] and vals[i] is distinct from expected ->> keys[i] then return false; end if;
  end loop;
  return true;
end; $$;

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
  v_schedule := 'monthly';  -- the lender sets the real schedule when releasing
  if v_amount is null or v_amount < s.min_amount or v_amount > s.max_amount then
    raise exception 'Amount must be between % and %.', s.min_amount, s.max_amount;
  end if;
  if coalesce(p ->> 'payout_method', '') not in ('gcash','maya','seabank','other') then
    raise exception 'Please choose where to send your loan.';
  end if;
  if coalesce(p ->> 'payout_account', '') !~ '^[0-9]{10,20}$' then
    raise exception 'Please enter a valid account number.';
  end if;
  if coalesce(trim(p ->> 'full_name'), '') = '' or coalesce(trim(p ->> 'phone'), '') = ''
     or coalesce(trim(p ->> 'address'), '') = '' then
    raise exception 'Name, phone and address are required.';
  end if;
  if coalesce(p ->> 'id_photo_path', '') not like 'applications/%'
     or coalesce(p ->> 'selfie_path', '') not like 'applications/%' then
    raise exception 'Valid ID and selfie are required.';
  end if;
  if coalesce(p ->> 'signature', '') not like 'data:image/png;base64,%' or length(p ->> 'signature') > 400000 then
    raise exception 'Please sign in the signature box.';
  end if;
  if not public.application_contract_ok(p ->> 'contract_text', s.contract_template, left(trim(p ->> 'full_name'), 120),
       v_amount, round(v_amount * s.default_rate / 100, 2), s.default_rate, s.penalty_rate) then
    raise exception 'The loan agreement changed while you were applying. Please refresh the page and sign again.';
  end if;

  insert into public.clients (full_name, phone, address,
                              id_type, id_photo_path, selfie_path, signature, status, source)
  values (left(trim(p ->> 'full_name'), 120), left(trim(p ->> 'phone'), 20),
          left(trim(p ->> 'address'), 300), left(p ->> 'id_type', 60),
          p ->> 'id_photo_path', p ->> 'selfie_path', p ->> 'signature', 'pending', 'online')
  returning id into v_client;

  -- Signed on the form: goes straight to "review & release"; the lender sets schedule and release date.
  insert into public.loans (client_id, principal, interest_rate, interest, schedule,
                            status, source,
                            payout_method, payout_other, payout_account,
                            contract_text, signature, signed_name, signed_at, signed_via,
                            lender_name_snapshot, lender_signature_snapshot)
  values (v_client, v_amount, s.default_rate, round(v_amount * s.default_rate / 100, 2),
          v_schedule, 'for_release', 'online',
          p ->> 'payout_method', left(trim(p ->> 'payout_other'), 60), p ->> 'payout_account',
          p ->> 'contract_text', p ->> 'signature', left(trim(p ->> 'full_name'), 120), now(), 'application',
          s.lender_name, s.lender_signature)
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
    'lender_name', coalesce(l.lender_name_snapshot, s.lender_name),
    'lender_address', s.lender_address,
    'penalty_rate', s.penalty_rate,
    'contract_text', l.contract_text,
    'lender_signature', coalesce(l.lender_signature_snapshot, s.lender_signature)
  );
end;
$$;

-- Client signs the loan (from /sign/:token).
-- Address/phone are saved only if the client record doesn't have them yet.
drop function if exists public.sign_loan(text, text, text, text);
drop function if exists public.sign_loan(text, text, text, text, text, text);
create or replace function public.sign_loan(p_token text, p_signature text, p_signed_name text)
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
  if coalesce(l.contract_text, '') = '' then
    raise exception 'This contract has not been prepared yet. Please ask the lender for a new link.';
  end if;
  if coalesce(p_signature, '') not like 'data:image/png;base64,%' or length(p_signature) > 400000 then
    raise exception 'Signature is required.';
  end if;
  if coalesce(trim(p_signed_name), '') = '' then
    raise exception 'Please type your full name.';
  end if;

  update public.loans
     set signature = p_signature,
         signed_name = left(trim(p_signed_name), 120),
         signed_at = now(),
         status = 'for_release',
         signed_via = 'link',
         sign_token = null,
         sign_expires_at = null
   where id = l.id;

  return json_build_object('ok', true, 'loan_no', l.loan_no);
end;
$$;

revoke all on function public.submit_application(jsonb) from public;
revoke all on function public.get_sign_request(text) from public;
revoke all on function public.sign_loan(text, text, text) from public;
revoke all on function public.public_settings() from public;
revoke all on function public.submit_application(jsonb) from anon, authenticated;
grant execute on function public.submit_application(jsonb) to service_role;
grant execute on function public.get_sign_request(text) to anon, authenticated;
grant execute on function public.sign_loan(text, text, text) to anon, authenticated;
grant execute on function public.public_settings() to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- Final contract terms are chosen by the lender before the borrower signs.
create or replace function public.prepare_sign_request(
  p_loan_id uuid, p_schedule text, p_release_date date, p_contract_text text, p_token text
) returns void language plpgsql security definer set search_path = public as $$
declare s public.settings;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_schedule not in ('monthly','semi_monthly','weekly') or p_release_date is null
     or length(coalesce(p_contract_text,'')) < 50 or length(p_contract_text) > 20000
     or length(coalesce(p_token,'')) < 24 then raise exception 'Contract details are incomplete.'; end if;
  select * into s from public.settings where id=1;
  update public.loans set schedule=p_schedule, release_date=p_release_date,
    contract_text=p_contract_text, sign_token=p_token,
    sign_expires_at=now()+interval '48 hours', lender_name_snapshot=s.lender_name,
    lender_signature_snapshot=s.lender_signature
  where id=p_loan_id and status='awaiting_signature';
  if not found then raise exception 'Loan is no longer waiting for a signature.'; end if;
end; $$;

create or replace function public.release_loan(p_loan_id uuid, p_release_date date, p_schedule text)
returns void language plpgsql security definer set search_path = public as $$
declare l public.loans;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into l from public.loans where id=p_loan_id for update;
  if not found or l.status <> 'for_release' then raise exception 'Loan is not ready for release.'; end if;
  if l.signature is null or coalesce(l.contract_text, '') = '' then
    raise exception 'A prepared and signed contract is required before release.';
  end if;
  if coalesce(l.signed_via, 'link') <> 'application'
     and (l.schedule <> p_schedule or l.release_date is distinct from p_release_date) then
    raise exception 'Signed contract terms cannot be changed.';
  end if;
  if p_schedule not in ('monthly','semi_monthly','weekly') or p_release_date is null then
    raise exception 'Choose the payment schedule and release date.';
  end if;
  update public.loans set status='active', release_date=p_release_date, schedule=p_schedule where id=l.id;
  update public.clients set status='approved' where id=l.client_id and status='pending';
end; $$;

create or replace function public.lock_signed_contract_terms()
returns trigger language plpgsql as $$
begin
  if old.signature is not null and (new.principal is distinct from old.principal
    or new.interest is distinct from old.interest or new.interest_rate is distinct from old.interest_rate
    or ((new.schedule is distinct from old.schedule or new.release_date is distinct from old.release_date)
        and not (old.signed_via = 'application' and old.status = 'for_release'))
    or new.contract_text is distinct from old.contract_text
    or new.lender_name_snapshot is distinct from old.lender_name_snapshot
    or new.lender_signature_snapshot is distinct from old.lender_signature_snapshot) then
    raise exception 'Signed contract terms are locked.';
  end if;
  return new;
end; $$;
drop trigger if exists lock_signed_contract_terms on public.loans;
create trigger lock_signed_contract_terms before update on public.loans
for each row execute function public.lock_signed_contract_terms();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.application_attempts(ip_hash text not null, attempted_at timestamptz not null default now());
revoke all on private.application_attempts from public, anon, authenticated;
create or replace function public.check_application_rate_limit(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public, private as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_ip_hash)::bigint);
  delete from private.application_attempts where attempted_at < now()-interval '1 hour';
  select count(*) into n from private.application_attempts where ip_hash=p_ip_hash;
  if n >= 3 then return false; end if;
  insert into private.application_attempts(ip_hash) values(p_ip_hash);
  return true;
end; $$;
revoke all on function public.check_application_rate_limit(text) from public, anon, authenticated;
grant execute on function public.check_application_rate_limit(text) to service_role;
revoke all on function public.prepare_sign_request(uuid,text,date,text,text) from public, anon;
grant execute on function public.prepare_sign_request(uuid,text,date,text,text) to authenticated;
revoke all on function public.release_loan(uuid,date,text) from public, anon;
grant execute on function public.release_loan(uuid,date,text) to authenticated;


-- ---------------------------------------------------------------------
-- 9. Add the admin accounts (change the emails, then run)
--    First create the user in Authentication → Users → Add user.
-- ---------------------------------------------------------------------
-- insert into public.admins (email) values ('ara@example.com') on conflict do nothing;
