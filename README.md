# Belfast Print — Custom T-Shirt Website

A standalone, hand-coded website (no Shopify, no page builder) for
Belfast Print. Customers upload artwork, drag it onto a shirt, choose
size/colour, and pay with Square — the design and order details are
then emailed straight to you.

## What's in here

- `index.html` — the whole customer-facing site: shirt configurator,
  upload, drag/resize, checkout
- `order-confirmed.html` — shown after a successful payment
- `orders.html` — staff-only page listing every order with its shirt
  preview, artwork, and buyer/shipping details
- `css/style.css` — all styling
- `js/main.js` — the drag-and-drop/resize logic, price calculation,
  and checkout flow
- `netlify/functions/` — the serverless backend (see below)

## How an order actually works, end to end

1. Customer uploads a PNG, drags/resizes it on the shirt, picks size,
   colour, and collection or postage.
2. Clicking **Pay with Square** first sends the artwork (plus a
   flattened preview showing exactly how it's placed) to
   `save-design.js`, which stores it and returns an ID.
3. `create-checkout.js` looks up that saved design to confirm the
   order details (server-side, not trusted from the browser) and
   creates a Square-hosted checkout for the flat price.
4. Once Square confirms payment, `square-webhook.js` fires: it
   retrieves the saved design, records the order, and emails
   everything — the flattened preview and the original artwork
   file(s) — to your notification address.

Nothing is emailed or recorded until payment actually completes —
someone abandoning checkout never generates an order.

## Environment variables you need to set (in Netlify)

| Variable | What it's for |
|---|---|
| `SQUARE_ACCESS_TOKEN` | From your Square Developer app |
| `SQUARE_LOCATION_ID` | The Square location this shop's sales belong to |
| `SQUARE_ENVIRONMENT` | `sandbox` while testing, `production` when live |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | From the webhook subscription (see below) |
| `ADMIN_PASSWORD` | The staff password for `/orders.html` and `/admin.html` |
| `GMAIL_USER` | The Gmail address sending notification emails (`adminocto@gmail.com`) |
| `GMAIL_APP_PASSWORD` | A Google **App Password** for that account — not its normal password |
| `ORDER_NOTIFICATION_EMAIL` | Where order emails are sent (`voodoosouprecords@gmail.com`) |
| `NETLIFY_BLOBS_TOKEN` / `SITE_ID` | Only needed if your site requires manual Blobs configuration — see the note below |

This all follows the exact same setup as Hectic Records' site, so if
you've done this before it'll feel familiar:

1. **Square**: developer.squareup.com, create an application, get
   your Access Token and Location ID (Sandbox first, for testing).
2. **Square webhook**: in that app, Webhooks > Add Endpoint, URL
   `https://yoursite.com/api/square-webhook`, subscribe to
   `payment.updated`, copy the Signature Key it gives you.
3. **Gmail App Password**: turn on 2-Step Verification on the
   `adminocto@gmail.com` account at
   [myaccount.google.com/security](https://myaccount.google.com/security),
   then create an app password at
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
4. **Netlify Blobs**: if you see an error mentioning "environment has
   not been configured to use Netlify Blobs" when testing, create a
   Personal Access Token in Netlify (avatar > User settings >
   Applications > New access token) and add it as
   `NETLIFY_BLOBS_TOKEN` — `SITE_ID` is provided automatically, no
   need to set it yourself.

## Shipping (postal delivery)

Same approach as Hectic Records: **collection is always free and
always offered** (from Drip, 49 Rosemary Street, Belfast — this is
hardcoded into the site's text, so if the collection point ever
changes, that's a find-and-replace across `index.html`,
`order-confirmed.html`, and the footer).

For posting shirts out, Square calculates the actual cost — not this
site's own code. Set this up once in your **Square Dashboard**
(regular business account, not Developer): Settings > Account &
Settings > Fulfillment methods > Shipment, add countries you post to,
and add at least one rate. Without a rate configured, choosing "Post
to me" will get stuck on Square's payment page — test this before
relying on it.

## Pricing

One flat price — £20 — regardless of front-only vs front & back, and
regardless of print method (film transfer or DTG). Set in
`netlify/functions/create-checkout.js` as `FLAT_PRICE` near the top
of the file. To change the price, or to charge more for front & back
specifically, edit that file and redeploy — there's no admin panel
for this since it's a single fixed price rather than a stock
catalogue.

## Print location & print method

Customers choose **Front only** or **Front & back** — if they pick
front & back, a second upload and its own preview tab appear, and
both designs are required before checkout unlocks.

They also choose a **print method**: Film transfer (DTF) or Direct to
garment (DTG), each with a short explanation on the page itself so
customers understand the difference before choosing. Both options
currently cost the same — this is just a preference for you to see
per order (shown in the confirmation email and `/orders.html`), not
something built into a real production difference here.

## Staff login — sizes, stock & colours

There's a staff-only page at `/admin.html` (linked from `/orders.html`,
and vice versa — same staff password unlocks both). It has two panels:

**Sizes & stock** — a running count of how many blank shirts you have
in S, M, L, XL, and XXL. Set a size to 0 when you're out — it
immediately shows crossed out on the site and can't be selected,
without needing to show customers an actual number. Every real order
automatically counts down the size that was ordered, so this stays
accurate on its own — you only need to update it when new stock
arrives, or to correct it manually.

**Colours** — the shirt colours customers can pick from, shown as
actual colour swatches on the site. Add a new one with a name and a
colour picker, or remove one you no longer stock. There's no
per-colour stock count, just whether it's offered at all — if you
need that level of tracking later, it's a reasonable thing to add.

Like Hectic's stock editor, this page's own login screen doesn't
check the password — the real check happens when you click **Save
Changes**, so mistyping it just means the save fails with "Wrong
password" rather than the whole page rejecting you upfront.

## Hosting it

Same pattern as Hectic Records:

1. Push this folder to a new GitHub repository (make sure every
   folder — `css`, `js`, `netlify` — actually preserves its structure
   when uploading; dragging the folder icons themselves onto GitHub's
   upload page works, using the file picker/"choose files" button
   does not).
2. Connect that repo to a new Netlify site (Add new site > Import an
   existing project).
3. Add all the environment variables above.
4. Trigger a deploy.
5. Test a full order in Square sandbox before switching to
   production credentials for real payments.

## Processing & collection times

The site tells customers: postal orders are processed and shipped
within 7 working days, and collection orders are ready within 1
working day (Monday–Friday). This is just text on the page (in
`index.html`, in the price section) — it's not enforced by any code,
so if actual turnaround changes, that's a find-and-replace.

## A few things worth knowing

- **Apple Pay / Google Pay bug**: Square has a known issue where
  postage sometimes doesn't get charged when a customer pays with
  Apple Pay or Google Pay instead of a card (shipping shows as free).
  If you offer postal delivery, it's worth turning off Apple Pay and
  Google Pay for Payment Links specifically in your Square Dashboard
  (Payments > Payment links > Settings > General) until Square fixes
  this, to avoid losing postage revenue.
- **Multiple Square locations**: if this Square account also runs
  other shops or tills, make sure `SQUARE_LOCATION_ID` points to this
  site's own dedicated location — the webhook filters by it
  specifically so other shops' sales never show up in `/orders.html`
  or trigger a notification email here.
- **Design storage isn't cleaned up automatically.** Every uploaded
  design (even ones nobody pays for) is stored indefinitely. For the
  volume a shop like this does, that's not a practical problem, but
  it's not automatically deleted either.
- This is intentionally a **simple, two-price** setup — no discounts,
  no bulk pricing, no product catalogue. If you want more shirt
  styles, additional pricing tiers, or a stock/admin panel down the
  line, that's very doable, just say.
