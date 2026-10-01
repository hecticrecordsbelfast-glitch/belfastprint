const { getBlobStore } = require("./_blobs");

const FLAT_PRICE = 20; // GBP, flat regardless of front/back or print method

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { designId, fulfillment } = payload;
  if (!designId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing designId" }) };
  }

  const store = getBlobStore("designs");
  const design = await store.get(designId, { type: "json" });
  if (!design) {
    return { statusCode: 404, body: JSON.stringify({ error: "Design not found" }) };
  }

  const locationLabel = design.printLocation === "front-back" ? "Front & back" : "Front only";
  const methodLabel = design.printMethod === "dtg" ? "DTG" : "Film transfer";
  const itemName = `Custom T-Shirt — ${design.size}, ${design.colorName || design.color}, ${locationLabel}, ${methodLabel}`;

  const environment = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const baseUrl = environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";

  const siteUrl = process.env.URL || "https://example.netlify.app";

  const body = {
    idempotency_key: `${designId}-${Date.now()}`,
    order: {
      order: {
        location_id: process.env.SQUARE_LOCATION_ID,
        note: JSON.stringify({ designId, fulfillment }).slice(0, 500),
        line_items: [
          {
            name: itemName,
            quantity: "1",
            base_price_money: { amount: FLAT_PRICE * 100, currency: "GBP" },
          },
        ],
      },
    },
    checkout_options: {
      ask_for_shipping_address: fulfillment === "shipping",
      redirect_url: `${siteUrl}/order-confirmed.html`,
    },
  };

  try {
    const res = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Square-Version": "2024-01-18",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: data.errors ? data.errors[0].detail : "Square checkout failed" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ checkoutUrl: data.payment_link.url }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not reach Square: " + e.message }) };
  }
};
