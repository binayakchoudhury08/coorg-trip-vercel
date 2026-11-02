# Coorg trip: form + UPI payment (Vercel)

This folder is the public site. The admin page (`coorg-admin.html`) is NOT in here and is never published.

## Setup / update on Vercel

1. Upload this folder as a Vercel project (Framework preset: **Other**), or redeploy over the existing one.
2. **Storage → Upstash for Redis** connected to the project (already done if you set it up before).
3. **Settings → Environment Variables**:
   - `ADMIN_KEY` – your secret for the admin page (12+ characters)
   - `UPI_ID` – the UPI ID that receives money, e.g. `coorgtrip@okaxis` (a free business UPI ID is best)
   - `UPI_NAME` – payee name shown in the UPI app, e.g. `Coorg Trip`
   - optional `TRIP_PRICE` – defaults to `8499`
   - optional `ALLOWED_EMAIL_DOMAIN` – e.g. `mesaschool.co`
4. **Redeploy** after changing variables.

## How payment works (free, no gateway)
1. Student fills the form → gets a trip code (e.g. CRG-7KQ2).
2. Payment screen: Google Pay / PhonePe / Paytm / BHIM / any UPI app buttons and a QR,
   all pre-filled with ₹8,499 and "Coorg trip CRG-7KQ2" in the note.
3. Student pays, then enters the 12-digit UTR → status "To check".
4. You open the admin page, find that UTR in your bank/UPI app, tap **Mark paid** → "Paid ✓".

UPI does not notify websites automatically, so step 4 is a manual check. A UTR can only be claimed once.

## One registration per person
- An email can register only once (Gmail dots, "+aliases" and capital letters count as the same email).
- A phone number can register only once.
- A UTR can be claimed only once.
- Every refused attempt is logged and shown under "Blocked attempts" in the admin page.
- Someone who already registered can reopen their payment screen with the same email + phone.

## Files
- `index.html` – the form + payment page
- `assets/` – photos, reel video, QR code library
- `api/submit.js` – saves registration, creates trip code
- `api/payment.js` – saves the student's UTR
- `api/status.js` – gives a returning visitor their latest payment details/status
- `api/resume.js` – reopens payment for an existing registration (email + phone must match)
- `api/responses.js` – admin only (ADMIN_KEY): list, mark paid, delete
