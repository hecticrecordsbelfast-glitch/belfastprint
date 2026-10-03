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

function getSettingsStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name: "belfastprint-settings", siteID, token });
  }
  return getStore("belfastprint-settings");
}

const DEFAULT_SETTINGS = {
  sizes: [
    { size: "S", stock: 15 }, { size: "M", stock: 15 }, { size: "L", stock: 15 },
    { size: "XL", stock: 15 }, { size: "XXL", stock: 15 },
  ],
  colors: [
    { id: "white", name: "White", hex: "#FFFFFF" },
    { id: "black", name: "Black", hex: "#0A0A0A" },
  ],
};

async function getLiveSettings() {
  try {
    const store = getSettingsStore();
    const saved = await store.get("settings", { type: "json" });
    if (saved && Array.isArray(saved.sizes) && Array.isArray(saved.colors)) return saved;
  } catch (err) {
    // fall through to defaults
  }
  return DEFAULT_SETTINGS;
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

  const settings = await getLiveSettings();
  const colorEntry = settings.colors.find((c) => c.id === color);
  if (!colorEntry) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "That colour isn't available right now — please refresh and pick another." }) };
  }
  const sizeEntry = settings.sizes.find((s) => s.size === size);
  if (!sizeEntry) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid size" }) };
  }
  if (sizeEntry.stock <= 0) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: `Sorry, size ${size} just sold out — please pick another size.` }) };
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
    colorName: colorEntry.name,
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
