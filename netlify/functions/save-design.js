/* ------------------------------------------------------------------
   Public endpoint. Stores a customer's uploaded artwork (the original
   file(s) plus a composited preview showing exactly how it's placed
   on the shirt) BEFORE payment, keyed by a generated design ID.

   create-checkout.js looks this up to work out the price (based on
   how many designs were uploaded) and to attach the design ID to the
   Square order, so square-webhook.js can find the artwork again once
   payment completes and email it to the shop.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");

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
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (event.body && event.body.length > 8 * 1024 * 1024) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: "That design is too large to upload — try a smaller PNG file." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  const { previewImage, originals, color, size, numDesigns } = payload;

  if (!previewImage || !Array.isArray(originals) || originals.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing design artwork" }) };
  }
  if (!["black", "white"].includes(color)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid colour" }) };
  }
  if (!["S", "M", "L", "XL", "XXL"].includes(size)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid size" }) };
  }

  const designId = "design" + Date.now().toString(36) + Math.floor(Math.random() * 100000).toString(36);

  const record = {
    designId,
    createdAt: new Date().toISOString(),
    previewImage,
    originals: originals.slice(0, 2),
    color,
    size,
    numDesigns: Math.min(2, Math.max(1, parseInt(numDesigns, 10) || originals.length)),
  };

  try {
    const store = getDesignsStore();
    await store.setJSON(designId, record);
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not save design: " + err.message }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ designId }) };
};
