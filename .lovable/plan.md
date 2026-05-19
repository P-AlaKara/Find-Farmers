# Buyer Onboarding & Booking Overhaul

## 1. Database changes (migration)

Extend `buyers` table with profile fields:
- `company_name` (text)
- `business_type` (text)
- `primary_county`, `primary_town` (text)
- `additional_locations` (jsonb, array of {county, town})
- `varieties_required` (text[])
- `quantity_per_order` (numeric), `quantity_unit` (text: kg|tons)
- `demand_frequency` (text), `demand_frequency_custom` (text)
- `quality_preference` (text: flexible|custom), `quality_specifications` (text)
- `contact_full_name`, `contact_role` (text)
- `preferred_contact_methods` (text[])
- `additional_notes` (text)
- `profile_completed` (boolean, default false)

Keep existing `buyer_name`, `phone_number`, `email`, `county`, `password_hash` for auth/back-compat.

Add `bookings.notes` (optional) — skip if not needed. Leave bookings schema otherwise unchanged; `acres_booked` will always equal the farmer's full acreage.

## 2. Multi-step Buyer Registration page (`/register-buyer`)

Rewrite `src/pages/BuyerRegistration.tsx` as a 7-step wizard:

1. **Account credentials + Company info** — email, password, confirm, company name, business type (dropdown)
2. **Location & Operations** — primary county (from KENYA_COUNTIES), primary town, dynamic additional locations (Add/Remove)
3. **Product & Variety Requirements** — fixed "Potatoes", multi-select chips for varieties + "Other" free text
4. **Demand Profile** — quantity + unit (Kg/Tons), frequency dropdown, custom text if "Custom"
5. **Quality & Specifications** — dropdown Flexible / Custom, textarea if Custom
6. **Contact Person** — full name, role, phone, email, preferred contact methods (multi-select chips)
7. **Additional Notes** — textarea

UX:
- Sticky progress indicator (step N of 7 + progress bar)
- Previous / Next buttons; Next validates current step
- Save progress to `localStorage` (`buyer_registration_draft`) on each change; restore on mount; clear on submit
- Per-field inline validation with zod
- Smooth fade transitions between steps
- Mobile-first responsive

Submit → POST to `api-auth/register-buyer` with full payload → success screen with "Go to Dashboard" / "Edit Profile" buttons.

## 3. Backend updates (`supabase/functions/api-auth/index.ts`)

- Expand `/register-buyer` to accept and persist all new profile fields, set `profile_completed = true`.
- Add `/buyer/profile/get` endpoint returning the full profile.
- Update `/buyer/profile` PATCH to accept the new fields.

## 4. Booking flow changes

Update `src/pages/Marketplace.tsx`:
- Remove the manual booking modal fields (name/phone/email/county/acres).
- Booking button behavior:
  - If not logged in as buyer → modal prompting "Sign in" or "Create buyer account" (links to /login and /register-buyer).
  - If logged in → confirmation modal showing: farmer name, location, total acreage (full), price/acre, total amount, then "Confirm & Pay" which initializes payment for `acres_booked = farmer.acreage_planted`.
- No partial acreage input.

## 5. Marketplace visibility

`src/pages/Marketplace.tsx` query: filter out farmers with `listing_status = 'booked'` (only show `listing_status = 'available'` + `registration_status = 'approved'`). Booked farms remain visible to the buyer in `/buyer/bookings` (already exists — verify it shows booked farms under "My Procurement" heading).

## 6. Settings page

Update `src/pages/BuyerSettings.tsx` to allow editing the new profile fields (company info, locations, demand, quality, contact prefs). Keep change-password section.

## Technical details

- Use `react-hook-form` if already installed, else local `useState` per step with a single shared object.
- Varieties multi-select: simple chips with toggle + free-text "Other" input.
- Additional locations: `Array<{county, town}>` rendered with Add/Remove buttons.
- All new columns nullable to avoid breaking existing rows; default `profile_completed = false` for legacy buyers (they'll be prompted to complete on next login — out of scope unless requested).
- Auth/session unchanged: token in localStorage via existing `src/lib/auth.ts`.

## Files

New / heavily rewritten:
- `src/pages/BuyerRegistration.tsx` (rewrite as wizard)

Edited:
- `src/pages/Marketplace.tsx` (gating + confirm modal + filter)
- `src/pages/BuyerSettings.tsx` (extended profile fields)
- `supabase/functions/api-auth/index.ts` (expanded register-buyer + profile endpoints)
- Migration adding buyer profile columns

Booked-farm visibility on `/buyer/bookings` already implemented — will verify and adjust heading/copy only.
