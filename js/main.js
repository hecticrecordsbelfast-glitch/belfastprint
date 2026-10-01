(function () {
  "use strict";

  const CANVAS_W = 480;
  const CANVAS_H = 440;
  const EXPORT_SCALE = 2;
  const FLAT_PRICE = 20; // flat price regardless of front/back or method
  const PRINT_AREA = { x: 170, y: 190, w: 140, h: 170 };

  const DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL"];

  const state = {
    color: null,
    size: null,
    printLocation: "front", // "front" | "front-back"
    printMethod: "dtf", // "dtf" | "dtg"
    fulfillment: "pickup",
    activeSide: "front",
    sides: {
      front: { layer: null, file: null },
      back: { layer: null, file: null },
    },
  };

  let SIZES = [];
  let COLORS = [];

  const el = (id) => document.getElementById(id);

  function placePrintGuide(side) {
    const guide = el(`printGuide-${side}`);
    if (!guide) return;
    guide.style.left = (PRINT_AREA.x / CANVAS_W) * 100 + "%";
    guide.style.top = (PRINT_AREA.y / CANVAS_H) * 100 + "%";
    guide.style.width = (PRINT_AREA.w / CANVAS_W) * 100 + "%";
    guide.style.height = (PRINT_AREA.h / CANVAS_H) * 100 + "%";
  }

  // ---------- Settings (sizes/colors) ----------
  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      SIZES = data.sizes && data.sizes.length ? data.sizes : DEFAULT_SIZES.map((s) => ({ size: s, stock: 15 }));
      COLORS = data.colors && data.colors.length ? data.colors : [
        { id: "white", name: "White", hex: "#FFFFFF" },
        { id: "black", name: "Black", hex: "#0A0A0A" },
      ];
    } catch (e) {
      SIZES = DEFAULT_SIZES.map((s) => ({ size: s, stock: 15 }));
      COLORS = [
        { id: "white", name: "White", hex: "#FFFFFF" },
        { id: "black", name: "Black", hex: "#0A0A0A" },
      ];
    }
    renderColorSwatches();
    renderSizeButtons();
  }

  function renderColorSwatches() {
    const wrap = el("colorSwatches");
    wrap.innerHTML = "";
    COLORS.forEach((c) => {
      const btn = document.createElement("div");
      btn.className = "swatch" + (state.color === c.id ? " is-selected" : "");
      btn.style.background = c.hex;
      btn.title = c.name;
      btn.addEventListener("click", () => {
        state.color = c.id;
        state.colorName = c.name;
        applyShirtColor(c.hex);
        renderColorSwatches();
        updatePayState();
      });
      wrap.appendChild(btn);
    });
    if (!state.color && COLORS.length) {
      state.color = COLORS[0].id;
      state.colorName = COLORS[0].name;
      applyShirtColor(COLORS[0].hex);
      renderColorSwatches();
    }
  }

  function applyShirtColor(hex) {
    ["front", "back"].forEach((side) => {
      const svg = el(`shirtSvg-${side}`);
      if (!svg) return;
      const path = svg.querySelector("path");
      if (path) path.setAttribute("fill", hex);
    });
  }

  function renderSizeButtons() {
    const wrap = el("sizeRow");
    wrap.innerHTML = "";
    SIZES.forEach((s) => {
      const soldOut = (s.stock || 0) <= 0;
      const btn = document.createElement("div");
      btn.className = "size-btn" +
        (state.size === s.size ? " is-selected" : "") +
        (soldOut ? " is-soldout" : "");
      btn.textContent = s.size;
      if (!soldOut) {
        btn.addEventListener("click", () => {
          state.size = s.size;
          renderSizeButtons();
          updatePayState();
        });
      }
      wrap.appendChild(btn);
    });
  }

  // ---------- Side tabs ----------
  el("sideTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".side-tab");
    if (!btn) return;
    state.activeSide = btn.dataset.side;
    document.querySelectorAll(".side-tab").forEach((t) => t.classList.toggle("is-active", t === btn));
    el("canvasWrap-front").hidden = state.activeSide !== "front";
    el("canvasWrap-back").hidden = state.activeSide !== "back";
  });

  // ---------- Print location ----------
  el("printLocationRow").addEventListener("click", (e) => {
    const opt = e.target.closest(".radio-opt");
    if (!opt) return;
    state.printLocation = opt.dataset.value;
    [...el("printLocationRow").children].forEach((c) => c.classList.toggle("is-selected", c === opt));
    const showTabs = state.printLocation === "front-back";
    el("sideTabs").hidden = !showTabs;
    if (!showTabs) {
      state.activeSide = "front";
      document.querySelectorAll(".side-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.side === "front"));
      el("canvasWrap-front").hidden = false;
      el("canvasWrap-back").hidden = true;
    }
    updatePayState();
  });

  // ---------- Print method ----------
  el("printMethodRow").addEventListener("click", (e) => {
    const opt = e.target.closest(".method-option");
    if (!opt) return;
    state.printMethod = opt.dataset.value;
    [...el("printMethodRow").children].forEach((c) => c.classList.toggle("is-selected", c === opt));
  });

  // ---------- Fulfilment ----------
  el("fulfilRow").addEventListener("click", (e) => {
    const opt = e.target.closest(".radio-opt");
    if (!opt) return;
    state.fulfillment = opt.dataset.value;
    [...el("fulfilRow").children].forEach((c) => c.classList.toggle("is-selected", c === opt));
  });

  // ---------- Upload & drag/resize ----------
  el("uploadBtn").addEventListener("click", () => el("fileInput").click());
  el("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) addLayer(state.activeSide, file);
    e.target.value = "";
  });

  function addLayer(side, file) {
    const reader = new FileReader();
    reader.onload = () => {
      const layer = {
        dataUrl: reader.result,
        x: PRINT_AREA.x + PRINT_AREA.w * 0.1,
        y: PRINT_AREA.y + PRINT_AREA.h * 0.1,
        w: PRINT_AREA.w * 0.8,
        h: PRINT_AREA.h * 0.8,
      };
      state.sides[side].layer = layer;
      state.sides[side].file = file;
      renderLayer(side, layer);
      updatePayState();
    };
    reader.readAsDataURL(file);
  }

  function removeLayer(side) {
    state.sides[side].layer = null;
    state.sides[side].file = null;
    const wrap = el(`canvasWrap-${side}`);
    const existing = wrap.querySelector(".design-layer");
    if (existing) existing.remove();
    updatePayState();
  }

  function renderLayer(side, layer) {
    const wrap = el(`canvasWrap-${side}`);
    let node = wrap.querySelector(".design-layer");
    if (!node) {
      node = document.createElement("div");
      node.className = "design-layer";
      node.innerHTML = `<img src="${layer.dataUrl}" draggable="false" />
        <div class="layer-remove">&times;</div>
        <div class="layer-handle"></div>`;
      wrap.appendChild(node);
      makeDraggable(node, side, layer, node.querySelector(".layer-handle"));
      node.querySelector(".layer-remove").addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeLayer(side);
      });
    } else {
      node.querySelector("img").src = layer.dataUrl;
    }
    positionLayerNode(node, layer);
  }

  function positionLayerNode(node, layer) {
    node.style.left = (layer.x / CANVAS_W) * 100 + "%";
    node.style.top = (layer.y / CANVAS_H) * 100 + "%";
    node.style.width = (layer.w / CANVAS_W) * 100 + "%";
    node.style.height = (layer.h / CANVAS_H) * 100 + "%";
  }

  function makeDraggable(nodeEl, side, layer, handle) {
    let mode = null;
    let start = {};

    nodeEl.addEventListener("pointerdown", (e) => {
      if (e.target === handle) return;
      mode = "drag";
      nodeEl.classList.add("is-dragging");
      nodeEl.setPointerCapture(e.pointerId);
      start = { px: e.clientX, py: e.clientY, x: layer.x, y: layer.y };
    });

    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      mode = "resize";
      nodeEl.setPointerCapture(e.pointerId);
      start = { px: e.clientX, py: e.clientY, w: layer.w, h: layer.h };
    });

    nodeEl.addEventListener("pointermove", (e) => {
      if (!mode) return;
      const rect = nodeEl.closest(".canvas-wrap").getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const dx = (e.clientX - start.px) * scaleX;
      const dy = (e.clientY - start.py) * scaleY;

      if (mode === "drag") {
        layer.x = Math.max(0, Math.min(CANVAS_W - layer.w, start.x + dx));
        layer.y = Math.max(0, Math.min(CANVAS_H - layer.h, start.y + dy));
      } else if (mode === "resize") {
        layer.w = Math.max(30, Math.min(CANVAS_W - layer.x, start.w + dx));
        layer.h = Math.max(30, Math.min(CANVAS_H - layer.y, start.h + dy));
      }
      positionLayerNode(nodeEl, layer);
    });

    const endDrag = () => {
      mode = null;
      nodeEl.classList.remove("is-dragging");
    };
    nodeEl.addEventListener("pointerup", endDrag);
    nodeEl.addEventListener("pointercancel", endDrag);
  }

  // ---------- Composite preview ----------
  function buildCompositePreview(side) {
    return new Promise((resolve) => {
      const layer = state.sides[side].layer;
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_W * EXPORT_SCALE;
      canvas.height = CANVAS_H * EXPORT_SCALE;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const svg = el(`shirtSvg-${side}`);
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgImg = new Image();
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      svgImg.onload = () => {
        ctx.drawImage(svgImg, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(svgUrl);

        if (!layer) {
          resolve(canvas.toDataURL("image/png"));
          return;
        }
        const designImg = new Image();
        designImg.onload = () => {
          ctx.drawImage(
            designImg,
            layer.x * EXPORT_SCALE,
            layer.y * EXPORT_SCALE,
            layer.w * EXPORT_SCALE,
            layer.h * EXPORT_SCALE
          );
          resolve(canvas.toDataURL("image/png"));
        };
        designImg.src = layer.dataUrl;
      };
      svgImg.src = svgUrl;
    });
  }

  // ---------- Price / pay state ----------
  function updatePayState() {
    el("priceAmount").textContent = "£" + FLAT_PRICE;

    const frontReady = !!state.sides.front.layer;
    const backReady = state.printLocation === "front-back" ? !!state.sides.back.layer : true;
    const needsBoth = state.printLocation === "front-back";

    const payBtn = el("payBtn");
    if (!frontReady) {
      payBtn.disabled = true;
      payBtn.textContent = "Upload a design to continue";
    } else if (needsBoth && !backReady) {
      payBtn.disabled = true;
      payBtn.textContent = "Upload a back design to continue";
    } else if (!state.color) {
      payBtn.disabled = true;
      payBtn.textContent = "Choose a colour";
    } else if (!state.size) {
      payBtn.disabled = true;
      payBtn.textContent = "Choose a size";
    } else {
      payBtn.disabled = false;
      payBtn.textContent = `Pay £${FLAT_PRICE} & order`;
    }
  }

  // ---------- Checkout ----------
  el("payBtn").addEventListener("click", async () => {
    const payBtn = el("payBtn");
    payBtn.disabled = true;
    payBtn.textContent = "Preparing your order...";

    try {
      const frontPreview = await buildCompositePreview("front");
      const backPreview = state.printLocation === "front-back" ? await buildCompositePreview("back") : null;

      const body = {
        color: state.color,
        size: state.size,
        printLocation: state.printLocation,
        printMethod: state.printMethod,
        fulfillment: state.fulfillment,
        sides: {
          front: { artwork: state.sides.front.layer.dataUrl, preview: frontPreview, position: state.sides.front.layer },
          back: state.sides.back.layer
            ? { artwork: state.sides.back.layer.dataUrl, preview: backPreview, position: state.sides.back.layer }
            : null,
        },
      };

      const saveRes = await fetch("/api/save-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || "Could not save your design");

      const checkoutRes = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: saveData.designId, fulfillment: state.fulfillment }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkoutData.error || "Could not start checkout");

      window.location.href = checkoutData.checkoutUrl;
    } catch (err) {
      alert(err.message || "Something went wrong — please try again.");
      updatePayState();
    }
  });

  // ---------- Init ----------
  placePrintGuide("front");
  placePrintGuide("back");
  loadSettings();
  updatePayState();
})();
