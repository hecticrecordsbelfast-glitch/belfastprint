const { getBlobStore } = require("./_blobs");
const { getLiveSettings } = require("./settings-get");
const crypto = require("crypto");

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

  const { color, size, printLocation, printMethod, fulfillment, sides } = payload;

  if (!sides || !sides.front || !sides.front.artwork) {
    return { statusCode: 400, body: JSON.stringify({ error: "A front design is required" }) };
  }
  if (printLocation === "front-back" && (!sides.back || !sides.back.artwork)) {
    return { statusCode: 400, body: JSON.stringify({ error: "A back design is required for front & back printing" }) };
  }
  if (!["dtf", "dtg"].includes(printMethod)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid print method" }) };
  }
  if (!["pickup", "shipping"].includes(fulfillment)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid fulfilment option" }) };
  }

  const settings = await getLiveSettings();
  const colorMatch = settings.colors.find((c) => c.id === color);
  if (!colorMatch) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid colour selected" }) };
  }
  const sizeMatch = settings.sizes.find((s) => s.size === size);
  if (!sizeMatch) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid size selected" }) };
  }
  if ((sizeMatch.stock || 0) <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: `${size} is currently sold out` }) };
  }

  const designId = crypto.randomUUID();
  const record = {
    designId,
    color,
    colorName: colorMatch.name,
    size,
    printLocation,
    printMethod,
    fulfillment,
    sides: {
      front: sides.front,
      back: sides.back || null,
    },
    createdAt: new Date().toISOString(),
  };

  try {
    const store = getBlobStore("designs");
    await store.setJSON(designId, record);
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not save your design: " + e.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ designId }) };
};
