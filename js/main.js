/* ------------------------------------------------------------------
   Belfast Print — shirt configurator
   Canvas-space is always 480 x 600 per side (matches the SVG
   viewBox), and each side's design position/size is stored as a
   PERCENTAGE of that space, so it stays correct at any screen size.
   ------------------------------------------------------------------ */

const CANVAS_W = 480;
const CANVAS_H = 600;
const EXPORT_SCALE = 2; // composite is rendered at 2x for print clarity
const FLAT_PRICE = 20; // £ — same regardless of front/back or print method

// Canvas-space coordinates of the print-safe guide box (same for both sides).
const PRINT_AREA = { x: 140, y: 175, w: 200, h: 250 };

const state = {
  color: "white",
  size: "S",
  printLocation: "front", // "front" | "front-back"
  printMethod: "dtf", // "dtf" | "dtg"
  fulfillment: "pickup",
  activeSide: "front",
  sides: {
    front: { layer: null },
    back: { layer: null },
  },
};

const canvasWraps = {
  front: document.getElementById("canvasWrap-front"),
  back: document.getElementById("canvasWrap-back"),
};
const payBtn = document.getElementById("payBtn");
const priceValue = document.getElementById("priceValue");
const formError = document.getElementById("formError");

function pxToPct(px, axis) {
  return (px / (axis === "x" ? CANVAS_W : CANVAS_H)) * 100;
}

// Position the print-area guide box on both sides, from canvas-space constants.
["front", "back"].forEach((side) => {
  const area = canvasWraps[side].querySelector(".print-area");
  area.style.left = pxToPct(PRINT_AREA.x, "x") + "%";
  area.style.top = pxToPct(PRINT_AREA.y, "y") + "%";
  area.style.width = pxToPct(PRINT_AREA.w, "x") + "%";
  area.style.height = pxToPct(PRINT_AREA.h, "y") + "%";
});

/* ---------- Colour / size / method ---------- */

document.querySelectorAll("#colorSwatches .swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.color = btn.getAttribute("data-color");
    document.querySelectorAll("#colorSwatches .swatch").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    const fill = state.color === "black" ? "#0A0A0A" : "#FFFFFF";
    document.querySelectorAll(".shirtBody").forEach((el) => el.setAttribute("fill", fill));
  });
});

document.querySelectorAll("#sizeRow .size-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.size = btn.getAttribute("data-size");
    document.querySelectorAll("#sizeRow .size-btn").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
  });
});

document.querySelectorAll("#printMethodRow .method-option").forEach((label) => {
  label.addEventListener("click", () => {
    document.querySelectorAll("#printMethodRow .method-option").forEach((l) => l.classList.remove("is-selected"));
    label.classList.add("is-selected");
    state.printMethod = label.querySelector("input").value;
  });
});

/* ---------- Print location (front only vs front & back) ---------- */

document.querySelectorAll("#printLocationRow .fulfil-option").forEach((label) => {
  label.addEventListener("click", () => {
    document.querySelectorAll("#printLocationRow .fulfil-option").forEach((l) => l.classList.remove("is-selected"));
    label.classList.add("is-selected");
    state.printLocation = label.querySelector("input").value;

    const isBoth = state.printLocation === "front-back";
    document.getElementById("sideTabs").style.display = isBoth ? "flex" : "none";
    document.getElementById("backUploadWrap").style.display = isBoth ? "block" : "none";
    document.getElementById("uploadHeading").textContent = isBoth ? "Front design" : "Your design";

    if (!isBoth && state.activeSide === "back") {
      switchSide("front");
    }
    updatePayState();
  });
});

function switchSide(side) {
  state.activeSide = side;
  document.querySelectorAll(".side-tab").forEach((t) => t.classList.toggle("is-active", t.getAttribute("data-side") === side));
  canvasWraps.front.style.display = side === "front" ? "block" : "none";
  canvasWraps.back.style.display = side === "back" ? "block" : "none";
}
document.querySelectorAll(".side-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchSide(tab.getAttribute("data-side")));
});

/* ---------- Fulfilment ---------- */

document.querySelectorAll("#fulfilRow .fulfil-option").forEach((label) => {
  label.addEventListener("click", () => {
    document.querySelectorAll("#fulfilRow .fulfil-option").forEach((l) => l.classList.remove("is-selected"));
    label.classList.add("is-selected");
    state.fulfillment = label.querySelector("input").value;
  });
});

/* ---------- Price / pay button state ---------- */

function updatePayState() {
  priceValue.textContent = "£" + FLAT_PRICE.toFixed(2);
  const frontReady = !!state.sides.front.layer;
  const backReady = !!state.sides.back.layer;
  const needsBoth = state.printLocation === "front-back";
  const ready = frontReady && (!needsBoth || backReady);

  payBtn.disabled = !ready;
  if (!frontReady) {
    payBtn.textContent = "Upload a design to continue";
  } else if (needsBoth && !backReady) {
    payBtn.textContent = "Upload a back design to continue";
  } else {
    payBtn.textContent = "Pay with Square";
  }
}
updatePayState();

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

async function addLayer(side, file) {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

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
    file, dataUrl, img,
    x: pxToPct(xPx, "x"), y: pxToPct(yPx, "y"),
    w: pxToPct(wPx, "x"), h: pxToPct(hPx, "y"),
    aspect,
  };

  removeLayer(side); // clear any existing element first
  state.sides[side].layer = layer;
  renderLayer(side, layer);
  canvasWraps[side].querySelector(".drop-hint").style.display = "none";
  document.getElementById(`uploadSlotText-${side}`).textContent = "✓ Design uploaded — click to replace";
  document.getElementById(`removeBtn-${side}`).style.display = "inline-block";
  updatePayState();
}

function removeLayer(side) {
  const existingEl = canvasWraps[side].querySelector(".design-layer");
  if (existingEl) existingEl.remove();
  state.sides[side].layer = null;
  canvasWraps[side].querySelector(".drop-hint").style.display = "flex";
  const label = side === "front" ? "+ Upload artwork (PNG)" : "+ Upload artwork for the back (PNG)";
  document.getElementById(`uploadSlotText-${side}`).textContent = label;
  document.getElementById(`removeBtn-${side}`).style.display = "none";
  updatePayState();
}

function renderLayer(side, layer) {
  const el = document.createElement("div");
  el.className = "design-layer";
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

  canvasWraps[side].appendChild(el);
  makeDraggable(el, side, layer, handle);
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function makeDraggable(el, side, layer, handle) {
  let mode = null; // "move" | "resize"
  let startPointer = { x: 0, y: 0 };
  let startLayer = {};

  function onPointerDown(e, dragMode) {
    e.preventDefault();
    e.stopPropagation();
    mode = dragMode;
    startPointer = { x: e.clientX, y: e.clientY };
    startLayer = { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
    el.classList.add("is-active");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    const rect = canvasWraps[side].getBoundingClientRect();
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
    el.classList.remove("is-active");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.target === handle) return;
    onPointerDown(e, "move");
  });
  handle.addEventListener("pointerdown", (e) => onPointerDown(e, "resize"));
}

/* ---------- Upload inputs (click + drag-and-drop) ---------- */

["front", "back"].forEach((side) => {
  document.getElementById(`fileInput-${side}`).addEventListener("change", (e) => {
    if (e.target.files[0]) addLayer(side, e.target.files[0]);
  });
  document.getElementById(`removeBtn-${side}`).addEventListener("click", (e) => {
    e.preventDefault();
    removeLayer(side);
  });

  const wrap = canvasWraps[side];
  ["dragover", "dragleave", "drop"].forEach((evt) => {
    wrap.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === "dragover") wrap.classList.add("is-dragover");
      if (evt === "dragleave" || evt === "drop") wrap.classList.remove("is-dragover");
    });
  });
  wrap.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type === "image/png") addLayer(side, file);
  });
});

/* ---------- Compositing the final preview ---------- */

async function buildCompositePreview(side) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W * EXPORT_SCALE;
  canvas.height = CANVAS_H * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");

  const svgEl = canvasWraps[side].querySelector("svg").cloneNode(true);
  svgEl.setAttribute("width", canvas.width);
  svgEl.setAttribute("height", canvas.height);
  const svgString = new XMLSerializer().serializeToString(svgEl);
  const svgDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgString)));
  const shirtImg = await loadImage(svgDataUrl);
  ctx.drawImage(shirtImg, 0, 0, canvas.width, canvas.height);

  const layer = state.sides[side].layer;
  if (layer) {
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
  const frontReady = !!state.sides.front.layer;
  const needsBoth = state.printLocation === "front-back";
  const backReady = !!state.sides.back.layer;
  if (!frontReady || (needsBoth && !backReady)) return;

  hideError();
  payBtn.disabled = true;
  const originalText = payBtn.textContent;
  payBtn.textContent = "Preparing your design...";

  try {
    const frontPreview = await buildCompositePreview("front");
    const backPreview = needsBoth ? await buildCompositePreview("back") : null;

    const sidesPayload = {
      front: {
        previewImage: frontPreview,
        original: { filename: state.sides.front.layer.file.name, dataUrl: state.sides.front.layer.dataUrl },
      },
    };
    if (needsBoth) {
      sidesPayload.back = {
        previewImage: backPreview,
        original: { filename: state.sides.back.layer.file.name, dataUrl: state.sides.back.layer.dataUrl },
      };
    }

    const saveRes = await fetch("/api/save-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sides: sidesPayload,
        color: state.color,
        size: state.size,
        printLocation: state.printLocation,
        printMethod: state.printMethod,
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
