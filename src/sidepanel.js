const image = document.querySelector("#result-image");
const translation = document.querySelector("#result-translation");
const copyTranslation = document.querySelector("#copy-translation");
const resultReasoning = document.querySelector("#result-reasoning");
const resultReasoningContent = document.querySelector("#result-reasoning-content");
const status = document.querySelector("#status");
const replyArea = document.querySelector(".reply-area");
const chatSection = document.querySelector(".chat");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const stopAction = document.querySelector("#stop-action");
const configPanel = document.querySelector(".config-panel");
const toggleConfig = document.querySelector("#toggle-config");
const showOcrResult = document.querySelector("#show-ocr-result");
const showInputImage = document.querySelector("#show-input-image");
const compressInputImage = document.querySelector("#compress-input-image");
const imageMaxEdge = document.querySelector("#image-max-edge");
const imageJpegQuality = document.querySelector("#image-jpeg-quality");
const enableThinking = document.querySelector("#enable-thinking");
const cropPageMargins = document.querySelector("#crop-page-margins");
const modelPreset = document.querySelector("#model-preset");
let chatHistory = [];
let hasScreenshotContext = false;
let currentResult = null;
let currentImageUrl = "";
let elapsedTimer = 0;
let stickyStatus = "";
let stickyStatusIsHtml = false;
const activeChatStreams = new Map();

chrome.runtime.connect({ name: "sidepanel" });
setChatEnabled(false);
loadUiState();
loadSettings();
loadLastResult();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "last-result-updated") {
    renderResult(message.result);
  }
  if (message?.type === "chat-stream-updated") {
    updateChatStream(message);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.showOcrResult) {
    showOcrResult.checked = Boolean(changes.showOcrResult.newValue);
  }
  if (areaName === "sync" && changes.showInputImage) {
    showInputImage.checked = Boolean(changes.showInputImage.newValue);
    if (currentResult) renderResult(currentResult);
  }
  if (areaName === "sync" && changes.compressInputImage) {
    compressInputImage.checked = Boolean(changes.compressInputImage.newValue);
  }
  if (areaName === "sync" && changes.imageMaxEdge) {
    imageMaxEdge.value = changes.imageMaxEdge.newValue;
  }
  if (areaName === "sync" && changes.imageJpegQuality) {
    imageJpegQuality.value = changes.imageJpegQuality.newValue;
  }
  if (areaName === "sync" && changes.enableThinking) {
    enableThinking.checked = Boolean(changes.enableThinking.newValue);
  }
  if (areaName === "sync" && changes.cropPageMargins) {
    cropPageMargins.checked = changes.cropPageMargins.newValue !== false;
  }
  if (
    areaName === "sync" &&
    (changes.modelPresets || changes.currentPresetId || changes.provider || changes.textModel)
  ) {
    loadSettings();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeImagePreview();
});

document.querySelector("#translate-selection").addEventListener("click", async () => {
  status.textContent = "Reading selected text...";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    const text = await readSelectedTextWithClipboardFallback(tab.id);
    await sendAction(
      { type: "translate-active-selection", text },
      text ? "Translating selected text..." : "No selected text found."
    );
  } catch (error) {
    status.textContent = error.message || "Failed to read selected text.";
  }
});

document.querySelector("#translate-region").addEventListener("click", async () => {
  await sendAction({ type: "start-region-selection" }, "Select an area in the active tab.");
});

document.querySelector("#translate-page").addEventListener("click", async () => {
  await sendAction({ type: "translate-current-page" }, "Translating current visible page...");
});

copyTranslation.addEventListener("click", async () => {
  await copyText(currentResult?.translation || translation.innerText || "", copyTranslation);
});

stopAction.addEventListener("click", async () => {
  stopAction.disabled = true;
  status.textContent = "Cancelling...";
  await chrome.runtime.sendMessage({ type: "cancel-current-request" }).catch(() => {});
});

document.querySelector("#open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

toggleConfig.addEventListener("click", async () => {
  const collapsed = !configPanel.classList.contains("is-collapsed");
  setConfigCollapsed(collapsed);
  await chrome.storage.local.set({ sidePanelConfigCollapsed: collapsed });
});

showOcrResult.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { showOcrResult: showOcrResult.checked }
  });
});

showInputImage.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { showInputImage: showInputImage.checked }
  });
  if (currentResult) renderResult(currentResult);
});

enableThinking.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { enableThinking: enableThinking.checked }
  });
});

compressInputImage.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { compressInputImage: compressInputImage.checked }
  });
});

cropPageMargins.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { cropPageMargins: cropPageMargins.checked }
  });
});

imageMaxEdge.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { imageMaxEdge: clampInteger(imageMaxEdge.value, 320, 4096, 1600) }
  });
});

imageJpegQuality.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { imageJpegQuality: clampNumber(imageJpegQuality.value, 0.5, 1, 0.88) }
  });
});

modelPreset.addEventListener("change", async () => {
  const presetId = modelPreset.value;
  status.textContent = "";
  if (!presetId) {
    chrome.runtime.openOptionsPage();
    return;
  }
  status.textContent = "Testing model...";
  modelPreset.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "switch-model-preset",
      presetId
    });
    if (!response?.ok) throw new Error(response?.error || "Model preset is unavailable.");
    status.textContent = "切换成功";
    modelPreset.value = presetId;
  } catch (error) {
    const message = error.message || "Model preset is unavailable.";
    await loadSettings();
    status.textContent = message;
  } finally {
    modelPreset.disabled = false;
  }
});

modelPreset.addEventListener("click", () => {
  if (modelPreset.options.length === 1 && modelPreset.options[0].value === "") {
    chrome.runtime.openOptionsPage();
  }
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;
  if (!hasScreenshotContext) {
    status.textContent = "Run screenshot translation first.";
    return;
  }

  chatInput.value = "";
  const historyForRequest = chatHistory.slice();
  const requestId = createRequestId();
  appendChatMessage("user", question);
  const assistantMessage = appendChatMessage("assistant", "");
  activeChatStreams.set(requestId, assistantMessage);
  updateStopVisibility();
  status.textContent = "Asking model...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ask-last-screenshot",
      question,
      history: historyForRequest,
      requestId
    });
    if (!response?.ok) throw new Error(response?.error || "Question failed.");
    setChatMessageContent(assistantMessage, response.answer || "", { reasoning: response.reasoning || "" });
    status.textContent = response.elapsedMs !== undefined ? `T:${formatDuration(response.elapsedMs)}` : "";
  } catch (error) {
    status.textContent = error.message || "Question failed.";
    setChatMessageContent(assistantMessage, status.textContent);
  } finally {
    activeChatStreams.delete(requestId);
    updateStopVisibility();
  }
});

async function loadLastResult() {
  const response = await chrome.runtime.sendMessage({ type: "get-last-result" });
  if (response?.result) {
    renderResult(response.result);
  }
}

async function loadUiState() {
  const { sidePanelConfigCollapsed } = await chrome.storage.local.get("sidePanelConfigCollapsed");
  setConfigCollapsed(Boolean(sidePanelConfigCollapsed));
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "get-settings" });
  const settings = response?.settings || {};
  showOcrResult.checked = Boolean(settings.showOcrResult);
  showInputImage.checked = Boolean(settings.showInputImage);
  compressInputImage.checked = settings.compressInputImage !== false;
  cropPageMargins.checked = settings.cropPageMargins !== false;
  imageMaxEdge.value = settings.imageMaxEdge || 1600;
  imageJpegQuality.value = settings.imageJpegQuality || 0.88;
  enableThinking.checked = Boolean(settings.enableThinking);
  renderPresetOptions(settings);
}

function renderPresetOptions(settings) {
  const presets = settings.modelPresets || [];
  const currentValue = resolveActivePresetId(settings, presets);
  modelPreset.innerHTML = "";
  if (presets.length === 0) {
    modelPreset.innerHTML = '<option value="">New Preset</option>';
    return;
  }
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name || preset.textModel || "Unnamed";
    modelPreset.append(option);
  });
  modelPreset.value = currentValue;
}

function resolveActivePresetId(settings, presets) {
  if (settings.currentPresetId && presets.some((preset) => preset.id === settings.currentPresetId)) {
    return settings.currentPresetId;
  }
  const matched = presets.find((preset) => presetMatchesSettings(preset, settings));
  return matched?.id || "";
}

function presetMatchesSettings(preset, settings) {
  const keys = [
    "provider",
    "apiBaseUrl",
    "textModel",
    "visionModel",
    "enableThinking",
    "thinkingEffort",
    "thinkingBudgetTokens",
    "thinkingFieldPreset",
    "thinkingRequestFields",
    "systemPrompt"
  ];
  return keys.every((key) => normalizePresetValue(preset[key]) === normalizePresetValue(settings[key]));
}

function normalizePresetValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "").trim();
}

async function readSelectedTextWithClipboardFallback(tabId) {
  const selectedText = await readSelectedTextFromTab(tabId).catch(() => "");
  if (selectedText) return selectedText;

  const [{ result: copied } = {}] = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => document.execCommand?.("copy") || false
    })
    .catch(() => [{ result: false }]);
  if (!copied) return "";

  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    return "";
  }
}

async function readSelectedTextFromTab(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectSelectedText
  });
  return result || "";
}

function collectSelectedText() {
  const seen = new Set();
  const parts = [];
  const add = (value) => {
    const text = String(value || "").trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      parts.push(text);
    }
  };
  const readRoot = (root) => {
    try {
      add(root.getSelection?.().toString());
    } catch {}
    try {
      const active = root.activeElement;
      if (
        active &&
        typeof active.value === "string" &&
        Number.isInteger(active.selectionStart) &&
        Number.isInteger(active.selectionEnd) &&
        active.selectionEnd > active.selectionStart
      ) {
        add(active.value.slice(active.selectionStart, active.selectionEnd));
      }
    } catch {}
    let elements = [];
    try {
      elements = Array.from(root.querySelectorAll?.("*") || []);
    } catch {}
    for (const element of elements) {
      if (element.shadowRoot) readRoot(element.shadowRoot);
      if (element.tagName === "IFRAME") {
        try {
          if (element.contentDocument) readRoot(element.contentDocument);
        } catch {}
      }
    }
  };
  readRoot(document);
  return parts.join("\n\n");
}

function setConfigCollapsed(collapsed) {
  configPanel.classList.toggle("is-collapsed", collapsed);
  toggleConfig.textContent = collapsed ? "Expand" : "Collapse";
  toggleConfig.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

async function sendAction(message, pendingText) {
  status.textContent = pendingText;
  updateStopVisibility(true);
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Action failed.");
  } catch (error) {
    status.textContent = error.message || "Action failed.";
    return;
  } finally {
    updateStopVisibility(false);
  }
  setTimeout(() => {
    restoreStickyStatus();
  }, 1200);
}

function renderResult(result) {
  const nextImageUrl = result?.imageUrl || "";
  const isNewScreenshotContext = Boolean(nextImageUrl && nextImageUrl !== currentImageUrl);
  currentResult = result || null;
  currentImageUrl = nextImageUrl;
  renderResultStatus(result);
  copyTranslation.hidden = Boolean(result?.isStreaming || !result?.translation);
  translation.innerHTML = globalThis.LLMTranslatorMarkdown.renderMarkdown(result?.translation || "");
  resultReasoning.hidden = !result?.reasoning;
  resultReasoningContent.innerHTML = result?.reasoning
    ? globalThis.LLMTranslatorMarkdown.renderMarkdown(result.reasoning)
    : "";
  updateStopVisibility();

  image.innerHTML = "";
  hasScreenshotContext = Boolean(result?.imageUrl);
  setChatEnabled(hasScreenshotContext);

  if (result?.imageUrl && showInputImage.checked) {
    const img = document.createElement("img");
    img.src = result.imageUrl;
    img.alt = "Selected region";
    img.title = "Click to preview";
    img.addEventListener("click", () => openImagePreview(result.imageUrl, result.originalImageUrl));
    image.append(img);
  }

  if (isNewScreenshotContext) {
    chatHistory = [];
    chatLog.innerHTML = "";
    setChatVisible(false);
  } else if (!nextImageUrl) {
    chatHistory = [];
    chatLog.innerHTML = "";
    setChatVisible(false);
  }
}

function renderResultStatus(result) {
  stopElapsedTimer();
  if (!result) {
    setStatus("");
    return;
  }

  const updateStatus = () => {
    const parts = [];
    const metrics = result.metrics || {};
    const elapsedMs =
      metrics.elapsedMs ??
      result.elapsedMs ??
      (result.startedAt ? Date.now() - new Date(result.startedAt).getTime() : undefined);
    if (elapsedMs !== undefined) parts.push(formatMetric("T", formatDuration(elapsedMs)));
    if (metrics.ttftMs !== undefined) parts.push(formatMetric("TTFT", formatDuration(metrics.ttftMs)));
    if (metrics.tokensPerSecond !== undefined) parts.push(formatMetric("TPS", formatRate(metrics.tokensPerSecond)));
    const tokenSummary = formatTokenSummary(metrics);
    if (tokenSummary) parts.push(tokenSummary);
    if (result.isStreaming) {
      parts.push('<span class="status-metric__label">Stream</span>');
    }
    setStatus(parts.join(" "), { html: true });
  };

  updateStatus();
  if (result.startedAt && result.elapsedMs === undefined) {
    elapsedTimer = setInterval(updateStatus, 250);
  }
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = 0;
  }
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

function formatTokenSummary(metrics) {
  if (metrics.inputTokens === undefined && metrics.outputTokens === undefined) return "";
  const input = Number(metrics.inputTokens || 0);
  const output = Number(metrics.outputTokens || 0);
  const reasoning = Number(metrics.reasoningTokens || 0);
  const reasoningPart = reasoning > 0 ? ` <span class="status-metric__label">R:</span><span class="status-metric__value">${formatTokens(reasoning)}</span>` : "";
  return `<span class="status-metric__label">Tokens:</span><span class="status-metric__value">${formatTokens(input + output)}</span> <span class="status-metric__arrow">↑</span><span class="status-metric__value">${formatTokens(input)}</span><span class="status-metric__arrow">↓</span><span class="status-metric__value">${formatTokens(output)}</span>${reasoningPart}`;
}

function formatMetric(label, value) {
  return `<span class="status-metric__label">${label}:</span><span class="status-metric__value">${value}</span>`;
}

function openImagePreview(imageUrl, originalImageUrl = "") {
  if (!imageUrl) return;
  closeImagePreview();

  const preview = document.createElement("div");
  preview.className = "image-preview";
  preview.setAttribute("role", "dialog");
  preview.setAttribute("aria-modal", "true");
  preview.setAttribute("aria-label", "Input image preview");
  const hasComparison = Boolean(originalImageUrl && originalImageUrl !== imageUrl);
  preview.innerHTML = hasComparison
    ? `
      <button class="image-preview__close" type="button" aria-label="Close image preview">×</button>
      <div class="image-preview__grid">
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
      <button class="image-preview__close" type="button" aria-label="Close image preview">×</button>
      <img data-role="input" alt="Input image preview">
    `;
  preview.querySelector('[data-role="input"]').src = imageUrl;
  if (hasComparison) {
    preview.querySelector('[data-role="original"]').src = originalImageUrl;
  }
  preview.addEventListener("click", closeImagePreview);
  preview.querySelectorAll("img").forEach((img) => {
    img.addEventListener("click", (event) => event.stopPropagation());
  });
  preview.querySelector(".image-preview__grid")?.addEventListener("click", (event) => event.stopPropagation());
  preview.querySelector(".image-preview__close").addEventListener("click", closeImagePreview);
  document.body.append(preview);
  preview.querySelector(".image-preview__close").focus();
}

function closeImagePreview() {
  document.querySelector(".image-preview")?.remove();
}

function setStatus(message, options = {}) {
  stickyStatus = message || "";
  stickyStatusIsHtml = Boolean(options.html);
  restoreStickyStatus();
}

function restoreStickyStatus() {
  if (stickyStatusIsHtml) {
    status.innerHTML = stickyStatus;
  } else {
    status.textContent = stickyStatus;
  }
}

function appendChatMessage(role, content) {
  setChatVisible(true);
  chatHistory.push({ role, content });
  const message = document.createElement("article");
  message.className = `chat-message chat-message--${role}`;
  message.innerHTML = `
    <div class="chat-message__header">
      <div class="chat-message__role">${role}</div>
      <button class="copy-button" type="button">Copy</button>
    </div>
    <details class="chat-message__reasoning" hidden>
      <summary>Thinking</summary>
      <div class="chat-message__reasoning-content"></div>
    </details>
    <div class="chat-message__content">${globalThis.LLMTranslatorMarkdown.renderMarkdown(
      content
    )}</div>
  `;
  message.querySelector(".copy-button").addEventListener("click", async () => {
    await copyText(message.dataset.copyText || "", message.querySelector(".copy-button"));
  });
  message.querySelector(".copy-button").hidden = role === "assistant" && !content;
  message.dataset.copyText = content || "";
  chatLog.append(message);
  scrollReplyAreaToBottom();
  return message;
}

function updateChatStream(message) {
  const element = activeChatStreams.get(message.requestId);
  if (!element) return;
  setChatMessageContent(element, message.answer || "", { showCopy: false, reasoning: message.reasoning || "" });
  if (message.startedAt && message.elapsedMs === undefined) {
    status.textContent = `T:${formatDuration(Date.now() - new Date(message.startedAt).getTime())} Stream`;
  }
  updateStopVisibility();
}

function updateStopVisibility(forceVisible) {
  const visible =
    forceVisible === true ||
    Boolean(currentResult?.isStreaming) ||
    activeChatStreams.size > 0;
  stopAction.hidden = !visible;
  stopAction.disabled = false;
}

function setChatMessageContent(message, content, { showCopy = true, reasoning = "" } = {}) {
  const contentElement = message.querySelector(".chat-message__content");
  contentElement.innerHTML = globalThis.LLMTranslatorMarkdown.renderMarkdown(content || "");
  const reasoningElement = message.querySelector(".chat-message__reasoning");
  const reasoningContent = message.querySelector(".chat-message__reasoning-content");
  if (reasoningElement && reasoningContent) {
    reasoningElement.hidden = !reasoning;
    reasoningContent.innerHTML = reasoning ? globalThis.LLMTranslatorMarkdown.renderMarkdown(reasoning) : "";
  }
  message.dataset.copyText = content || "";
  message.querySelector(".copy-button").hidden = !showCopy || !content;
  const lastHistoryItem = chatHistory[chatHistory.length - 1];
  if (lastHistoryItem?.role === "assistant") {
    lastHistoryItem.content = content || "";
  }
  scrollReplyAreaToBottom();
}

function createRequestId() {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function scrollReplyAreaToBottom() {
  replyArea.scrollTop = replyArea.scrollHeight;
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampNumber(value, min, max, fallback) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function setChatEnabled(enabled) {
  chatForm.setAttribute("aria-disabled", enabled ? "false" : "true");
  chatInput.disabled = !enabled;
  chatForm.querySelector("button").disabled = !enabled;
}

function setChatVisible(visible) {
  chatSection.hidden = !visible;
}

async function copyText(text, button) {
  const value = String(text || "").trim();
  if (!value) {
    status.textContent = "Nothing to copy.";
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showCopyState(button, "Copied");
  } catch {
    status.textContent = "Copy failed.";
  }
}

function showCopyState(button, label) {
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 900);
}
