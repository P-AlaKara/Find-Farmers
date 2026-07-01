# Main Platform API

This API lets the root-domain main platform mirror farmer-dashboard workflows without using the existing procurement-app integration.

## Base URL

Use this Supabase Edge Functions base URL:

```text
https://hcfcpqlcawbpqtruttsi.supabase.co/functions/v1
```

For example:

```http
GET https://hcfcpqlcawbpqtruttsi.supabase.co/functions/v1/main-platform-get-farmer?farmer_id=F-12345
```

## Authentication

All main-platform endpoints require:

```http
x-api-key: <EXTERNAL_API_KEY_MAIN>
```

`EXTERNAL_API_KEY_MAIN` is separate from `EXTERNAL_API_KEY`, which remains reserved for the existing procurement app.

## Booking Lifecycle

- `pending_approval`: buyer requested a booking; farmer has not confirmed availability.
- `approved`: farmer confirmed availability; buyer can now confirm and pay.
- `confirmed`: buyer payment succeeded; booking is fully confirmed.
- `rejected`: farmer rejected, payment timed out, or booking is no longer valid.

## Register Farmer

```http
POST /functions/v1/main-platform-register-farmer
Content-Type: application/json
x-api-key: <EXTERNAL_API_KEY_MAIN>
```

Request:

```json
{
  "external_platform_ref": "main-12345",
  "callback_url": "https://main.example.com/webhooks/find-farmers",
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
```

Response:

```json
{
  "status": 201,
  "data": {
    "farmer_id": "F-12345",
    "external_platform_ref": "main-12345",
    "registration_status": "pending",
    "listing_status": "pending_approval",
    "message": "Farmer registration received and is pending approval"
  }
}
```

Registrations from the main platform are created with `payment_status = promo_code` and `registration_fee = 0`. If `external_platform_ref` already exists, the endpoint returns the existing farmer instead of creating a duplicate.

## Get Farmer

```http
GET /functions/v1/main-platform-get-farmer?farmer_id=F-12345
x-api-key: <EXTERNAL_API_KEY_MAIN>
```

Returns farmer profile, registration/listing status, acreage, planting date, and estimated harvest date.

## Get Farmer Bookings

```http
GET /functions/v1/main-platform-farmer-bookings?farmer_id=F-12345&status=all
x-api-key: <EXTERNAL_API_KEY_MAIN>
```

Supported `status` values: `all`, `pending_approval`, `approved`, `confirmed`, `rejected`.

Each booking includes:

```json
{
  "booking_ref": "00000000-0000-0000-0000-000000000000",
  "farmer_id": "F-12345",
  "acres_booked": 3,
  "price_per_acre": 5000,
  "total_amount": 15000,
  "payment_status": "pending",
  "booking_status": "pending_approval",
  "farmer_confirmed_at": null,
  "payment_requested_at": null,
  "received_confirmed_at": null,
  "buyer": {
    "company_name": "Acme Procurement Ltd",
    "phone": "0712345678",
    "email": "buyer@example.com",
    "county": "Nairobi"
  }
}
```

## Confirm Or Reject Booking

```http
POST /functions/v1/main-platform-confirm-booking
Content-Type: application/json
x-api-key: <EXTERNAL_API_KEY_MAIN>
```

Request:

```json
{
  "farmer_id": "F-12345",
  "booking_ref": "00000000-0000-0000-0000-000000000000",
  "decision": "approve"
}
```

Approve response:

```json
{
  "status": 200,
  "data": {
    "booking_ref": "00000000-0000-0000-0000-000000000000",
    "farmer_id": "F-12345",
    "booking_status": "approved",
    "payment_status": "pending",
    "farmer_confirmed_at": "2026-07-01T09:00:00.000Z",
    "message": "Farmer availability confirmed. Buyer can now confirm and pay."
  }
}
```

Reject response:

```json
{
  "status": 200,
  "data": {
    "booking_ref": "00000000-0000-0000-0000-000000000000",
    "farmer_id": "F-12345",
    "booking_status": "rejected",
    "payment_status": "rejected",
    "message": "Booking rejected and farmer listing released."
  }
}
```

## Check Booking Status

```http
GET /functions/v1/main-platform-booking-status?booking_ref=00000000-0000-0000-0000-000000000000
x-api-key: <EXTERNAL_API_KEY_MAIN>
```

Use this endpoint as a polling fallback if a webhook callback is missed.

## Callback Events

When a farmer or booking has a `callback_url`, this platform posts lifecycle events:

- `farmer_registered`
- `booking_requested`
- `farmer_confirmed`
- `farmer_rejected`
- `payment_started`
- `booking_confirmed`
- `payment_timeout`
- `booking_received`

Example callback:

```json
{
  "event": "farmer_confirmed",
  "data": {
    "booking_ref": "00000000-0000-0000-0000-000000000000",
    "farmer_id": "F-12345",
    "booking_status": "approved",
    "payment_status": "pending",
    "total_amount": 15000
  }
}
```

Callback delivery failures are logged but do not roll back the booking update. Use the polling endpoints for recovery.

## Error Shape

```json
{
  "status": 400,
  "code": "invalid_request",
  "message": "Missing required fields: full_name"
}
```

Common statuses:

- `400`: invalid or missing request fields.
- `401`: missing or invalid `EXTERNAL_API_KEY_MAIN`.
- `404`: farmer or booking not found.
- `409`: invalid booking state, unavailable farmer, or duplicate transition.
- `500`: unexpected server error.
