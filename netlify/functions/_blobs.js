const { getStore } = require("@netlify/blobs");

// Shared helper for getting a Netlify Blobs store.
// Falls back to an explicit token/siteID when Netlify's automatic
// environment detection doesn't work (e.g. certain function runtimes).
function getBlobStore(name) {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}

module.exports = { getBlobStore };
