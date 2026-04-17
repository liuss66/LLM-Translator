(() => {
  if (globalThis.__llmTranslatorContentLoaded) {
    return;
  }
  globalThis.__llmTranslatorContentLoaded = true;

  let resultPanel;
  let selectionLayer;
  let currentResultRunId = "";
  let dismissedResultRunId = "";
  let currentThemeColor = "#2da44e";

  chrome.storage.sync
    .get({ themeColor: "#2da44e" })
    .then(({ themeColor }) => {
      currentThemeColor = normalizeThemeColor(themeColor);
      applyThemeColor(resultPanel, currentThemeColor);
      applyThemeColor(selectionLayer, currentThemeColor);
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.themeColor) return;
    currentThemeColor = normalizeThemeColor(changes.themeColor.newValue);
    applyThemeColor(resultPanel, currentThemeColor);
    applyThemeColor(selectionLayer, currentThemeColor);
  });

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
        <details class="llmt-panel__reasoning" hidden>
          <summary>Thinking</summary>
          <div class="llmt-panel__reasoning-content"></div>
        </details>
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

    applyThemeColor(resultPanel, payload.themeColor || currentThemeColor);
    resultPanel.querySelector(".llmt-panel__title").innerHTML =
      'LLM Translator <span class="brand-mark">@Liuss</span>';
    resultPanel.querySelector(".llmt-panel__meta").innerHTML = formatMeta(payload);
    resultPanel.querySelector(".llmt-panel__translation").innerHTML =
      globalThis.LLMTranslatorMarkdown.renderMarkdown(payload.translation || "");
    const reasoning = resultPanel.querySelector(".llmt-panel__reasoning");
    const reasoningContent = resultPanel.querySelector(".llmt-panel__reasoning-content");
    reasoning.hidden = !payload.reasoning;
    if (payload.reasoning) {
      reasoningContent.innerHTML = globalThis.LLMTranslatorMarkdown.renderMarkdown(payload.reasoning);
    } else {
      reasoningContent.textContent = "";
    }

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
    const metrics = payload.metrics || {};
    const elapsedMs =
      metrics.elapsedMs ??
      payload.elapsedMs ??
      (payload.startedAt ? Date.now() - new Date(payload.startedAt).getTime() : undefined);
    if (elapsedMs !== undefined) parts.push(formatMetric("T", formatDuration(elapsedMs)));
    const detailParts = [];
    if (metrics.ttftMs !== undefined) detailParts.push(formatMetric("TTFT", formatDuration(metrics.ttftMs)));
    if (metrics.tokensPerSecond !== undefined) detailParts.push(formatMetric("TPS", formatRate(metrics.tokensPerSecond)));
    const tokenSummary = formatTokenSummary(metrics, detailParts);
    if (tokenSummary) parts.push(tokenSummary);
    if (payload.isStreaming) {
      parts.push('<span class="llmt-meta__label">Stream</span>');
    }
    return parts.join(" ");
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, milliseconds / 1000);
    if (totalSeconds < 10) return `${totalSeconds.toFixed(1)}s`;
    return `${Math.round(totalSeconds)}s`;
  }

  function formatRate(value) {
    const rate = Number(value || 0);
    if (!Number.isFinite(rate) || rate <= 0) return "-";
    if (rate < 10) return rate.toFixed(1);
    return String(Math.round(rate));
  }

  function formatTokens(value) {
    const tokens = Number(value || 0);
    if (!Number.isFinite(tokens) || tokens <= 0) return "-";
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}k`;
    return `${Math.round(tokens)}`;
  }

  function formatTokenSummary(metrics, detailParts = []) {
    if (metrics.inputTokens === undefined && metrics.outputTokens === undefined) return "";
    const input = Number(metrics.inputTokens || 0);
    const output = Number(metrics.outputTokens || 0);
    const reasoning = Number(metrics.reasoningTokens || 0);
    const total = formatTokens(input + output);
    const up = formatTokens(input);
    const down = formatTokens(output);
    const hiddenDetails = [
      ...detailParts,
      `<span class="llmt-meta__arrow">↑</span><span class="llmt-meta__value">${up}</span>`,
      `<span class="llmt-meta__arrow">↓</span><span class="llmt-meta__value">${down}</span>`
    ];
    if (reasoning > 0) {
      hiddenDetails.push(
        `<span class="llmt-meta__label">R:</span><span class="llmt-meta__value">${formatTokens(reasoning)}</span>`
      );
    }
    return `<span class="llmt-meta__label">Tokens:</span><span class="llmt-meta__value">${total}</span><span class="llmt-meta__details"> ${hiddenDetails.join(" ")}</span>`;
  }

  function formatMetric(label, value) {
    return `<span class="llmt-meta__label">${label}:</span><span class="llmt-meta__value">${value}</span>`;
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
    applyThemeColor(selectionLayer, currentThemeColor);

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

  function normalizeThemeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#2da44e";
  }

  function applyThemeColor(element, value) {
    element?.style.setProperty("--llmt-theme-color", normalizeThemeColor(value));
  }
})();
