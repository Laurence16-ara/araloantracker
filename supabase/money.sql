-- =====================================================================
-- Household money (separate from the loans): income, GCash Business fees, expenses.
-- Admin-only. Safe to run more than once.
-- =====================================================================

-- One row of settings: GCash fee table and expense categories.
create table if not exists public.money_config (
  id int primary key default 1 check (id = 1),
  -- Fee by amount: each tier covers amounts up to "max". Amounts above the last tier are split into
  -- chunks of the last tier's max (e.g. 1,500 = 1,000 + 500 = 15 + 15 = 30).
  gcash_tiers jsonb not null default '[{"max":100,"fee":5},{"max":499,"fee":10},{"max":1000,"fee":15}]',
  expense_categories text[] not null default array['Water','Electric','Wifi','Netflix','Grocery','Palengke','Baby','Cats','Cravings','Other'],
  income_categories text[] not null default array['Rental','Parking','GCash','Other'],
  updated_at timestamptz not null default now()
);
insert into public.money_config (id) values (1) on conflict do nothing;

-- Income that comes every month (rental, parking). An entry is added for each month automatically.
create table if not exists public.money_recurring (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  category text not null default 'Other',
  amount numeric(12,2) not null check (amount >= 0),
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  start_month text not null default to_char(now() at time zone 'Asia/Manila', 'YYYY-MM') check (start_month ~ '^\d{4}-\d{2}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Every income or expense. GCash: amount = fee earned, gcash_amount = the cash-in/out amount.
create table if not exists public.money_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income','expense')),
  category text not null check (length(trim(category)) between 1 and 40),
  amount numeric(12,2) not null check (amount >= 0),
  entry_date date not null,
  note text check (length(note) <= 300),
  gcash_amount numeric(12,2) check (gcash_amount >= 0),
  recurring_id uuid references public.money_recurring(id) on delete set null,
  month_key text check (month_key ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  unique (recurring_id, month_key)
);
create index if not exists money_entries_date_idx on public.money_entries (entry_date);

alter table public.money_config enable row level security;
alter table public.money_recurring enable row level security;
alter table public.money_entries enable row level security;
drop policy if exists admin_all on public.money_config;
drop policy if exists admin_all on public.money_recurring;
drop policy if exists admin_all on public.money_entries;
create policy admin_all on public.money_config for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.money_recurring for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.money_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.money_config, public.money_recurring, public.money_entries from anon;
grant select, update on public.money_config to authenticated;
grant select, insert, update, delete on public.money_recurring, public.money_entries to authenticated;

-- Starting monthly income (only added the first time).
insert into public.money_recurring (name, category, amount)
select v.name, v.category, v.amount from (values ('Rental property', 'Rental', 10000), ('Parking lot', 'Parking', 1800)) as v(name, category, amount)
where not exists (select 1 from public.money_recurring);

-- Monthly bills too (e.g. Wifi): a recurring row can be income or expense.
alter table public.money_recurring add column if not exists kind text not null default 'income' check (kind in ('income','expense'));
insert into public.money_recurring (kind, name, category, amount)
select 'expense', 'Wifi', 'Wifi', 1399
where not exists (select 1 from public.money_recurring where kind = 'expense' and lower(name) = 'wifi');
