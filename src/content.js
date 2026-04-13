(() => {
  if (globalThis.__llmTranslatorContentLoaded) {
    return;
  }
  globalThis.__llmTranslatorContentLoaded = true;

  let resultPanel;
  let selectionLayer;

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
      hideResultPanel();
      sendResponse({ ok: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      removeSelectionLayer();
      hideResultPanel();
    }
  });

  function showTranslation(payload) {
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
        <div class="llmt-panel__source"></div>
        <div class="llmt-panel__translation"></div>
      `;
      resultPanel
        .querySelector(".llmt-panel__close")
        .addEventListener("click", hideResultPanel);
      resultPanel.querySelector(".llmt-panel__side").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "open-side-panel" });
        hideResultPanel();
      });
      document.documentElement.append(resultPanel);
    }

    resultPanel.querySelector(".llmt-panel__title").textContent = payload.title || "Translation";
    resultPanel.querySelector(".llmt-panel__source").textContent = payload.source || "";
    resultPanel.querySelector(".llmt-panel__translation").innerHTML =
      globalThis.LLMTranslatorMarkdown.renderMarkdown(payload.translation || "");

    const imageWrap = resultPanel.querySelector(".llmt-panel__image-wrap");
    imageWrap.innerHTML = "";
    if (payload.imageUrl) {
      const image = document.createElement("img");
      image.src = payload.imageUrl;
      image.alt = "Selected region";
      imageWrap.append(image);
    }

    resultPanel.hidden = false;
  }

  function hideResultPanel() {
    if (resultPanel) {
      resultPanel.hidden = true;
    }
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
})();
