/* ------------------------------------------------------------------
   Password-protected. Saves size stock levels and available colours
   from admin.html, so changes are live on the site immediately.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");

function getSettingsStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name: "belfastprint-settings", siteID, token });
  }
  return getStore("belfastprint-settings");
}

const VALID_SIZES = ["S", "M", "L", "XL", "XXL"];

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const suppliedPassword = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  if (!ADMIN_PASSWORD || suppliedPassword !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Wrong password" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  const { sizes, colors } = payload;

  if (!Array.isArray(sizes) || sizes.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing sizes" }) };
  }
  for (const s of sizes) {
    if (!VALID_SIZES.includes(s.size) || typeof s.stock !== "number" || s.stock < 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid stock entry for "${s.size}"` }) };
    }
  }

  if (!Array.isArray(colors) || colors.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Add at least one colour" }) };
  }
  for (const c of colors) {
    if (!c.id || !c.name || !/^#[0-9A-Fa-f]{6}$/.test(c.hex || "")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid colour entry for "${c.name || c.id || "an unnamed colour"}"` }) };
    }
  }

  try {
    const store = getSettingsStore();
    await store.setJSON("settings", { sizes, colors });
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not save: " + err.message }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
