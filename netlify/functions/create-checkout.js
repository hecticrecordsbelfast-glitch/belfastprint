/* ------------------------------------------------------------------
   Creates a Square-hosted checkout (Payment Link) for a custom
   t-shirt order. Price is a flat rate (see FLAT_PRICE below) —
   looked up from the saved design record so the amount charged
   can't be tampered with from the browser.

   Needs: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT
   (sandbox/production), and NETLIFY_BLOBS_TOKEN/SITE_ID if your site
   needs manual Blobs configuration. See README.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");

const FLAT_PRICE = 20; // £ — same regardless of front-only/front & back or print method

function getDesignsStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name: "belfastprint-designs", siteID, token });
  }
  return getStore("belfastprint-designs");
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  const ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const API_BASE = ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

  if (!ACCESS_TOKEN || !LOCATION_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Square isn't configured yet. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in your hosting dashboard." }),
    };
  }

  let designId, fulfillment;
  try {
    const parsed = JSON.parse(event.body || "{}");
    designId = parsed.designId;
    fulfillment = parsed.fulfillment === "shipping" ? "shipping" : "pickup";
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  if (!designId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing design" }) };
  }

  let design;
  try {
    const store = getDesignsStore();
    design = await store.get(designId, { type: "json" });
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not look up your design" }) };
  }

  if (!design) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: "That design couldn't be found — please upload it again." }) };
  }

  const price = FLAT_PRICE;
  const locationLabel = design.printLocation === "front-back" ? "Front & back" : "Front only";
  const methodLabel = design.printMethod === "dtg" ? "DTG" : "Film transfer";

  const siteUrl = `https://${event.headers.host}`;

  const payload = {
    idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    order: {
      location_id: LOCATION_ID,
      line_items: [
        {
          name: `Custom T-Shirt — ${design.size}, ${design.colorName || design.color}, ${locationLabel}, ${methodLabel}`,
          quantity: "1",
          base_price_money: { amount: Math.round(price * 100), currency: "GBP" },
        },
      ],
      note: JSON.stringify({ designId, fulfillment }),
    },
    checkout_options: {
      redirect_url: `${siteUrl}/order-confirmed.html`,
      ask_for_shipping_address: fulfillment === "shipping",
    },
  };

  try {
    const response = await fetch(`${API_BASE}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Square-Version": "2024-10-17",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.errors?.[0]?.detail || "Square declined the request" }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ url: data.payment_link.url }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not reach Square" }) };
  }
};
