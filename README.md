# Skillverse SuperApp

Feed + marketplace + digital library + Paystack paywall + PWA, as one Node.js app.

## Run it

```bash
npm install
cp .env.example .env     # then fill it in (see below)
npm start                # http://localhost:3000
```

Set at least `JWT_SECRET`, `ADMIN_PASSWORD`, `PAYSTACK_PUBLIC_KEY` and `PAYSTACK_SECRET_KEY` in `.env`.

## Admin account

On first start the server creates `abdulazeezmustapha3156@gmail.com` with the password from `ADMIN_PASSWORD`
(if you leave it empty, a temporary one is printed once in the console). Log in through the normal form.
The admin role is always tied to that email, and nobody can register that address through the public form.
Set `ADMIN_PHONE` so the WhatsApp button works on your own listings.

## Paystack

1. Put your live keys in `.env`.
2. In the Paystack dashboard set the webhook URL to `https://YOUR-DOMAIN/api/paystack/webhook`.
3. The modal only appears when a visitor taps "Read online" or "Download" on premium content.
   Payments are verified server-side with your secret key before access is granted (30 days, no auto-renewal).

## Admin Dashboard

Overview (visitor counter, 7-day chart), Listings (approve, feature, delete), Library (upload PDF + cover,
mark premium or free), Banners (feed announcements), Users (registered users table), Settings (founder page).

## Feed ranking

Admin and featured items fill 2 of every 3 feed slots, a banner appears every sixth slot, and the ranked list loops
so scrolling never ends.

## Make an Android APK

1. Deploy to an HTTPS domain (Render, Railway, a VPS, etc.). Keep the `data/`, `uploads/` and `private/` folders on persistent storage.
2. Open https://www.pwabuilder.com, enter your URL, and run the report. Manifest and service worker are already included.
3. Choose Android, generate the package, and follow its signing instructions.

## Notes

- Data lives in `data/db.json`. That is fine for a launch; move to a real database as traffic grows.
- Premium PDFs sit in `private/` and are only streamed to subscribed users.
- Add `public/founder.jpg` to show a founder photo.
