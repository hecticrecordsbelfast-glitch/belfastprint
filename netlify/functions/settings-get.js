/* ------------------------------------------------------------------
   Public, read-only. Returns the current size stock levels and
   available colours — either what staff have saved (in Netlify
   Blobs), or sensible starter defaults if nothing's been saved yet.
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

const DEFAULT_SETTINGS = {
  sizes: [
    { size: "S", stock: 15 },
    { size: "M", stock: 15 },
    { size: "L", stock: 15 },
    { size: "XL", stock: 15 },
    { size: "XXL", stock: 15 },
  ],
  colors: [
    { id: "white", name: "White", hex: "#FFFFFF" },
    { id: "black", name: "Black", hex: "#0A0A0A" },
  ],
};

exports.handler = async () => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    const store = getSettingsStore();
    const saved = await store.get("settings", { type: "json" });
    if (saved && Array.isArray(saved.sizes) && Array.isArray(saved.colors)) {
      return { statusCode: 200, headers, body: JSON.stringify(saved) };
    }
  } catch (err) {
    // fall through to defaults
  }

  return { statusCode: 200, headers, body: JSON.stringify(DEFAULT_SETTINGS) };
};
