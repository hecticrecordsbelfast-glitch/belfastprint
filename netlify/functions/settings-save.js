const { getBlobStore } = require("./_blobs");

const VALID_SIZES = ["S", "M", "L", "XL", "XXL"];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const password = event.headers["x-admin-password"];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "Incorrect password" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { sizes, colors } = payload;

  if (!Array.isArray(sizes) || !sizes.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "Sizes are required" }) };
  }
  for (const s of sizes) {
    if (!VALID_SIZES.includes(s.size)) {
      return { statusCode: 400, body: JSON.stringify({ error: `Invalid size: ${s.size}` }) };
    }
    if (typeof s.stock !== "number" || s.stock < 0) {
      return { statusCode: 400, body: JSON.stringify({ error: `Invalid stock for ${s.size}` }) };
    }
  }

  if (!Array.isArray(colors) || !colors.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "At least one colour is required" }) };
  }
  for (const c of colors) {
    if (!c.name || !c.name.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Every colour needs a name" }) };
    }
    if (!HEX_RE.test(c.hex || "")) {
      return { statusCode: 400, body: JSON.stringify({ error: `Invalid hex for ${c.name}` }) };
    }
    if (!c.id) c.id = c.name.trim().toLowerCase().replace(/\s+/g, "-");
  }

  try {
    const store = getBlobStore("settings");
    await store.setJSON("main", { sizes, colors });
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not save settings: " + e.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
