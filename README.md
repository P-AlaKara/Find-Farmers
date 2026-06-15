# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Google sign-in setup

Google sign-in is implemented through Supabase Auth and then mapped back to the app's existing buyer/farmer session model.

To enable it:

- Create a Google Cloud OAuth Web client.
- In Google Cloud, add your app origin, for example `http://localhost:5173` and your production domain.
- In Google Cloud, add the Supabase Google callback URL from Supabase Auth provider settings as an authorized redirect URI.
- In Supabase Auth providers, enable Google and add the Google client ID and secret.
- In Supabase Auth URL settings, allow the app URL, for example `http://localhost:5173/` and the production equivalent. The app detects Supabase's OAuth token hash at the root URL before the hash router runs.
- For local Supabase CLI, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; `supabase/config.toml` reads those values for `[auth.external.google]`.

## External procurement integration

External procurement apps can search available farms, start a whole-farm booking, and receive the final result by callback. The external app does not run M-Pesa prompting or payment retries; this platform initializes the prompt, processes Paystack webhooks, confirms successful bookings, and rolls back timed-out bookings.

### Authentication

All external endpoints require an API key header:

```http
x-api-key: <EXTERNAL_API_KEY>
```

Paystack calls `external-booking-webhook` directly with `x-paystack-signature`. Pending payments are expired by the scheduled `expire-pending-bookings` function; see `CRON.md`.

### 1. Get available farmers

```http
GET /functions/v1/external-get-farmers
```

Supported query filters:

- `county`
- `ward`
- `specific_location`
- `potato_variety`
- `min_acreage`
- `max_acreage`
- `planting_date_from`
- `planting_date_to`

Only approved farmers with `listing_status = available` are returned. Use the public `farmer_id` from this response when booking; internal database UUIDs are not part of the external contract.

Example response:

```json
{
  "status": 200,
  "data": [
    {
      "farmer_id": "F-12345",
      "full_name": "Jane Farmer",
      "phone_number": "0712345678",
      "email": "jane@example.com",
      "county": "Nakuru",
      "ward": "Njoro",
      "specific_location": "Mauche",
      "potato_variety": "Shangi",
      "acreage_planted": 3,
      "farm_acreage": 3,
      "planting_date": "2026-05-01",
      "listing_status": "available",
      "price_per_acre": 5000,
      "estimated_total_amount": 15000
    }
  ]
}
```

### 2. Book a whole farm

```http
POST /functions/v1/external-book-farmer
Content-Type: application/json
```

Request body:

```json
{
  "farmer_id": "F-12345",
  "company_name": "Acme Procurement Ltd",
  "phone": "0712345678",
  "email": "buyer@acme.example.com",
  "county": "Nairobi",
  "callback_url": "https://procurement.example.com/webhooks/farmer-booking"
}
```

Do not send acres. External bookings always reserve the whole farm using the farmer's `acreage_planted`.

Immediate response:

```json
{
  "status": 200,
  "data": {
    "booking_ref": "00000000-0000-0000-0000-000000000000",
    "payment_reference": "00000000000000000000000000000000",
    "reference": "00000000000000000000000000000000",
    "total_amount": 15000,
    "farm_acreage": 3,
    "payment_method": "mpesa",
    "message": "An M-Pesa payment prompt has been sent to +254712345678. The customer should enter their PIN to complete payment."
  }
}
```

The procurement app should wait for the callback. Successful payments send a success callback through `external-booking-webhook`; timed-out payments send a failure callback through the scheduled `expire-pending-bookings` cleanup job.

### Success callback

After Paystack confirms payment, this platform posts to `callback_url`:

```json
{
  "status": "success",
  "message": "Booking confirmed",
  "data": {
    "booking_ref": "00000000-0000-0000-0000-000000000000",
    "payment_reference": "00000000000000000000000000000000",
    "payment_status": "paid",
    "booking_status": "confirmed",
    "total_amount": 15000,
    "price_per_acre": 5000,
    "farm_acreage": 3,
    "buyer": {
      "company_name": "Acme Procurement Ltd",
      "phone": "0712345678",
      "email": "buyer@acme.example.com",
      "county": "Nairobi"
    },
    "farmer": {
      "farmer_id": "F-12345",
      "full_name": "Jane Farmer",
      "phone_number": "0712345678",
      "email": "jane@example.com",
      "county": "Nakuru",
      "ward": "Njoro",
      "specific_location": "Mauche",
      "potato_variety": "Shangi",
      "acreage_planted": 3,
      "planting_date": "2026-05-01"
    }
  }
}
```

### Failure callback

Pending bookings expire after 2 minutes. The scheduled `expire-pending-bookings` function rejects the booking, releases the farmer back to available, and sends this callback for external bookings:

```json
{
  "status": "failed",
  "reason": "payment_timeout",
  "message": "Payment was not completed before the booking reservation expired.",
  "data": {
    "booking_ref": "00000000-0000-0000-0000-000000000000",
    "payment_reference": "00000000000000000000000000000000",
    "farmer_id": "F-12345"
  }
}
```

### Check booking status

```http
GET /functions/v1/booking-status?reference=<payment_reference>
```

External apps may also poll this endpoint with `payment_reference` if they want to show live status in their own UI. As a fallback, if the booking is still pending but older than 2 minutes, this endpoint also marks it rejected, releases the farmer, sends the failure callback, and returns:

```json
{
  "status": 200,
  "data": {
    "booking_ref": "00000000-0000-0000-0000-000000000000",
    "payment_status": "rejected",
    "booking_status": "rejected",
    "reason": "payment_timeout"
  }
}
```

### Error responses

Errors use this shape:

```json
{
  "status": 400,
  "message": "Missing required fields: company_name"
}
```

Common statuses:

- `400`: invalid request, invalid phone/email, or unavailable farmer.
- `401`: missing or invalid API key.
- `404`: unknown public `farmer_id`.
- `409`: farmer was reserved by another request before this booking could lock it.
- `500`: server or payment initialization error. If a booking or farmer lock was created before the error, this platform attempts rollback before responding.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
