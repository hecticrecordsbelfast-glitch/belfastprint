# Belfast Print

A single-page custom t-shirt shop: customers upload a PNG design, drag it onto a shirt, choose colour/size/print options, pay through Square, and the order (plus artwork) gets emailed to you. Staff pages let you manage stock/colours and see orders. A separate bulk enquiry form handles wholesale requests that don't fit the standard flow.

## Environment variables (set in Netlify → Site settings → Environment variables)

| Variable | Purpose |
|---|---|
| `SQUARE_ACCESS_TOKEN` | Square API access token (sandbox or production) |
| `SQUARE_LOCATION_ID` | Your Square location ID — used to create checkouts and to filter webhook events so only this shop's sales are recorded |
| `SQUARE_ENVIRONMENT` | `sandbox` or `production` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | From Square Dashboard → Webhooks, used to verify incoming webhook calls |
| `ADMIN_PASSWORD` | Password for `admin.html` and `orders.html` |
| `GMAIL_USER` | Gmail address used to send order/enquiry emails (e.g. `adminocto@gmail.com`) |
| `GMAIL_APP_PASSWORD` | A Gmail **App Password** (not your normal password) — generate at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |
| `ORDER_NOTIFICATION_EMAIL` | Where order and enquiry emails are sent (e.g. `voodoosouprecords@gmail.com`) |
| `NETLIFY_BLOBS_TOKEN` / `SITE_ID` | Only needed if you see a "Blobs environment has not been configured" error — see below |

### If Netlify Blobs gives a "not configured" error

Create a Personal Access Token: Netlify → User settings → Applications → **New access token**. Add it as `NETLIFY_BLOBS_TOKEN`. Also add `SITE_ID` (or `NETLIFY_SITE_ID`), found on your site's **Site configuration → General** page. The functions already fall back to this token/siteID pair automatically if present.

## Pricing

Flat price, currently **£20**, regardless of front/back or print method. To change it, update `FLAT_PRICE` in both:
- `netlify/functions/create-checkout.js`
- `js/main.js`

## Print location & method

- **Front only** / **Front & back** — customers upload a design per side; front & back uses the same flat price.
- **Film transfer (DTF)** / **Direct to garment (DTG)** — shown with short descriptions on the page so customers understand the difference.

## Stock & colours

Staff manage sizes/stock and the colour list from `admin.html` (password-protected, same `ADMIN_PASSWORD` as orders). Sold-out sizes show crossed out on the customer page but aren't hidden from admin. Stock is decremented automatically by the webhook whenever a payment completes.

## Bulk / wholesale enquiries

`wholesale.html` is a simple contact form (name, email, phone, message, up to 5 image attachments) linked from the homepage. Submissions go to `netlify/functions/send-inquiry.js`, which emails the full enquiry plus attached images to `ORDER_NOTIFICATION_EMAIL` and also saves a record in a `inquiries` Blobs store (no staff viewing page for these yet — email is the source of truth; ask if you'd like an `enquiries.html` list page added later).

## Staff login

`admin.html` — stock & colours. `orders.html` — list of paid orders with front/back previews, buyer details, and a "mark as fulfilled" toggle. Both use the same `ADMIN_PASSWORD`; the password is only checked server-side on save/fetch, so the login screen itself is just a convenience gate.

## Processing & collection times

Shown on the homepage, under the order button: postal orders are processed and shipped within 7 working days; collection orders are ready within 1 working day (Monday–Friday, excluding weekends). Collection point: **Drip, 49 Rosemary Street, Belfast**.

## Deploying

1. Upload all files to your GitHub repo, preserving folder structure (`css/`, `js/`, `netlify/functions/`) — if using GitHub's web upload, drag the actual folders rather than individual files, or the structure will flatten.
2. Connect the repo in Netlify (or push to the branch it's already watching).
3. Set the environment variables above.
4. In Square Dashboard, create a webhook pointing at `https://<your-site>/.netlify/functions/square-webhook` subscribed to `payment.updated`, and copy its signature key into `SQUARE_WEBHOOK_SIGNATURE_KEY`.
5. Run a test order in sandbox before switching `SQUARE_ACCESS_TOKEN`/`SQUARE_ENVIRONMENT` to production.

## A few things worth knowing

- Square has a known bug where Apple Pay/Google Pay checkouts can show shipping as free even when a shipping charge is set — card payments charge correctly. Workaround: disable Apple Pay/Google Pay for Payment Links in Square Dashboard (Payments → Payment links → Settings).
- The webhook filters by `SQUARE_LOCATION_ID` so sales from other locations on the same Square account are ignored.
- Uploaded designs are stored indefinitely in the `designs` Blobs store (used for building the order email and stock checks) — there's no automatic cleanup. Same for enquiry images in the `inquiries` store.
- Shipping is handled entirely through Square's own **Shipping Rate Profiles** (Square Dashboard → Settings → Account & Settings → Fulfillment methods → Shipment) — there's no custom shipping code in this site.
