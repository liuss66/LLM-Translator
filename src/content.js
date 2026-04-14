(() => {
  if (globalThis.__llmTranslatorContentLoaded) {
    return;
  }
  globalThis.__llmTranslatorContentLoaded = true;

  let resultPanel;
  let selectionLayer;
  let currentResultRunId = "";
  let dismissedResultRunId = "";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ping") {
      sendResponse({
        ok: true,
        hasMarkdown: Boolean(globalThis.LLMTranslatorMarkdown?.renderMarkdown),
        hasKatex: Boolean(globalThis.katex?.renderToString)
      });
      return;
    }

    if (message?.type === "show-translation") {
      showTranslation(message.payload);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "start-region-selection") {
      startRegionSelection();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "hide-translation") {
      hideResultPanel({ dismissCurrentRun: true });
      sendResponse({ ok: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.querySelector(".llmt-image-preview")) {
        closeImagePreview();
        return;
      }
      removeSelectionLayer();
      hideResultPanel({ dismissCurrentRun: true });
    }
  });

  function showTranslation(payload) {
    const runId = getResultRunId(payload);
    if (runId && runId === dismissedResultRunId) {
      return;
    }
    currentResultRunId = runId;

    if (!resultPanel) {
      resultPanel = document.createElement("aside");
      resultPanel.className = "llmt-panel";
      resultPanel.innerHTML = `
        <div class="llmt-panel__header">
          <strong class="llmt-panel__title"></strong>
          <div class="llmt-panel__header-actions">
            <button class="llmt-panel__side" type="button">Side panel</button>
            <button class="llmt-panel__close" type="button" aria-label="Close">×</button>
          </div>
        </div>
        <div class="llmt-panel__image-wrap"></div>
        <div class="llmt-panel__translation-wrap">
          <div class="llmt-panel__translation-label">Translation</div>
          <div class="llmt-panel__translation"></div>
        </div>
        <div class="llmt-panel__meta"></div>
      `;
      resultPanel
        .querySelector(".llmt-panel__close")
        .addEventListener("click", () => hideResultPanel({ dismissCurrentRun: true }));
      resultPanel.querySelector(".llmt-panel__side").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "open-side-panel" });
        hideResultPanel({ dismissCurrentRun: true });
      });
      document.documentElement.append(resultPanel);
    }

    resultPanel.querySelector(".llmt-panel__title").innerHTML =
      'LLM Translator <span class="brand-mark">@Liuss</span>';
    resultPanel.querySelector(".llmt-panel__meta").textContent = formatMeta(payload);
    resultPanel.querySelector(".llmt-panel__translation").innerHTML =
      globalThis.LLMTranslatorMarkdown.renderMarkdown(payload.translation || "");

    const imageWrap = resultPanel.querySelector(".llmt-panel__image-wrap");
    imageWrap.innerHTML = "";
    if (payload.imageUrl && payload.showInputImage) {
      const image = document.createElement("img");
      image.src = payload.imageUrl;
      image.alt = "Selected region";
      image.title = "Click to preview";
      image.addEventListener("click", () => openImagePreview(payload.imageUrl, payload.originalImageUrl));
      imageWrap.append(image);
    }

    resultPanel.hidden = false;
  }

  function formatMeta(payload) {
    const parts = [];
    if (payload.elapsedMs !== undefined) {
      parts.push(`用时 ${formatDuration(payload.elapsedMs)}`);
    } else if (payload.startedAt) {
      parts.push("计时中");
    }
    if (payload.isStreaming) {
      parts.push("流式输出中");
    }
    if (payload.imageInfo?.cropInfo?.cropped) {
      const crop = payload.imageInfo.cropInfo;
      parts.push(`裁剪 ${crop.originalWidth}x${crop.originalHeight} -> ${crop.width}x${crop.height}${formatCropMargins(crop)}`);
    } else if (payload.imageInfo?.cropInfo?.reason) {
      parts.push(`未裁剪: ${payload.imageInfo.cropInfo.reason}`);
    }
    return parts.join(" · ");
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, milliseconds / 1000);
    if (totalSeconds < 10) return `${totalSeconds.toFixed(1)}s`;
    return `${Math.round(totalSeconds)}s`;
  }

  function formatCropMargins(cropInfo) {
    const left = Number(cropInfo.left || 0);
    const right = Number(cropInfo.right || 0);
    if (left <= 0 && right <= 0) return "";
    return ` (L${left}px R${right}px)`;
  }

  function hideResultPanel({ dismissCurrentRun = false } = {}) {
    if (resultPanel) {
      resultPanel.hidden = true;
    }
    if (dismissCurrentRun && currentResultRunId) {
      dismissedResultRunId = currentResultRunId;
      chrome.runtime.sendMessage({ type: "floating-panel-closed", runId: currentResultRunId }).catch(() => {});
    }
  }

  function getResultRunId(payload) {
    if (payload?.startedAt) {
      return String(payload.startedAt);
    }
    return "";
  }

  function startRegionSelection() {
    removeSelectionLayer();

    selectionLayer = document.createElement("div");
    selectionLayer.className = "llmt-selection-layer";
    selectionLayer.innerHTML = `
      <div class="llmt-selection-layer__hint">Drag to select text or image area. Press Esc to cancel.</div>
      <div class="llmt-selection-box"></div>
    `;
    document.documentElement.append(selectionLayer);

    const box = selectionLayer.querySelector(".llmt-selection-box");
    let startX = 0;
    let startY = 0;
    let currentRect = null;

    selectionLayer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      selectionLayer.setPointerCapture(event.pointerId);
      startX = event.clientX;
      startY = event.clientY;
      currentRect = null;
      updateBox(box, startX, startY, 0, 0);
    });

    selectionLayer.addEventListener("pointermove", (event) => {
      if (!selectionLayer.hasPointerCapture(event.pointerId)) return;
      event.preventDefault();
      const x = Math.min(startX, event.clientX);
      const y = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);
      currentRect = { x, y, width, height };
      updateBox(box, x, y, width, height);
    });

    selectionLayer.addEventListener("pointerup", (event) => {
      if (!selectionLayer.hasPointerCapture(event.pointerId)) return;
      selectionLayer.releasePointerCapture(event.pointerId);
      event.preventDefault();

      if (!currentRect || currentRect.width < 8 || currentRect.height < 8) {
        removeSelectionLayer();
        return;
      }

      const rect = {
        ...currentRect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      };
      removeSelectionLayer();
      chrome.runtime.sendMessage({ type: "region-selected", rect });
    });
  }

  function updateBox(box, x, y, width, height) {
    box.style.transform = `translate(${x}px, ${y}px)`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  }

  function removeSelectionLayer() {
    if (selectionLayer) {
      selectionLayer.remove();
      selectionLayer = null;
    }
  }

  function openImagePreview(imageUrl, originalImageUrl = "") {
    if (!imageUrl) return;
    closeImagePreview();

    const preview = document.createElement("div");
    preview.className = "llmt-image-preview";
    preview.setAttribute("role", "dialog");
    preview.setAttribute("aria-modal", "true");
    preview.setAttribute("aria-label", "Input image preview");
    const hasComparison = Boolean(originalImageUrl && originalImageUrl !== imageUrl);
    preview.innerHTML = hasComparison
      ? `
        <button class="llmt-image-preview__close" type="button" aria-label="Close image preview">×</button>
        <div class="llmt-image-preview__grid">
          <figure>
            <figcaption>Before crop</figcaption>
            <img data-role="original" alt="Original page screenshot">
          </figure>
          <figure>
            <figcaption>Input image</figcaption>
            <img data-role="input" alt="Input image preview">
          </figure>
        </div>
      `
      : `
        <button class="llmt-image-preview__close" type="button" aria-label="Close image preview">×</button>
        <img data-role="input" alt="Input image preview">
      `;
    preview.querySelector('[data-role="input"]').src = imageUrl;
    if (hasComparison) {
      preview.querySelector('[data-role="original"]').src = originalImageUrl;
    }
    preview.addEventListener("click", closeImagePreview);
    preview.querySelectorAll("img").forEach((image) => {
      image.addEventListener("click", (event) => event.stopPropagation());
    });
    preview.querySelector(".llmt-image-preview__grid")?.addEventListener("click", (event) => event.stopPropagation());
    preview.querySelector(".llmt-image-preview__close").addEventListener("click", closeImagePreview);
    document.documentElement.append(preview);
    preview.querySelector(".llmt-image-preview__close").focus();
  }

  function closeImagePreview() {
    document.querySelector(".llmt-image-preview")?.remove();
  }
})();
