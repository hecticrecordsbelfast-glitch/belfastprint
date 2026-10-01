/* ------------------------------------------------------------------
   Public endpoint for the bulk/wholesale enquiry form (wholesale.html).
   Emails the enquiry + any attached reference images straight to
   ORDER_NOTIFICATION_EMAIL, and keeps a copy in Blobs in case a staff
   list page is wanted later.

   Needs: GMAIL_USER, GMAIL_APP_PASSWORD, ORDER_NOTIFICATION_EMAIL,
   NETLIFY_BLOBS_TOKEN/SITE_ID if your site needs manual Blobs config.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");
const nodemailer = require("nodemailer");

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8MB per image, decoded

function getInquiriesStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name: "belfastprint-inquiries", siteID, token });
  }
  return getStore("belfastprint-inquiries");
}

function dataUrlToAttachment(dataUrl, filename) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return { filename, content: Buffer.from(match[2], "base64"), contentType: match[1] };
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

  if (event.body && event.body.length > 40 * 1024 * 1024) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: "That's too much to attach at once — try fewer or smaller images." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  const { name, email, phone, message, images } = payload;

  if (!name || !name.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Name is required" }) };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "A valid email is required" }) };
  }
  if (!message || !message.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Please add a short message about what you need" }) };
  }

  const imageList = Array.isArray(images) ? images.slice(0, MAX_IMAGES) : [];
  for (const img of imageList) {
    if (typeof img !== "string" || !img.startsWith("data:image/")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "One of the attached files isn't a valid image" }) };
    }
    if ((img.length * 3) / 4 > MAX_IMAGE_BYTES) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "One of the images is too large (max ~8MB each)" }) };
    }
  }

  const inquiryId = "inq" + Date.now().toString(36) + Math.floor(Math.random() * 100000).toString(36);
  const record = {
    inquiryId,
    createdAt: new Date().toISOString(),
    name: name.trim(),
    email: email.trim(),
    phone: phone ? phone.trim() : null,
    message: message.trim(),
    imageCount: imageList.length,
  };

  try {
    const store = getInquiriesStore();
    await store.setJSON(inquiryId, record);
  } catch (err) {
    // Non-fatal — still try to send the email even if storage fails.
  }

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const NOTIFY_TO = process.env.ORDER_NOTIFICATION_EMAIL;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_TO) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Enquiries aren't fully set up yet — please email us directly for now." }) };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    const attachments = imageList
      .map((dataUrl, i) => dataUrlToAttachment(dataUrl, `attachment-${i + 1}.png`))
      .filter(Boolean);

    const bodyText = `New bulk / wholesale enquiry

Name: ${record.name}
Email: ${record.email}
Phone: ${record.phone || "Not given"}

Message:
${record.message}

${imageList.length ? `${imageList.length} image(s) attached.` : "No images attached."}
`;

    await transporter.sendMail({
      from: `"Belfast Print" <${GMAIL_USER}>`,
      to: NOTIFY_TO,
      replyTo: record.email,
      subject: `Bulk enquiry from ${record.name}`,
      text: bodyText,
      attachments,
    });
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not send your enquiry — please try again or email us directly." }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
