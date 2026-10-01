const crypto = require("crypto");
const { getBlobStore } = require("./_blobs");
const { getTransporter, dataUrlToAttachment } = require("./_mailer");

function verifySignature(body, signatureHeader, notificationUrl) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) return false;
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(notificationUrl + body);
  const expected = hmac.digest("base64");
  return expected === signatureHeader;
}

async function sendOrderEmail(orderRecord, design) {
  const transporter = getTransporter();
  const attachments = [];

  const frontPreview = dataUrlToAttachment(orderRecord.frontPreview, "front-preview.png");
  if (frontPreview) attachments.push(frontPreview);
  const backPreview = dataUrlToAttachment(orderRecord.backPreview, "back-preview.png");
  if (backPreview) attachments.push(backPreview);

  const frontArt = dataUrlToAttachment(design?.sides?.front?.artwork, "front-artwork.png");
  if (frontArt) attachments.push(frontArt);
  const backArt = dataUrlToAttachment(design?.sides?.back?.artwork, "back-artwork.png");
  if (backArt) attachments.push(backArt);

  const locationLabel = orderRecord.printLocation === "front-back" ? "Front & back" : "Front only";
  const methodLabel = orderRecord.printMethod === "dtg" ? "DTG" : "Film transfer";

  const addressBlock = orderRecord.shippingAddress
    ? `
Shipping address:
${orderRecord.shippingAddress}`
    : "Collection in store (Drip, 49 Rosemary Street, Belfast)";

  const html = `
    <h2>New Belfast Print order</h2>
    <p><strong>Order ID:</strong> ${orderRecord.orderId}</p>
    <p><strong>Size:</strong> ${orderRecord.size} &nbsp; <strong>Colour:</strong> ${orderRecord.colorName}</p>
    <p><strong>Print location:</strong> ${locationLabel} &nbsp; <strong>Method:</strong> ${methodLabel}</p>
    <p><strong>Fulfilment:</strong> ${orderRecord.fulfillment === "shipping" ? "Ship to customer" : "Collect in store"}</p>
    <p><strong>Buyer:</strong> ${orderRecord.buyerName || "—"} (${orderRecord.buyerEmail || "—"}) ${orderRecord.buyerPhone || ""}</p>
    <pre>${addressBlock}</pre>
  `;

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.ORDER_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
    subject: `New order — ${orderRecord.size} ${orderRecord.colorName} shirt`,
    html,
    attachments,
  });
}

exports.handler = async function (event) {
  const signature = event.headers["x-square-hmacsha256-signature"] || event.headers["x-square-signature"];
  const notificationUrl = `${process.env.URL}/.netlify/functions/square-webhook`;

  if (!verifySignature(event.body, signature, notificationUrl)) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (payload.type !== "payment.updated") {
    return { statusCode: 200, body: "Ignored (not a payment event)" };
  }

  const payment = payload.data.object.payment;
  if (payment.status !== "COMPLETED") {
    return { statusCode: 200, body: "Ignored (payment not completed)" };
  }

  const OWN_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  if (OWN_LOCATION_ID && payment.location_id && payment.location_id !== OWN_LOCATION_ID) {
    return { statusCode: 200, body: "Ignored (different location)" };
  }

  // Fetch the full order to read our note (designId, fulfillment) and buyer details
  const environment = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const baseUrl = environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";

  let order = null;
  try {
    const orderRes = await fetch(`${baseUrl}/v2/orders/${payment.order_id}`, {
      headers: {
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Square-Version": "2024-01-18",
      },
    });
    const orderData = await orderRes.json();
    order = orderData.order;
  } catch (e) {
    return { statusCode: 500, body: "Could not fetch order from Square" };
  }

  let note = {};
  try {
    note = JSON.parse(order?.note || "{}");
  } catch (e) {
    note = {};
  }
  const { designId, fulfillment } = note;
  if (!designId) {
    return { statusCode: 200, body: "No designId in order note — ignoring" };
  }

  const designsStore = getBlobStore("designs");
  const design = await designsStore.get(designId, { type: "json" });
  if (!design) {
    return { statusCode: 200, body: "Design not found for this order" };
  }

  const fulfillmentRecipient = order?.fulfillments?.[0]?.shipment_details?.recipient;
  const shippingAddress = fulfillmentRecipient?.address
    ? [
        fulfillmentRecipient.address.address_line_1,
        fulfillmentRecipient.address.address_line_2,
        fulfillmentRecipient.address.locality,
        fulfillmentRecipient.address.postal_code,
        fulfillmentRecipient.address.country,
      ].filter(Boolean).join(", ")
    : null;

  const orderRecord = {
    orderId: payment.order_id,
    designId,
    frontPreview: design.sides.front.preview,
    backPreview: design.sides.back ? design.sides.back.preview : null,
    size: design.size,
    color: design.color,
    colorName: design.colorName,
    printLocation: design.printLocation,
    printMethod: design.printMethod,
    fulfillment: fulfillment || design.fulfillment,
    buyerName: fulfillmentRecipient?.display_name || null,
    buyerEmail: fulfillmentRecipient?.email_address || null,
    buyerPhone: fulfillmentRecipient?.phone_number || null,
    shippingAddress,
    fulfilled: false,
    createdAt: new Date().toISOString(),
  };

  try {
    const ordersStore = getBlobStore("orders");
    await ordersStore.setJSON(orderRecord.orderId, orderRecord);

    const indexRaw = (await ordersStore.get("_index", { type: "json" })) || [];
    if (!indexRaw.includes(orderRecord.orderId)) {
      indexRaw.unshift(orderRecord.orderId);
      await ordersStore.setJSON("_index", indexRaw);
    }
  } catch (e) {
    // continue — we still want to try sending the email
  }

  // Decrement stock
  try {
    const { getLiveSettings } = require("./settings-get");
    const settings = await getLiveSettings();
    const sizeEntry = settings.sizes.find((s) => s.size === design.size);
    if (sizeEntry) {
      sizeEntry.stock = Math.max(0, (sizeEntry.stock || 0) - 1);
      const settingsStore = getBlobStore("settings");
      await settingsStore.setJSON("main", settings);
    }
  } catch (e) {
    // non-fatal
  }

  try {
    await sendOrderEmail(orderRecord, design);
  } catch (e) {
    return { statusCode: 200, body: "Order saved but email failed: " + e.message };
  }

  return { statusCode: 200, body: "OK" };
};
