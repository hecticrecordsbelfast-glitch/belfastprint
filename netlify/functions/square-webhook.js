/* ------------------------------------------------------------------
   Square calls this automatically when a payment completes. This is
   the only reliable place to email the design and record the sale —
   a redirect back to order-confirmed.html can be closed or faked.

   Set up in Square: Developer Dashboard > your app > Webhooks >
   Add Endpoint. URL: https://yoursite.com/api/square-webhook
   Subscribe to: payment.updated
   Copy the "Signature Key" into SQUARE_WEBHOOK_SIGNATURE_KEY.

   Needs: SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT, SQUARE_LOCATION_ID,
   SQUARE_WEBHOOK_SIGNATURE_KEY, NETLIFY_BLOBS_TOKEN/SITE_ID (if
   needed), GMAIL_USER, GMAIL_APP_PASSWORD, ORDER_NOTIFICATION_EMAIL.
   See README.

   IMPORTANT: this webhook fires for every sale on your whole Square
   account, not just this site — it filters to SQUARE_LOCATION_ID.
   ------------------------------------------------------------------ */

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");
const nodemailer = require("nodemailer");

function getStoreFor(name) {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}

function money(n) {
  return n === null || n === undefined ? "—" : "£" + Number(n).toFixed(2);
}

function verifySignature(notificationUrl, body, signatureHeader, signatureKey) {
  if (!signatureHeader || !signatureKey) return false;
  const hmac = crypto.createHmac("sha256", signatureKey);
  hmac.update(notificationUrl + body);
  const expected = hmac.digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch (e) {
    return false;
  }
}

function dataUrlToAttachment(dataUrl, filename) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return { filename, content: Buffer.from(match[2], "base64"), contentType: match[1] };
}

async function sendOrderEmail(orderRecord, design) {
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const NOTIFY_TO = process.env.ORDER_NOTIFICATION_EMAIL;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_TO) {
    return { sent: false, reason: "Email isn't configured (missing GMAIL_USER, GMAIL_APP_PASSWORD, or ORDER_NOTIFICATION_EMAIL)." };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const attachments = [];
  if (design.sides.front) {
    const frontPreview = dataUrlToAttachment(design.sides.front.previewImage, "front-preview.png");
    if (frontPreview) attachments.push(frontPreview);
    const frontOriginal = dataUrlToAttachment(design.sides.front.original.dataUrl, design.sides.front.original.filename || "front-design.png");
    if (frontOriginal) attachments.push(frontOriginal);
  }
  if (design.sides.back) {
    const backPreview = dataUrlToAttachment(design.sides.back.previewImage, "back-preview.png");
    if (backPreview) attachments.push(backPreview);
    const backOriginal = dataUrlToAttachment(design.sides.back.original.dataUrl, design.sides.back.original.filename || "back-design.png");
    if (backOriginal) attachments.push(backOriginal);
  }

  const addressLines = orderRecord.shippingAddress
    ? [
        orderRecord.shippingAddress.line1,
        orderRecord.shippingAddress.line2,
        orderRecord.shippingAddress.city,
        orderRecord.shippingAddress.postcode,
        orderRecord.shippingAddress.country,
      ].filter(Boolean).join("\n  ")
    : "No shipping address given (collecting in store, or not requested).";

  const bodyText = `New custom t-shirt order — ${money(orderRecord.totalMoney)}

Size: ${design.size}
Colour: ${design.colorName || design.color}
Print location: ${design.printLocation === "front-back" ? "Front & back" : "Front only"}
Print method: ${design.printMethod === "dtg" ? "Direct to garment (DTG)" : "Film transfer (DTF)"}
Fulfilment: ${orderRecord.fulfillment === "shipping" ? "Post to customer" : "Collect from Drip, 49 Rosemary St, Belfast"}

Buyer:
  Name: ${orderRecord.recipientName || "Not given"}
  Email: ${orderRecord.buyerEmail || "Not given"}
  Phone: ${orderRecord.recipientPhone || "Not given"}

Shipping address:
  ${addressLines}

Shirt preview(s) (with design placement) and original artwork file(s) are attached.

Order ID: ${orderRecord.orderId}
`;

  try {
    await transporter.sendMail({
      from: `"Belfast Print" <${GMAIL_USER}>`,
      to: NOTIFY_TO,
      subject: `New t-shirt order — ${money(orderRecord.totalMoney)}`,
      text: bodyText,
      attachments,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

exports.handler = async (event) => {
  const SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const API_BASE = ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SIGNATURE_KEY || !ACCESS_TOKEN) {
    return { statusCode: 200, body: "Webhook not configured yet" };
  }

  const notificationUrl = `https://${event.headers.host}/api/square-webhook`;
  const signatureHeader = event.headers["x-square-hmacsha256-signature"] || event.headers["X-Square-Hmacsha256-Signature"];

  if (!verifySignature(notificationUrl, event.body, signatureHeader, SIGNATURE_KEY)) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Bad payload" };
  }

  if (payload.type !== "payment.updated" || payload.data?.object?.payment?.status !== "COMPLETED") {
    return { statusCode: 200, body: "Ignored (not a completed payment)" };
  }

  // This webhook fires for every sale on your whole Square account —
  // only act on sales belonging to this site's own location.
  const OWN_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  const paymentLocationId = payload.data.object.payment.location_id;
  if (OWN_LOCATION_ID && paymentLocationId && paymentLocationId !== OWN_LOCATION_ID) {
    return { statusCode: 200, body: "Ignored (different location)" };
  }

  const payment = payload.data.object.payment;
  const orderId = payment.order_id;
  if (!orderId) {
    return { statusCode: 200, body: "No order_id on payment" };
  }

  const ordersStore = getStoreFor("belfastprint-orders");

  const existing = await ordersStore.get(orderId, { type: "json" }).catch(() => null);
  if (existing) {
    return { statusCode: 200, body: "Already processed" };
  }

  let order;
  try {
    const orderRes = await fetch(`${API_BASE}/v2/orders/${orderId}`, {
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}`, "Square-Version": "2024-10-17" },
    });
    const orderData = await orderRes.json();
    order = orderData.order;
  } catch (err) {
    return { statusCode: 500, body: "Could not fetch order details" };
  }

  if (!order) {
    return { statusCode: 200, body: "Order not found" };
  }

  let noteData = {};
  try {
    noteData = JSON.parse(order.note || "{}");
  } catch (e) {
    // leave empty
  }

  const designsStore = getStoreFor("belfastprint-designs");
  const design = noteData.designId ? await designsStore.get(noteData.designId, { type: "json" }).catch(() => null) : null;

  if (!design) {
    return { statusCode: 200, body: "Design not found for this order" };
  }

  const fulfillment = (order.fulfillments || [])[0];
  const recipient = fulfillment?.shipment_details?.recipient;

  const orderRecord = {
    orderId,
    paymentId: payment.id,
    date: new Date().toISOString(),
    totalMoney: order.total_money ? order.total_money.amount / 100 : null,
    currency: order.total_money ? order.total_money.currency : "GBP",
    fulfillment: noteData.fulfillment || "pickup",
    buyerEmail: payment.buyer_email_address || null,
    recipientName: recipient?.display_name || null,
    recipientPhone: recipient?.phone_number || null,
    shippingAddress: recipient?.address
      ? {
          line1: recipient.address.address_line_1 || "",
          line2: recipient.address.address_line_2 || "",
          city: recipient.address.locality || "",
          postcode: recipient.address.postal_code || "",
          country: recipient.address.country || "",
        }
      : null,
    designId: noteData.designId,
    frontPreview: design.sides.front ? design.sides.front.previewImage : null,
    backPreview: design.sides.back ? design.sides.back.previewImage : null,
    size: design.size,
    color: design.color,
    colorName: design.colorName,
    printLocation: design.printLocation,
    printMethod: design.printMethod,
    fulfilled: false,
  };

  // Decrement stock for the size that was ordered.
  try {
    const settingsStore = getStoreFor("belfastprint-settings");
    const settings = await settingsStore.get("settings", { type: "json" }).catch(() => null);
    if (settings && Array.isArray(settings.sizes)) {
      const sizeEntry = settings.sizes.find((s) => s.size === design.size);
      if (sizeEntry) {
        sizeEntry.stock = Math.max(0, sizeEntry.stock - 1);
        await settingsStore.setJSON("settings", settings);
      }
    }
  } catch (err) {
    orderRecord.stockUpdateError = err.message;
  }

  await ordersStore.setJSON(orderId, orderRecord);

  try {
    const index = (await ordersStore.get("_index", { type: "json" }).catch(() => null)) || { orderIds: [] };
    index.orderIds.unshift(orderId);
    await ordersStore.setJSON("_index", index);
  } catch (err) {
    // non-fatal
  }

  const emailResult = await sendOrderEmail(orderRecord, design).catch((err) => ({ sent: false, reason: err.message }));

  return { statusCode: 200, body: emailResult.sent ? "OK" : `OK (email not sent: ${emailResult.reason})` };
};
