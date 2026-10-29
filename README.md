# Ara Loan Tracker

Loan records, client applications, e-signed contracts, payments, penalties and reports for Ara's lending.
Built with React and Vite on Vercel, with Supabase for the database, login and private ID photo storage.

## Pages

| Page | Who | What |
|---|---|---|
| `/apply` | New clients | Details, valid ID, selfie with ID, amount and schedule, contract and signature |
| `/sign/<link>` | Returning clients | Opens a contract Ara prepared, then the client signs it. Link works for 48 hours. |
| `/admin` | Ara | Dashboard, Applications, Records (month tabs), Clients, Reports, Settings |

## Loan rules

- Every loan is 1 month at 20% interest by default. The rate can be changed per loan.
- Payment schedules:
  - **Monthly**: 1 payment
  - **Every 15 days**: 2 payments, on day 15 and on the due date
  - **Weekly**: 4 payments, on days 7, 14 and 21 and on the due date
- Late penalty: **3% of the unpaid amount per day late**. Ara can waive it per loan.
- Payments go to the oldest unpaid installment first.

## Setup (one time)

### 1. Supabase
1. Create a new project. Region: **Southeast Asia (Singapore)**.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, then **Run**.
3. Import the old sheet: paste the private `import-history.sql` file and **Run**. That file is not on GitHub because it has borrower names.
4. **Authentication → Users → Add user → Create new user**. Enter Ara's email and a password, and tick *Auto confirm*.
5. Back in **SQL Editor**, give that account admin access:
   ```sql
   insert into public.admins (email) values ('ara-email@gmail.com');
   ```
6. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up".
7. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

### 2. Vercel
1. **Add New → Project →** import `araloantracker` from GitHub.
2. Add two Environment Variables:
   - `VITE_SUPABASE_URL`: the Project URL
   - `VITE_SUPABASE_ANON_KEY`: the anon public key
3. Click **Deploy**.

## Backups
The free Supabase plan has no automatic daily backups. Once a week, use **Settings → Download backup (Excel)**.

## Develop
```bash
npm install
cp .env.example .env   # fill in the two values
npm run dev
npm test               # loan math tests
```
