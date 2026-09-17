/* ------------------------------------------------------------------
   Public endpoint. Stores a customer's uploaded artwork — front only,
   or front and back — plus composited previews showing exactly how
   each is placed on the shirt, BEFORE payment, keyed by a generated
   design ID.

   create-checkout.js looks this up to build the order description,
   and square-webhook.js looks it up again after payment to email the
   artwork to the shop.
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

function isValidSide(side) {
  return side && typeof side.previewImage === "string" && side.original && typeof side.original.dataUrl === "string";
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

  if (event.body && event.body.length > 12 * 1024 * 1024) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: "That design is too large to upload — try a smaller PNG file." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  const { sides, color, size, printLocation, printMethod } = payload;

  if (!sides || !isValidSide(sides.front)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing front design artwork" }) };
  }
  if (printLocation === "front-back" && !isValidSide(sides.back)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing back design artwork" }) };
  }
  if (!["black", "white"].includes(color)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid colour" }) };
  }
  if (!["S", "M", "L", "XL", "XXL"].includes(size)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid size" }) };
  }
  if (!["front", "front-back"].includes(printLocation)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid print location" }) };
  }
  if (!["dtf", "dtg"].includes(printMethod)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid print method" }) };
  }

  const designId = "design" + Date.now().toString(36) + Math.floor(Math.random() * 100000).toString(36);

  const record = {
    designId,
    createdAt: new Date().toISOString(),
    color,
    size,
    printLocation,
    printMethod,
    sides: {
      front: sides.front,
      back: printLocation === "front-back" ? sides.back : null,
    },
  };

  try {
    const store = getDesignsStore();
    await store.setJSON(designId, record);
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not save design: " + err.message }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ designId }) };
};
