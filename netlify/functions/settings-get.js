const { getBlobStore } = require("./_blobs");

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

async function getLiveSettings() {
  try {
    const store = getBlobStore("settings");
    const raw = await store.get("main", { type: "json" });
    if (raw && raw.sizes && raw.colors) return raw;
  } catch (e) {
    // fall through to defaults
  }
  return DEFAULT_SETTINGS;
}

exports.handler = async function () {
  const settings = await getLiveSettings();
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  };
};

exports.getLiveSettings = getLiveSettings;
exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
