const { getBlobStore } = require("./_blobs");
const { getTransporter, dataUrlToAttachment } = require("./_mailer");
const crypto = require("crypto");

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8MB per image, base64-decoded size

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

  const { name, email, phone, message, images } = payload;

  if (!name || !name.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "Name is required" }) };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "A valid email is required" }) };
  }
  if (!message || !message.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "Please add a short message about what you need" }) };
  }

  const imageList = Array.isArray(images) ? images.slice(0, MAX_IMAGES) : [];
  for (const img of imageList) {
    if (typeof img !== "string" || !img.startsWith("data:image/")) {
      return { statusCode: 400, body: JSON.stringify({ error: "One of the attached files isn't a valid image" }) };
    }
    const approxBytes = (img.length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) {
      return { statusCode: 400, body: JSON.stringify({ error: "One of the images is too large (max ~8MB each)" }) };
    }
  }

  const inquiryId = crypto.randomUUID();
  const record = {
    inquiryId,
    name: name.trim(),
    email: email.trim(),
    phone: phone ? phone.trim() : null,
    message: message.trim(),
    imageCount: imageList.length,
    createdAt: new Date().toISOString(),
  };

  try {
    const store = getBlobStore("inquiries");
    await store.setJSON(inquiryId, record);
    const index = (await store.get("_index", { type: "json" })) || [];
    index.unshift(inquiryId);
    await store.setJSON("_index", index);
  } catch (e) {
    // Non-fatal — still try to send the email even if storage fails
  }

  try {
    const transporter = getTransporter();
    const attachments = imageList
      .map((dataUrl, i) => dataUrlToAttachment(dataUrl, `attachment-${i + 1}.png`))
      .filter(Boolean);

    const html = `
      <h2>New bulk / wholesale enquiry</h2>
      <p><strong>Name:</strong> ${record.name}</p>
      <p><strong>Email:</strong> ${record.email}</p>
      <p><strong>Phone:</strong> ${record.phone || "—"}</p>
      <p><strong>Message:</strong></p>
      <pre>${record.message}</pre>
      <p>${imageList.length ? `${imageList.length} image(s) attached.` : "No images attached."}</p>
    `;

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.ORDER_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
      replyTo: record.email,
      subject: `Bulk enquiry from ${record.name}`,
      html,
      attachments,
    });
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not send your enquiry — please try again or email us directly." }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
