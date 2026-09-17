/* ------------------------------------------------------------------
   Belfast Print — shirt configurator
   Canvas-space is always 480 x 600 (matches the SVG viewBox), and
   every layer's position/size is stored as a PERCENTAGE of that
   space, so it stays correct at any screen size.
   ------------------------------------------------------------------ */

const CANVAS_W = 480;
const CANVAS_H = 600;
const EXPORT_SCALE = 2; // composite is rendered at 2x for print clarity

// Canvas-space coordinates of the print-safe guide box.
const PRINT_AREA = { x: 140, y: 175, w: 200, h: 250 };

const state = {
  color: "white",
  size: "S",
  fulfillment: "pickup",
  layers: [], // { id, file, dataUrl, img, x, y, w, h } — x/y/w/h are % of canvas
};

const canvasWrap = document.getElementById("canvasWrap");
const shirtBody = document.getElementById("shirtBody");
const printArea = document.getElementById("printArea");
const dropHint = document.getElementById("dropHint");
const payBtn = document.getElementById("payBtn");
const priceValue = document.getElementById("priceValue");
const formError = document.getElementById("formError");

function pxToPct(px, axis) {
  return (px / (axis === "x" ? CANVAS_W : CANVAS_H)) * 100;
}

// Position the print-area guide box once, from canvas-space constants.
printArea.style.left = pxToPct(PRINT_AREA.x, "x") + "%";
printArea.style.top = pxToPct(PRINT_AREA.y, "y") + "%";
printArea.style.width = pxToPct(PRINT_AREA.w, "x") + "%";
printArea.style.height = pxToPct(PRINT_AREA.h, "y") + "%";

/* ---------- Colour + size ---------- */

document.querySelectorAll("#colorSwatches .swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.color = btn.getAttribute("data-color");
    document.querySelectorAll("#colorSwatches .swatch").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    shirtBody.setAttribute("fill", state.color === "black" ? "#0A0A0A" : "#FFFFFF");
  });
});

document.querySelectorAll("#sizeRow .size-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.size = btn.getAttribute("data-size");
    document.querySelectorAll("#sizeRow .size-btn").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
  });
});

/* ---------- Fulfilment ---------- */

document.querySelectorAll("#fulfilRow .fulfil-option").forEach((label) => {
  label.addEventListener("click", () => {
    document.querySelectorAll("#fulfilRow .fulfil-option").forEach((l) => l.classList.remove("is-selected"));
    label.classList.add("is-selected");
    state.fulfillment = label.querySelector("input").value;
  });
});

/* ---------- Price ---------- */

function updatePrice() {
  const price = state.layers.length >= 2 ? 25 : 20;
  priceValue.textContent = "£" + price.toFixed(2);
  const hasDesign = state.layers.length > 0;
  payBtn.disabled = !hasDesign;
  payBtn.textContent = hasDesign ? "Pay with Square" : "Upload a design to continue";
  return price;
}
updatePrice();

/* ---------- Uploading & layers ---------- */

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function addLayer(file) {
  if (state.layers.length >= 2) return;
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  // Default size: fit inside the print area, keeping aspect ratio.
  const aspect = img.naturalWidth / img.naturalHeight;
  let wPx = PRINT_AREA.w * 0.9;
  let hPx = wPx / aspect;
  if (hPx > PRINT_AREA.h * 0.9) {
    hPx = PRINT_AREA.h * 0.9;
    wPx = hPx * aspect;
  }
  const xPx = PRINT_AREA.x + (PRINT_AREA.w - wPx) / 2;
  const yPx = PRINT_AREA.y + (PRINT_AREA.h - hPx) / 2;

  const layer = {
    id: "layer" + Date.now() + Math.floor(Math.random() * 1000),
    file, dataUrl, img,
    x: pxToPct(xPx, "x"), y: pxToPct(yPx, "y"),
    w: pxToPct(wPx, "x"), h: pxToPct(hPx, "y"),
    aspect,
  };
  state.layers.push(layer);
  renderLayer(layer);
  dropHint.style.display = "none";
  updatePrice();
  refreshUploadSlots();
}

function removeLayer(id) {
  state.layers = state.layers.filter((l) => l.id !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  if (state.layers.length === 0) dropHint.style.display = "flex";
  updatePrice();
  refreshUploadSlots();
}

function renderLayer(layer) {
  const el = document.createElement("div");
  el.className = "design-layer";
  el.id = layer.id;
  el.style.left = layer.x + "%";
  el.style.top = layer.y + "%";
  el.style.width = layer.w + "%";
  el.style.height = layer.h + "%";

  const img = document.createElement("img");
  img.src = layer.dataUrl;
  img.alt = "";
  el.appendChild(img);

  const handle = document.createElement("div");
  handle.className = "design-layer__handle";
  el.appendChild(handle);

  canvasWrap.appendChild(el);
  makeDraggable(el, layer, handle);
}

function makeDraggable(el, layer, handle) {
  let mode = null; // "move" | "resize"
  let startPointer = { x: 0, y: 0 };
  let startLayer = {};

  function onPointerDown(e, dragMode) {
    e.preventDefault();
    e.stopPropagation();
    mode = dragMode;
    startPointer = { x: e.clientX, y: e.clientY };
    startLayer = { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
    document.querySelectorAll(".design-layer").forEach((l) => l.classList.remove("is-active"));
    el.classList.add("is-active");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    const rect = canvasWrap.getBoundingClientRect();
    const dxPct = ((e.clientX - startPointer.x) / rect.width) * 100;
    const dyPct = ((e.clientY - startPointer.y) / rect.height) * 100;

    if (mode === "move") {
      layer.x = clamp(startLayer.x + dxPct, -layer.w * 0.3, 100 - layer.w * 0.7);
      layer.y = clamp(startLayer.y + dyPct, -layer.h * 0.3, 100 - layer.h * 0.7);
      el.style.left = layer.x + "%";
      el.style.top = layer.y + "%";
    } else if (mode === "resize") {
      const dxPx = ((e.clientX - startPointer.x) / rect.width) * CANVAS_W;
      let newWPx = (startLayer.w / 100) * CANVAS_W + dxPx;
      newWPx = clamp(newWPx, 30, CANVAS_W);
      const newHPx = newWPx / layer.aspect;
      layer.w = pxToPct(newWPx, "x");
      layer.h = pxToPct(newHPx, "y");
      el.style.width = layer.w + "%";
      el.style.height = layer.h + "%";
    }
  }

  function onPointerUp() {
    mode = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.target === handle) return;
    onPointerDown(e, "move");
  });
  handle.addEventListener("pointerdown", (e) => onPointerDown(e, "resize"));
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/* ---------- Upload slots (click + drag-and-drop) ---------- */

function refreshUploadSlots() {
  const slot1Text = document.getElementById("uploadSlot1Text");
  const slot2Wrap = document.getElementById("secondUploadWrap");
  const addSecondBtn = document.getElementById("addSecondBtn");

  slot1Text.textContent = state.layers[0] ? "✓ Design 1 uploaded — click to replace" : "+ Upload artwork (PNG)";

  if (state.layers.length >= 1 && slot2Wrap.style.display === "none" && state.layers.length < 2) {
    // leave second slot hidden until "add second" is clicked
  }
  if (state.layers[1]) {
    document.getElementById("uploadSlot2Text").textContent = "✓ Design 2 uploaded — click to replace";
    addSecondBtn.style.display = "none";
  }
}

document.getElementById("fileInput1").addEventListener("change", (e) => {
  if (e.target.files[0]) {
    if (state.layers[0]) removeLayer(state.layers[0].id);
    addLayer(e.target.files[0]);
  }
});
document.getElementById("fileInput2").addEventListener("change", (e) => {
  if (e.target.files[0]) {
    if (state.layers[1]) removeLayer(state.layers[1].id);
    addLayer(e.target.files[0]);
  }
});

document.getElementById("addSecondBtn").addEventListener("click", () => {
  document.getElementById("secondUploadWrap").style.display = "block";
  document.getElementById("addSecondBtn").style.display = "none";
});
document.getElementById("removeSecondBtn").addEventListener("click", () => {
  if (state.layers[1]) removeLayer(state.layers[1].id);
  document.getElementById("secondUploadWrap").style.display = "none";
  document.getElementById("addSecondBtn").style.display = "block";
});

["dragover", "dragleave", "drop"].forEach((evt) => {
  canvasWrap.addEventListener(evt, (e) => {
    e.preventDefault();
    if (evt === "dragover") canvasWrap.classList.add("is-dragover");
    if (evt === "dragleave" || evt === "drop") canvasWrap.classList.remove("is-dragover");
  });
});
canvasWrap.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file && file.type === "image/png") {
    if (state.layers.length < 2) {
      addLayer(file);
    } else {
      removeLayer(state.layers[0].id);
      addLayer(file);
    }
  }
});

/* ---------- Compositing the final preview ---------- */

async function buildCompositePreview() {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W * EXPORT_SCALE;
  canvas.height = CANVAS_H * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");

  const svgEl = canvasWrap.querySelector("svg").cloneNode(true);
  svgEl.setAttribute("width", canvas.width);
  svgEl.setAttribute("height", canvas.height);
  const svgString = new XMLSerializer().serializeToString(svgEl);
  const svgDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgString)));
  const shirtImg = await loadImage(svgDataUrl);
  ctx.drawImage(shirtImg, 0, 0, canvas.width, canvas.height);

  for (const layer of state.layers) {
    const x = (layer.x / 100) * canvas.width;
    const y = (layer.y / 100) * canvas.height;
    const w = (layer.w / 100) * canvas.width;
    const h = (layer.h / 100) * canvas.height;
    ctx.drawImage(layer.img, x, y, w, h);
  }

  return canvas.toDataURL("image/png");
}

/* ---------- Checkout ---------- */

function showError(message) {
  formError.textContent = message;
  formError.classList.add("is-visible");
}
function hideError() {
  formError.classList.remove("is-visible");
}

payBtn.addEventListener("click", async () => {
  if (state.layers.length === 0) return;
  hideError();
  payBtn.disabled = true;
  const originalText = payBtn.textContent;
  payBtn.textContent = "Preparing your design...";

  try {
    const previewImage = await buildCompositePreview();
    const originals = state.layers.map((l) => ({ filename: l.file.name, dataUrl: l.dataUrl }));

    const saveRes = await fetch("/api/save-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previewImage,
        originals,
        color: state.color,
        size: state.size,
        numDesigns: state.layers.length,
      }),
    });
    const saveData = await saveRes.json();
    if (!saveRes.ok || !saveData.designId) throw new Error(saveData.error || "Could not save your design");

    payBtn.textContent = "Redirecting to Square...";
    const checkoutRes = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        designId: saveData.designId,
        fulfillment: state.fulfillment,
      }),
    });
    const checkoutData = await checkoutRes.json();
    if (!checkoutRes.ok || !checkoutData.url) throw new Error(checkoutData.error || "Could not start checkout");

    window.location.href = checkoutData.url;
  } catch (err) {
    showError(err.message);
    payBtn.disabled = false;
    payBtn.textContent = originalText;
  }
});
