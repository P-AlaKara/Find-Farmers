# Payment Expiry Cron

This project uses a scheduled Supabase Edge Function to expire unpaid bookings.

## What It Does

`expire-pending-bookings` should run every minute. It finds bookings where:

- `payment_status = pending`
- `payment_reference IS NOT NULL`
- `payment_requested_at` is older than 2 minutes
- `booking_status = approved`, or `booking_status = pending_approval` for the legacy procurement integration

For each expired booking, it:

- sets `payment_status = rejected`
- sets `booking_status = rejected`
- releases the farmer back to `listing_status = available`
- sends a failure callback for external bookings that have `callback_url`

The normal app still polls `booking-status`, which also has the same 2-minute expiry behavior as a fallback. Farmer-waiting local/main-platform bookings with `booking_status = pending_approval` do not expire until the buyer starts payment after farmer approval. The cron job is the primary cleanup path.

## Required Secrets

Set this Edge Function secret:

```sh
supabase secrets set PAYMENT_EXPIRY_CRON_SECRET="<generate-a-long-random-secret>"
```

Keep the value private. The cron invocation must send it as:

```http
x-cron-secret: <PAYMENT_EXPIRY_CRON_SECRET>
```

## Deploy The Function

```sh
supabase functions deploy expire-pending-bookings
```

## Schedule It In Supabase

Supabase schedules Edge Functions using `pg_cron` and `pg_net`. Supabase recommends storing invocation values in Vault so secrets are not hard-coded in scheduled SQL.

Run this SQL in the Supabase SQL editor, replacing the placeholders:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('YOUR_PAYMENT_EXPIRY_CRON_SECRET', 'payment_expiry_cron_secret');

select cron.schedule(
  'expire-pending-bookings-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/expire-pending-bookings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'payment_expiry_cron_secret')
    ),
    body := jsonb_build_object('triggered_at', now())
  ) as request_id;
  $$
);
```

Supabase's scheduling docs are here: https://supabase.com/docs/guides/functions/schedule-functions

## Manual Test

After deploy, invoke the function manually:

```sh
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/expire-pending-bookings" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_PAYMENT_EXPIRY_CRON_SECRET" \
  -d '{}'
```

Expected response:

```json
{
  "status": 200,
  "data": {
    "cutoff": "2026-06-14T00:00:00.000Z",
    "expired": 0,
    "callback_failures": []
  }
}
```

## Operational Notes

- Run every minute so a 2-minute timeout is enforced promptly after a payment prompt is started.
- If a Paystack success webhook arrives after a booking has expired, the webhook ignores it and does not re-confirm the booking.
- If a callback URL is down, the booking is still expired and the farmer is still released; the failed callback is logged in `callback_failures`.
- To remove the schedule:

```sql
select cron.unschedule('expire-pending-bookings-every-minute');
```
