# Ara Loan Tracker

Loan records, client applications, e-signed contracts, payments, penalties and reports for Ara's lending.
Built with React and Vite on Vercel, with Supabase for the database, login and private ID photo storage.

## Pages

| Page | Who | What |
|---|---|---|
| `/apply` | New clients | Details, valid ID, selfie with ID, requested amount and payout details |
| `/sign/<link>` | Applicants and returning clients | Opens the exact contract Ara prepared, then the client signs it. Link works for 48 hours. |
| `/admin` | Ara | Dashboard, Applications, Records (month tabs), Clients, Reports, Settings |

## Loan rules

- Every loan is 1 month at 20% interest by default. The rate can be changed per loan.
- Payment schedules:
  - **Monthly**: 1 payment
  - **Every 15 days**: 2 payments, on day 15 and on the due date
  - **Weekly**: 4 payments, on days 7, 14 and 21 and on the due date
- Late penalty: **3% per day on the unpaid portion of each overdue installment** (for example, ₱180 per day on a missed ₱6,000 bi-weekly installment). Future installments are not included. Ara can waive it per loan.
- Payments go to the oldest unpaid installment first.

## Setup (one time)

### 1. Supabase
1. Create a new project. Region: **Southeast Asia (Singapore)**.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, then **Run**. Re-run it after pulling workflow/security updates.
3. Import the old sheet: paste the private `import-history.sql` file and **Run**. That file is not on GitHub because it has borrower names.
4. **Authentication → Users → Add user**: create Ara's Supabase user using the same email address as the Google account, and confirm the email. This lets Google sign-in link to that existing account.
5. Back in **SQL Editor**, give that account admin access:
   ```sql
   insert into public.admins (email) values ('ara-email@gmail.com');
   ```
6. **Authentication → Sign In / Providers → Google**: enable Google and paste the OAuth **Web application Client ID** and **Client Secret** from Google Cloud Console. The client ID is a domain-like value ending in `.apps.googleusercontent.com`; it is not an email address. In Google Cloud, add the Supabase callback URL shown in the provider panel as an authorized redirect URI.
7. In **Authentication → URL Configuration**, add the deployed app URL (and local dev URL if needed) to the allowed redirect URLs.
8. Keep public email/password signups disabled. Google sign-in should use Ara's confirmed email account; `public.admins` is the final authorization check for the admin area.
9. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

### 2. Application abuse protection
1. Create a Cloudflare Turnstile widget for the deployed app hostname and copy its site key and secret key.
2. Set `VITE_TURNSTILE_SITE_KEY` in Vercel's project environment variables.
3. In Supabase **Edge Functions → Secrets**, set `TURNSTILE_SECRET_KEY` and `APP_ORIGIN` (the exact deployed origin, e.g. `https://your-app.vercel.app`). Never put the secret in Vercel or in a `VITE_` variable.
4. Deploy the function from the repository root with the Supabase CLI:
   ```bash
   supabase functions deploy submit-application
   ```
   The function validates Turnstile, rate limits submissions by IP, uploads ID photos privately, and creates the application. The client app no longer uploads KYC images directly.

### 3. Vercel
1. **Add New → Project →** import `araloantracker` from GitHub.
2. Add these Environment Variables:
   - `VITE_SUPABASE_URL`: the Project URL
   - `VITE_SUPABASE_ANON_KEY`: the anon public key
   - `VITE_TURNSTILE_SITE_KEY`: Cloudflare Turnstile site key
3. Click **Deploy**.

## Backups and privacy
The Excel report export is for review and is not a full backup: it does not include all database settings or private ID/selfie images. Configure database backups/PITR in Supabase for the project's plan, and keep an encrypted, access-controlled backup of the private `kyc` Storage bucket. Periodically verify that database and file backups can be restored. Do not put borrower exports, IDs, secrets, or `.env` files in GitHub.

## Develop
```bash
npm install
cp .env.example .env   # fill in the Supabase values and Turnstile site key
npm run dev
npm test               # loan math tests
```
