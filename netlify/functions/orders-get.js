const { getBlobStore } = require("./_blobs");

exports.handler = async function (event) {
  const password = event.headers["x-admin-password"];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "Incorrect password" }) };
  }

  const store = getBlobStore("orders");
  const index = (await store.get("_index", { type: "json" })) || [];

  const orders = [];
  for (const id of index) {
    const order = await store.get(id, { type: "json" });
    if (order) orders.push(order);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orders }),
  };
};
