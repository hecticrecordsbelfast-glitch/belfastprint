const { getBlobStore } = require("./_blobs");

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

  const { orderId, fulfilled } = payload;
  if (!orderId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing orderId" }) };
  }

  const store = getBlobStore("orders");
  const order = await store.get(orderId, { type: "json" });
  if (!order) {
    return { statusCode: 404, body: JSON.stringify({ error: "Order not found" }) };
  }

  order.fulfilled = !!fulfilled;
  await store.setJSON(orderId, order);

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
